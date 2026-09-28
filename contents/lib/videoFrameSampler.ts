// The shader only needs a rough color map, not a full-resolution video texture.
export const FRAME_INTERVAL_MS = 1000 / 30; // Fallback for browsers without video frame callbacks.
export const FRAME_TRANSITION_MS = 8;
const SAMPLE_WIDTH = 128;
const SAMPLE_HEIGHT = 72;
const COLOR_RESPONSE_MS = 65;

// Smooth the color history itself. Long Kawarp crossfades cannot overlap safely:
// each texture upload swaps their endpoints, which can produce visible jumps.
export const smoothVideoPixels = (
  pixels: Uint8ClampedArray,
  previous: Float32Array | null,
  elapsedMs: number
): Float32Array => {
  if (!previous || previous.length !== pixels.length) return new Float32Array(pixels);
  const amount = 1 - Math.exp(-Math.max(0, elapsedMs) / COLOR_RESPONSE_MS);
  for (let i = 0; i < pixels.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      previous[i + channel] += (pixels[i + channel] - previous[i + channel]) * amount;
      pixels[i + channel] = previous[i + channel];
    }
    previous[i + 3] = pixels[i + 3];
  }
  return previous;
};

export interface VideoFrameSample {
  pixels: ImageData;
}

interface SamplerOptions {
  getVideo: () => HTMLVideoElement | null;
  isActive: () => boolean;
  onFrame: (frame: VideoFrameSample) => void;
  onUnavailable: () => void;
}

export const startVideoFrameSampler = (options: SamplerOptions): (() => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let video: HTMLVideoElement | null = null;
  let source = "";
  let mediaTime = -1;
  let frame: VideoFrameSample | null = null;
  let blocked = false;
  let callbackId: number | null = null;
  let stopped = false;
  let colorHistory: Float32Array | null = null;
  let lastSampleTime = 0;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let downsampleStages: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }[] = [];

  const prepareDownsampleStages = (width: number, height: number) => {
    if (width === sourceWidth && height === sourceHeight) return;
    sourceWidth = width;
    sourceHeight = height;
    downsampleStages = [];
    // Limit each reduction to roughly 2x. A single large video -> tiny canvas
    // reduction can skip fine detail rather than averaging it, causing shimmer.
    while (width > SAMPLE_WIDTH * 2 || height > SAMPLE_HEIGHT * 2) {
      width = Math.max(SAMPLE_WIDTH, Math.ceil(width / 2));
      height = Math.max(SAMPLE_HEIGHT, Math.ceil(height / 2));
      const stage = document.createElement("canvas");
      stage.width = width;
      stage.height = height;
      const stageContext = stage.getContext("2d");
      if (!stageContext) break;
      stageContext.imageSmoothingEnabled = true;
      stageContext.imageSmoothingQuality = "high";
      downsampleStages.push({ canvas: stage, context: stageContext });
    }
  };

  const cancelFrameCallback = () => {
    if (callbackId !== null) video?.cancelVideoFrameCallback(callbackId);
    callbackId = null;
  };

  const sample = (newFrame = false) => {
    if (stopped) return;
    if (!options.isActive()) {
      cancelFrameCallback();
      return;
    }

    const nextVideo = options.getVideo();
    const nextSource = nextVideo?.currentSrc ?? "";
    if (video !== nextVideo || source !== nextSource) {
      cancelFrameCallback();
      video = nextVideo;
      source = nextSource;
      mediaTime = -1;
      frame = null;
      blocked = false;
      colorHistory = null;
      sourceWidth = 0;
      sourceHeight = 0;
      downsampleStages = [];
      // Resizing also clears the origin-tainted flag after a blocked source.
      canvas.width = SAMPLE_WIDTH;
    }

    if (!context || !video || blocked || video.error || video.videoWidth === 0 || video.videoHeight === 0) {
      cancelFrameCallback();
      options.onUnavailable();
      return;
    }
    const supportsFrameCallback = typeof video.requestVideoFrameCallback === "function";
    if (supportsFrameCallback && callbackId === null) {
      callbackId = video.requestVideoFrameCallback(() => {
        callbackId = null;
        sample(true);
      });
    }

    // Retain the last colors during seeking/buffering instead of flashing artwork.
    if (video.readyState < 2 || video.seeking) return;

    if (!frame || newFrame || ((!supportsFrameCallback || video.paused) && video.currentTime !== mediaTime)) {
      try {
        prepareDownsampleStages(video.videoWidth, video.videoHeight);
        let input: CanvasImageSource = video;
        for (const stage of downsampleStages) {
          stage.context.drawImage(input, 0, 0, stage.canvas.width, stage.canvas.height);
          input = stage.canvas;
        }
        // Kawarp maps texture row zero to the bottom of the output. Flip on the
        // tiny sampling canvas so top/left colors remain at the top/left onscreen.
        context.setTransform(1, 0, 0, -1, 0, SAMPLE_HEIGHT);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(input, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        const now = performance.now();
        // A seek/track change should immediately reflect its destination frame.
        if (!frame || video.paused || Math.abs(video.currentTime - mediaTime) > 0.25) colorHistory = null;
        colorHistory = smoothVideoPixels(pixels.data, colorHistory, now - lastSampleTime);
        lastSampleTime = now;
        frame = { pixels };
        mediaTime = video.currentTime;
      } catch (error) {
        // Do not keep attempting readback of a CORS/DRM-protected source.
        blocked = error instanceof DOMException && error.name === "SecurityError";
        cancelFrameCallback();
        frame = null;
        options.onUnavailable();
        return;
      }
    }

    // Reuse paused frames so a newly mounted shader still receives its colors.
    options.onFrame(frame);
  };

  // Also discover replacement players and supply cached frames to new effects.
  const interval = window.setInterval(() => sample(), FRAME_INTERVAL_MS);
  return () => {
    stopped = true;
    cancelFrameCallback();
    window.clearInterval(interval);
    downsampleStages = [];
    colorHistory = null;
  };
};
