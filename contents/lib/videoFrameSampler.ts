// The shader only needs a rough color map, not a full-resolution video texture.
export const FRAME_INTERVAL_MS = 1000 / 30; // Fallback for browsers without video frame callbacks.
export const FRAME_TRANSITION_MS = 8;
const SAMPLE_WIDTH = 128;
const SAMPLE_HEIGHT = 72;
const COLOR_RESPONSE_MS = 65;

// Smooth the color history itself. Long Kawarp crossfades cannot overlap safely:
// each texture upload swaps their endpoints, which can produce visible jumps.
export const smoothVideoPixels = (
  pixels: Uint8ClampedArray | Float32Array,
  previous: Float32Array | null,
  elapsedMs: number,
  responseMs = COLOR_RESPONSE_MS
): Float32Array => {
  if (!previous || previous.length !== pixels.length || responseMs <= 0) return new Float32Array(pixels);
  const amount = 1 - Math.exp(-Math.max(0, elapsedMs) / responseMs);
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
  // Float data uses normalized SDR-range sRGB (0..1); bytes use 0..255.
  pixels: { data: Uint8ClampedArray | Float32Array; width: number; height: number };
  samplingPrecision: "float16" | "unorm8";
  highPrecisionRequested: boolean;
  fallbackReason?: string;
  intervalMs?: number;
}

export interface VideoSamplingSettings {
  width: number;
  height: number;
  frameRate: number;
  responseMs: number;
  stagedDownsampling: boolean;
  downsampleFactor: number;
  highPrecision?: boolean;
}

const defaults: VideoSamplingSettings = {
  width: SAMPLE_WIDTH,
  height: SAMPLE_HEIGHT,
  frameRate: 0,
  responseMs: COLOR_RESPONSE_MS,
  stagedDownsampling: true,
  downsampleFactor: 2,
  highPrecision: true,
};
const bounded = (value: number, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

interface SamplerOptions {
  getSettings?: () => VideoSamplingSettings;
  getVideo: () => HTMLVideoElement | null;
  isActive: () => boolean;
  onFrame: (frame: VideoFrameSample) => void;
  onUnavailable: () => void;
}

export const startVideoFrameSampler = (options: SamplerOptions): (() => void) => {
  const readSettings = (): VideoSamplingSettings => {
    const input = options.getSettings?.() ?? defaults;
    return {
      width: Math.round(bounded(input.width, SAMPLE_WIDTH, 16, 512)),
      height: Math.round(bounded(input.height, SAMPLE_HEIGHT, 9, 288)),
      frameRate: bounded(input.frameRate, 0, 0, 120),
      responseMs: bounded(input.responseMs, COLOR_RESPONSE_MS, 0, 1000),
      stagedDownsampling: input.stagedDownsampling !== false,
      downsampleFactor: bounded(input.downsampleFactor, 2, 1.25, 4),
      highPrecision: input.highPrecision !== false,
    };
  };
  let settings = readSettings();
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;
  let floatSampling = false;
  let floatUnavailable = false;
  let fallbackReason: string | undefined;
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

  class FloatSamplingUnavailable extends Error {}

  const createSurface = (width: number, height: number, readFrequently: boolean, float: boolean) => {
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    // Keep SDR tone mapping and sRGB; precision does not opt into brighter output.
    const attributes = {
      willReadFrequently: readFrequently,
      colorSpace: "srgb" as const,
      colorType: float ? ("float16" as const) : ("unorm8" as const),
      toneMapping: { mode: "standard" as const },
    };
    let surfaceContext: CanvasRenderingContext2D | null;
    try {
      surfaceContext = surface.getContext("2d", attributes) as CanvasRenderingContext2D | null;
    } catch (error) {
      if (!float) throw error;
      throw new FloatSamplingUnavailable("Float16 canvas creation failed");
    }
    const actual = surfaceContext?.getContextAttributes?.() as
      | (CanvasRenderingContext2DSettings & { colorType?: string })
      | undefined;
    if (float && actual?.colorType !== "float16") {
      throw new FloatSamplingUnavailable("Float16 canvas backing store unavailable");
    }
    return { canvas: surface, context: surfaceContext };
  };

  const resetSurface = () => {
    floatSampling = settings.highPrecision !== false && !floatUnavailable;
    let surface;
    try {
      surface = createSurface(settings.width, settings.height, true, floatSampling);
    } catch (error) {
      if (!(error instanceof FloatSamplingUnavailable)) throw error;
      floatUnavailable = true;
      floatSampling = false;
      fallbackReason = error.message;
      surface = createSurface(settings.width, settings.height, true, false);
    }
    canvas = surface.canvas;
    context = surface.context;
    frame = null;
    colorHistory = null;
    sourceWidth = sourceHeight = 0;
    downsampleStages = [];
  };
  resetSurface();

  const prepareDownsampleStages = (width: number, height: number) => {
    if (width === sourceWidth && height === sourceHeight) return;
    sourceWidth = width;
    sourceHeight = height;
    downsampleStages = [];
    // Limit each reduction to the configured factor (2x by default). A single large video -> tiny canvas
    // reduction can skip fine detail rather than averaging it, causing shimmer.
    while (
      settings.stagedDownsampling &&
      (width > settings.width * settings.downsampleFactor || height > settings.height * settings.downsampleFactor)
    ) {
      width = Math.max(settings.width, Math.ceil(width / settings.downsampleFactor));
      height = Math.max(settings.height, Math.ceil(height / settings.downsampleFactor));
      const { canvas: stage, context: stageContext } = createSurface(width, height, false, floatSampling);
      if (!stageContext) break;
      stageContext.imageSmoothingEnabled = true;
      stageContext.imageSmoothingQuality = "high";
      downsampleStages.push({ canvas: stage, context: stageContext });
    }
  };

  const capturePixels = (sourceVideo: HTMLVideoElement): VideoFrameSample["pixels"] => {
    prepareDownsampleStages(sourceVideo.videoWidth, sourceVideo.videoHeight);
    let input: CanvasImageSource = sourceVideo;
    for (const stage of downsampleStages) {
      stage.context.drawImage(input, 0, 0, stage.canvas.width, stage.canvas.height);
      input = stage.canvas;
    }
    // Kawarp maps row zero to the bottom. Preserve the video's spatial orientation.
    context!.setTransform(1, 0, 0, -1, 0, settings.height);
    context!.imageSmoothingEnabled = true;
    context!.imageSmoothingQuality = "high";
    context!.drawImage(input, 0, 0, settings.width, settings.height);
    if (!floatSampling) return context!.getImageData(0, 0, settings.width, settings.height);

    // Keep the experimental API shape local rather than requiring Float16Array
    // in every browser or in the project's TypeScript target.
    type FloatReadback = {
      getImageData(
        x: number,
        y: number,
        width: number,
        height: number,
        settings: { pixelFormat: "rgba-float16"; colorSpace: "srgb" }
      ): {
        data: ArrayLike<number> & { BYTES_PER_ELEMENT: number };
        pixelFormat?: string;
      };
    };
    let image;
    try {
      image = (context as unknown as FloatReadback).getImageData(0, 0, settings.width, settings.height, {
        pixelFormat: "rgba-float16",
        colorSpace: "srgb",
      });
    } catch (error) {
      // A protected or temporarily unavailable frame must follow the usual recovery
      // path, not be retried as an unsupported precision format.
      if (error instanceof DOMException && ["SecurityError", "InvalidStateError"].includes(error.name)) throw error;
      throw new FloatSamplingUnavailable("Float16 pixel readback unavailable");
    }
    if (image.pixelFormat !== "rgba-float16" || image.data.BYTES_PER_ELEMENT !== 2) {
      throw new FloatSamplingUnavailable("Float16 pixel readback was not honored");
    }
    // The typed-array constructor uses native float16 conversion. Array.from
    // with a mapping callback iterates/boxes every component and is much slower.
    const data = new Float32Array(image.data);
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (!Number.isFinite(value) || value < 0) data[i] = 0;
      else if (value > 1) data[i] = 1;
    }
    return {
      // Smooth/upload in float32 without an intervening byte or float16 rounding.
      data,
      width: settings.width,
      height: settings.height,
    };
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

    const nextSettings = readSettings();
    const rebuild =
      nextSettings.width !== settings.width ||
      nextSettings.height !== settings.height ||
      nextSettings.stagedDownsampling !== settings.stagedDownsampling ||
      nextSettings.downsampleFactor !== settings.downsampleFactor ||
      nextSettings.highPrecision !== settings.highPrecision;
    if (nextSettings.highPrecision !== settings.highPrecision) {
      floatUnavailable = false;
      fallbackReason = undefined;
    }
    if (nextSettings.responseMs !== settings.responseMs) colorHistory = null;
    if (nextSettings.frameRate !== settings.frameRate) {
      window.clearInterval(interval);
      interval = window.setInterval(
        () => sample(),
        nextSettings.frameRate > 0 ? 1000 / nextSettings.frameRate : FRAME_INTERVAL_MS
      );
    }
    settings = nextSettings;
    if (rebuild) resetSurface();
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
      canvas.width = settings.width;
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
      const now = performance.now();
      const jumped =
        Math.abs(video.currentTime - mediaTime) >
        Math.max(0.25, settings.frameRate > 0 ? 2 / settings.frameRate : 0.25);
      if (
        frame &&
        !video.paused &&
        !jumped &&
        settings.frameRate > 0 &&
        now - lastSampleTime < 1000 / settings.frameRate - 0.5
      ) {
        options.onFrame(frame);
        return;
      }
      try {
        let pixels;
        try {
          pixels = capturePixels(video);
        } catch (error) {
          if (!(error instanceof FloatSamplingUnavailable)) throw error;
          floatUnavailable = true;
          fallbackReason = error.message;
          resetSurface();
          if (!context) throw error;
          pixels = capturePixels(video);
        }
        // A seek/track change should immediately reflect its destination frame.
        if (!frame || video.paused || jumped) colorHistory = null;
        colorHistory = smoothVideoPixels(pixels.data, colorHistory, now - lastSampleTime, settings.responseMs);
        const intervalMs = frame ? now - lastSampleTime : FRAME_INTERVAL_MS;
        lastSampleTime = now;
        frame = {
          pixels,
          intervalMs,
          samplingPrecision: floatSampling ? "float16" : "unorm8",
          highPrecisionRequested: settings.highPrecision !== false,
          fallbackReason,
        };
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
  let interval = window.setInterval(
    () => sample(),
    settings.frameRate > 0 ? 1000 / settings.frameRate : FRAME_INTERVAL_MS
  );
  return () => {
    stopped = true;
    cancelFrameCallback();
    window.clearInterval(interval);
    downsampleStages = [];
    colorHistory = null;
  };
};
