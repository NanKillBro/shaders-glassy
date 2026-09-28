import Kawarp from "@kawarp/core";
import { measureHighlightLuminance } from "../contents/lib/artworkBrightness";
import { GpuVideoProcessor } from "../contents/lib/gpuVideoProcessor";
import { startVideoFrameSampler } from "../contents/lib/videoFrameSampler";

// Run against a playing HTMLVideoElement, not a canvas pretending to be video.
// Temporarily hide the installed shader container before running to avoid two
// pipelines competing. This probe owns only its renderer and restores GL hooks.
export async function runDecodedVideoPerformanceChecks(
  video: HTMLVideoElement,
  mode: "cpu" | "gpu" | "gpu-sub-upload",
  iterations = 60,
  width = 128,
  height = 72
) {
  if (video.paused || video.readyState < 2) throw new Error("A playing decoded video is required");
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 150;
  const renderer = new Kawarp(canvas, {
    highPrecision: true,
    highPrecisionInput: true,
    blurPasses: 3,
    transitionDuration: 8,
  });
  const gl = canvas.getContext("webgl2")!;
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const processor = mode === "cpu" ? null : new GpuVideoProcessor(gl, () => {});
  const texImage = gl.texImage2D;
  let imported = false;
  // Reproduce the regression using a real decoder-backed source.
  if (mode === "gpu-sub-upload") {
    gl.texImage2D = ((...args: unknown[]) => {
      if (args.length === 6 && args[5] === video) {
        if (imported) return gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, args[3] as number, args[4] as number, video);
        imported = true;
      }
      return Reflect.apply(texImage, gl, args);
    }) as typeof gl.texImage2D;
  }
  const cpuMs: number[] = [],
    gpuMs: number[] = [],
    frameIntervals: number[] = [];
  const queries: WebGLQuery[] = [];
  let sampleStart = 0,
    previousFrame = 0,
    lastId = -1,
    frames = 0,
    raf = 0,
    timeout = 0;
  let stop = () => {};
  const qualityBefore = video.getVideoPlaybackQuality();
  const start = performance.now();
  const tick = (time: number) => {
    if (frames > 5 && previousFrame) frameIntervals.push(time - previousFrame);
    previousFrame = time;
    renderer.renderFrame();
    while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = queries.shift()!;
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = window.setTimeout(() => reject(new Error("Decoded video probe timed out")), 20000);
      const record = () => {
        renderer.renderFrame();
        frames++;
        if (frames > 5) cpuMs.push(performance.now() - sampleStart);
        if (frames >= iterations + 5) resolve();
      };
      stop = startVideoFrameSampler({
        getVideo: () => video,
        isActive: () => true,
        getSettings: () => {
          sampleStart = performance.now();
          return {
            width,
            height,
            frameRate: 0,
            responseMs: 65,
            stagedDownsampling: true,
            downsampleFactor: 2,
            highPrecision: true,
            gpuProcessing: mode !== "cpu",
          };
        },
        onUnavailable: () => reject(new Error("Video unavailable")),
        onVideoFrame: processor
          ? (source, info) => {
              if (lastId === info.id) return true;
              lastId = info.id;
              const query = timer ? gl.createQuery() : null;
              if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
              const result = processor.process(source, info, { enabled: true, size: 32, intervalMs: 100 });
              renderer.loadTexture(result.texture, result.highPrecision);
              record();
              if (query) {
                gl.endQuery(timer.TIME_ELAPSED_EXT);
                queries.push(query);
              }
              return true;
            }
          : undefined,
        onFrame: frame => {
          if (lastId === frame.id) return;
          lastId = frame.id!;
          measureHighlightLuminance(frame.pixels.data);
          renderer.loadImageData(frame.pixels.data, width, height);
          record();
        },
      });
    });
    const summary = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
      };
    };
    const qualityAfter = video.getVideoPlaybackQuality();
    return {
      mode,
      width,
      height,
      source: [video.videoWidth, video.videoHeight],
      frames,
      elapsedMs: performance.now() - start,
      cpuMs: summary(cpuMs),
      gpuMs: summary(gpuMs.slice(5)),
      frameIntervalMs: summary(frameIntervals),
      rafFps: (frameIntervals.length * 1000) / frameIntervals.reduce((a, b) => a + b, 0),
      droppedVideoFrames: qualityAfter.droppedVideoFrames - qualityBefore.droppedVideoFrames,
    };
  } finally {
    stop();
    clearTimeout(timeout);
    cancelAnimationFrame(raf);
    for (const query of queries) gl.deleteQuery(query);
    gl.texImage2D = texImage;
    processor?.dispose();
    renderer.dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
