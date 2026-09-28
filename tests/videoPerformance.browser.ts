import Kawarp from "@kawarp/core";
import { measureHighlightLuminance } from "../contents/lib/artworkBrightness";
import { startVideoFrameSampler } from "../contents/lib/videoFrameSampler";

// Run on an empty visible page. Measures sampler CPU/submission time and the
// synchronous parts of upload/render, not asynchronous GPU execution or display FPS.
export async function runVideoPerformanceChecks(iterations = 30) {
  const results = [];
  for (const [width, height] of [
    [128, 72],
    [256, 144],
    [512, 288],
  ]) {
    const source = document.createElement("canvas");
    source.width = 1920;
    source.height = 1080;
    const ctx = source.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, "#ff7040");
    gradient.addColorStop(1, "#0038d0");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
    const video = Object.assign(source, {
      videoWidth: 1920,
      videoHeight: 1080,
      currentSrc: "synthetic",
      currentTime: 0,
      readyState: 4,
      paused: false,
    }) as unknown as HTMLVideoElement;
    const output = document.createElement("canvas");
    output.width = 320;
    output.height = 180;
    const renderer = new Kawarp(output, {
      highPrecision: true,
      highPrecisionInput: true,
      blurPasses: 3,
      transitionDuration: 0,
    });
    const gl = (output.getContext("webgl2") ?? output.getContext("webgl"))!;
    const rows: { sampling: number; brightness: number; upload: number; render: number }[] = [];
    let started = 0;
    let stop = () => {};
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          stop();
          reject(new Error("Performance probe timed out"));
        }, 20000);
        stop = startVideoFrameSampler({
          getSettings: () => {
            started = performance.now();
            return {
              width,
              height,
              frameRate: 0,
              responseMs: 65,
              stagedDownsampling: true,
              downsampleFactor: 2,
              highPrecision: true,
            };
          },
          isActive: () => true,
          getVideo: () => video,
          onUnavailable: () => {
            clearTimeout(timeout);
            stop();
            reject(new Error("Synthetic source unavailable"));
          },
          onFrame: frame => {
            const sampled = performance.now();
            measureHighlightLuminance(frame.pixels.data);
            const brightness = performance.now();
            renderer.loadImageData(frame.pixels.data, width, height);
            const uploaded = performance.now();
            renderer.renderFrame();
            const rendered = performance.now();
            rows.push({
              sampling: sampled - started,
              brightness: brightness - sampled,
              upload: uploaded - brightness,
              render: rendered - uploaded,
            });
            video.currentTime += 1 / 30;
            if (rows.length >= iterations + 5) {
              clearTimeout(timeout);
              stop();
              resolve();
            }
          },
        });
      });
      const steady = rows.slice(5);
      const timing = (key: keyof (typeof rows)[number]) => {
        const values = steady.map(row => row[key]).sort((a, b) => a - b);
        return {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          p95: values[Math.floor((values.length - 1) * 0.95)],
        };
      };
      results.push({
        width,
        height,
        pixels: width * height,
        sampling: timing("sampling"),
        brightness: timing("brightness"),
        upload: timing("upload"),
        render: timing("render"),
        floatSource: renderer.highPrecisionSource,
      });
    } finally {
      stop();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  return results;
}
