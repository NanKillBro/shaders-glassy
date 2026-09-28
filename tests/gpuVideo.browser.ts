import Kawarp from "@kawarp/core";
import { GpuVideoProcessor } from "../contents/lib/gpuVideoProcessor";
import type { VideoFrameInfo } from "../contents/lib/videoFrameSampler";

export async function runGpuVideoChecks() {
  const check = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const source = document.createElement("canvas");
  source.width = 256;
  source.height = 144;
  const context = source.getContext("2d", { colorType: "float16" } as CanvasRenderingContext2DSettings)!;
  const video = Object.assign(source, { videoWidth: 256, videoHeight: 144 }) as unknown as HTMLVideoElement;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 144;
  const renderer = new Kawarp(canvas, {
    highPrecision: true,
    highPrecisionInput: true,
    blurPasses: 0,
    warpIntensity: 0,
    saturation: 1,
    tintIntensity: 0,
    dithering: 0,
    transitionDuration: 0,
  });
  const gl = canvas.getContext("webgl2")!;
  let highlight: number | undefined;
  const processor = new GpuVideoProcessor(gl, value => {
    highlight = value;
  });
  const settings = {
    width: 64,
    height: 36,
    highPrecision: true,
    stagedDownsampling: true,
    downsampleFactor: 2,
    responseMs: 65,
    frameRate: 0,
  };
  let id = 0;
  const info = (resetHistory = true): VideoFrameInfo => ({
    id: ++id,
    settings: { ...settings },
    intervalMs: 33,
    elapsedMs: 65 * Math.log(2),
    resetHistory,
  });
  const read = gl.readPixels;
  let asyncReads = 0,
    fullReads = 0;
  gl.readPixels = ((...args: unknown[]) => {
    if (typeof args[6] === "number" && (args[2] as number) <= 64 && (args[3] as number) <= 64) asyncReads++;
    else fullReads++;
    return Reflect.apply(read, gl, args);
  }) as typeof gl.readPixels;
  const framebuffer = gl.createFramebuffer()!;
  const center = (texture: WebGLTexture, x = 32, y = 18) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const values = new Float32Array(4);
    Reflect.apply(read, gl, [x, y, 1, 1, gl.RGBA, gl.FLOAT, values]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    check(gl.getError() === gl.NO_ERROR, "GPU video GL error");
    return [...values];
  };
  const fill = (color: string) => {
    context.fillStyle = color;
    context.fillRect(0, 0, 256, 144);
  };
  try {
    context.fillStyle = "red";
    context.fillRect(0, 0, 128, 72);
    context.fillStyle = "lime";
    context.fillRect(128, 0, 128, 72);
    context.fillStyle = "blue";
    context.fillRect(0, 72, 128, 72);
    context.fillStyle = "white";
    context.fillRect(128, 72, 128, 72);
    const quadrants = processor.process(video, info(), { enabled: false, size: 32, intervalMs: 100 });
    const topLeft = center(quadrants.texture, 16, 27),
      topRight = center(quadrants.texture, 48, 27),
      bottomLeft = center(quadrants.texture, 16, 9);
    check(
      topLeft[0] > 0.95 && topLeft[2] < 0.05 && topRight[1] > 0.95 && bottomLeft[2] > 0.95,
      "Video orientation changed"
    );
    fill("black");
    processor.process(video, info(), { enabled: false, size: 32, intervalMs: 100 });
    fill("white");
    const blended = processor.process(video, info(false), { enabled: false, size: 32, intervalMs: 100 });
    const midpoint = center(blended.texture)[0];
    check(Math.abs(midpoint - 0.5) < 0.002, "Temporal smoothing incorrect");
    fill("color(srgb 0.5001 0.5001 0.5001)");
    const low = center(processor.process(video, info(), { enabled: false, size: 32, intervalMs: 100 }).texture)[0];
    fill("color(srgb 0.5018 0.5018 0.5018)");
    const high = center(processor.process(video, info(), { enabled: false, size: 32, intervalMs: 100 }).texture)[0];
    check(high > low && high - low < 1 / 255, "GPU path lost sub-byte colors");
    fill("white");
    const brightInfo = info();
    const bright = processor.process(video, brightInfo, { enabled: true, size: 32, intervalMs: 0 });
    renderer.loadTexture(bright.texture, bright.highPrecision);
    renderer.renderFrame(0);
    const start = performance.now();
    while (highlight === undefined && performance.now() - start < 2000) await new Promise(requestAnimationFrame);
    check(highlight !== undefined && highlight > 0.99, "Async brightness measurement failed");
    check(asyncReads === 1 && fullReads === 0, "GPU path performed a full frame readback");
    check(
      !processor.process(video, brightInfo, { enabled: true, size: 32, intervalMs: 0 }).changed,
      "Paused frame re-uploaded"
    );
    // Retained textures remain valid for Kawarp setting changes.
    renderer.blurPasses = 3;
    renderer.renderFrame(0);
    check(gl.getError() === gl.NO_ERROR, "Reblur of GPU input failed");
    settings.width = 128;
    settings.height = 72;
    settings.highPrecision = false;
    const resized = processor.process(video, info(), { enabled: false, size: 32, intervalMs: 0 });
    renderer.loadTexture(resized.texture, false);
    renderer.renderFrame(0);
    check(gl.getError() === gl.NO_ERROR && !renderer.highPrecisionSource, "Resize/byte texture switch failed");
    processor.dispose();
    const reads = asyncReads;
    await new Promise(requestAnimationFrame);
    check(asyncReads === reads, "Analysis continued after disposal");
    return { passed: true, topLeft, topRight, bottomLeft, midpoint, low, high, highlight, asyncReads, fullReads };
  } finally {
    processor.dispose();
    renderer.dispose();
    gl.deleteFramebuffer(framebuffer);
    gl.readPixels = read;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
