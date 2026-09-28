import Kawarp from "@kawarp/core";
import { brightnessForHighlight, measureHighlightLuminance } from "../contents/lib/artworkBrightness";
import { GpuVideoProcessor } from "../contents/lib/gpuVideoProcessor";
import {
  PIP_LOCATION,
  createPipKawarp,
  destroyKawarp,
  pauseKawarp,
  updateKawarpSettings,
  updateKawarpSpeed,
} from "../contents/lib/kawarpManager";
import { DEFAULT_DYNAMIC_MULTIPLIERS, DEFAULT_GRADIENT_SETTINGS } from "../shared/constants/gradientSettings";

// Run on an otherwise empty visible page. Uses a synthetic moving video, never user playback.
export async function runVideoControlsChecks(gpu = false, forceGpuFailure = false) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const source = document.createElement("canvas");
  source.width = 640;
  source.height = 360;
  const context = source.getContext("2d")!;
  let tick = 0;
  const draw = () => {
    const gradient = context.createLinearGradient(0, 0, source.width, source.height);
    gradient.addColorStop(0, `hsl(${tick++ % 360} 90% 60%)`);
    gradient.addColorStop(1, "#0066ff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, source.width, source.height);
  };
  draw();
  const stream = source.captureStream(30);
  const player = document.createElement("div");
  player.id = "movie_player";
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  player.append(video);
  document.body.append(player);
  const timer = window.setInterval(draw, 33);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:320px;height:180px";
  document.body.append(iframe);
  const displayListeners = new Set<() => void>();
  const query = {
    matches: true,
    addEventListener: (_: string, fn: () => void) => displayListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => displayListeners.delete(fn),
  };
  Object.defineProperty(iframe.contentWindow!, "matchMedia", { value: () => query });
  const logs: unknown[][] = [];
  const info = console.info;
  console.info = (...args) => {
    logs.push(args);
    info(...args);
  };
  const original = Kawarp.prototype.loadImageData;
  const originalTexture = Kawarp.prototype.loadTexture;
  const originalProcess = GpuVideoProcessor.prototype.process;
  if (forceGpuFailure)
    GpuVideoProcessor.prototype.process = () => {
      throw new Error("Forced GPU failure");
    };
  const expectGpu = gpu && !forceGpuFailure;
  let gpuUploads = 0;
  Kawarp.prototype.loadTexture = function (texture, highPrecision) {
    instance = this;
    uploads++;
    gpuUploads++;
    width = settings.videoSampleWidth;
    height = settings.videoSampleHeight;
    if (highPrecision) floatUploads++;
    else byteUploads++;
    return originalTexture.call(this, texture, highPrecision);
  };
  let instance: Kawarp | undefined;
  let fractionalUploads = 0;
  let floatUploads = 0;
  let byteUploads = 0;
  let uploads = 0,
    width = 0,
    height = 0;
  Kawarp.prototype.loadImageData = function (data, w, h) {
    instance = this;
    uploads++;
    if (data instanceof Float32Array) {
      floatUploads++;
      if (data.some((value, i) => i % 4 !== 3 && Math.abs(value * 255 - Math.round(value * 255)) > 0.01))
        fractionalUploads++;
    } else byteUploads++;
    width = w;
    height = h;
    return original.call(this, data, w, h);
  };
  const artwork = URL.createObjectURL(await new Promise<Blob>(resolve => source.toBlob(blob => resolve(blob!))));
  let settings = { ...DEFAULT_GRADIENT_SETTINGS, kawarpTransitionDuration: 50, videoGpuProcessing: gpu };
  const update = (patch: Partial<typeof settings>) => {
    settings = { ...settings, ...patch };
    updateKawarpSettings(settings, DEFAULT_DYNAMIC_MULTIPLIERS, PIP_LOCATION);
  };
  try {
    await video.play();
    check(
      await createPipKawarp(iframe.contentWindow!, settings, DEFAULT_DYNAMIC_MULTIPLIERS, artwork),
      "Create failed"
    );
    const start = performance.now();
    while (uploads < 2 && performance.now() - start < 3000) await wait(50);
    check(
      instance && uploads > 1 && width === 128 && height === 72,
      `Default video sampling failed: ${JSON.stringify({ uploads, width, height, currentTime: video.currentTime, readyState: video.readyState, tick })}`
    );
    const renderer = instance!;
    check(floatUploads > 0 && renderer.highPrecisionSource, "Float video sampling/upload failed");
    check(renderer.warpIntensity === 0.5 && renderer.blurPasses === 3, "Default video look failed");
    update({
      videoWarpIntensity: 0.9,
      videoBlurPasses: 0,
      videoOpacity: 0.4,
      videoSaturation: 0.8,
      videoDithering: 0.012,
      videoHdrDitheringScale: 0.5,
      videoAutoDim: false,
      videoAnimationSpeed: 0.5,
      videoBeatSpeedMultiplier: 3,
      videoBeatZoom: 7,
      videoSampleWidth: 256,
      videoSampleHeight: 144,
      videoFrameRate: 10,
      videoFrameTransition: 0,
    });
    await wait(350);
    check(width === 256 && height === 144, "Live sample resize failed");
    check(
      renderer.blurPasses === 0 && renderer.warpIntensity === 0.9 && renderer.saturation === 0.8,
      "Video options failed"
    );
    const container = iframe.contentDocument!.querySelector<HTMLElement>("#better-lyrics-kawarp-pip")!;
    check(container.style.opacity === "0.4" && container.style.filter === "", "Video CSS controls failed");
    const startUploads = uploads;
    await wait(450);
    check(
      uploads - startUploads >= 2 && uploads - startUploads <= 5,
      `Capture FPS cap failed: ${JSON.stringify({ delta: uploads - startUploads, tick, currentTime: video.currentTime })}`
    );
    update({ kawarpWarpIntensity: 0.1, kawarpBlurPasses: 7 });
    check(renderer.warpIntensity === 0.9 && renderer.blurPasses === 0, "Artwork settings leaked into video");
    updateKawarpSpeed(settings, { isBeat: true, speedMultiplier: 1, scaleMultiplier: 1 }, PIP_LOCATION);
    await wait(200);
    check(
      renderer.animationSpeed === 1.5 && Math.abs(renderer.getOptions().scale - 1.07) < 0.002,
      "Independent video beat motion failed"
    );
    query.matches = false;
    displayListeners.forEach(fn => fn());
    check(renderer.dithering === 0.012, "SDR dithering failed");
    query.matches = true;
    displayListeners.forEach(fn => fn());
    check(renderer.dithering === (renderer.highPrecisionOutput ? 0.006 : 0.012), "HDR dithering scale failed");
    update({ videoEnabled: false });
    await wait(220);
    check(renderer.warpIntensity === 0.1 && renderer.blurPasses === 7, "Artwork fallback failed");
    const disabledUploads = uploads;
    await wait(150);
    check(uploads === disabledUploads, "Disabled video still uploads");
    update({ videoEnabled: true });
    await wait(200);
    check(uploads > disabledUploads && renderer.warpIntensity === 0.9, "Video re-enable failed");
    video.pause();
    update({ videoHighPrecisionSampling: false });
    await wait(150);
    check(byteUploads > 0 && !renderer.highPrecisionSource, "Byte precision toggle failed");
    update({ videoHighPrecisionSampling: true });
    await wait(150);
    check(renderer.highPrecisionSource, "Float precision toggle while paused failed");
    pauseKawarp(PIP_LOCATION);
    update({ videoBlurPasses: 0, videoSaturation: 1.1 });
    await wait(100);
    check(renderer.animationSpeed === 0 && renderer.saturation === 1.1, "Paused controls failed");
    renderer.renderFrame();
    const canvas = iframe.contentDocument!.querySelector("canvas")!;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
    check(gl.getError() === gl.NO_ERROR, "WebGL error with blur bypass");
    const pixel = renderer.highPrecisionOutput ? new Float32Array(4) : new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
      gl.RGBA,
      renderer.highPrecisionOutput ? gl.FLOAT : gl.UNSIGNED_BYTE,
      pixel
    );
    check(pixel[0] + pixel[1] + pixel[2] > 0, "Blur bypass rendered black");
    if (!expectGpu) check(fractionalUploads > 0, "Float sampling still rounded every color to bytes");
    check(expectGpu ? gpuUploads > 0 : gpuUploads === 0, "GPU selection/fallback failed");
    if (expectGpu) {
      update({ videoGpuProcessing: false });
      await wait(150);
      check(fractionalUploads > 0, "CPU mode switch failed");
      const previousGpuUploads = gpuUploads;
      update({ videoGpuProcessing: true });
      await wait(150);
      check(gpuUploads > previousGpuUploads, "GPU mode switch failed");
    }
    const whiteFloat = measureHighlightLuminance(new Float32Array([1, 1, 1, 1]));
    const whiteByte = measureHighlightLuminance(new Uint8ClampedArray([255, 255, 255, 255]));
    check(
      whiteFloat === whiteByte && brightnessForHighlight(whiteFloat, 0.3) < 1,
      "Float brightness normalization failed"
    );
    const outputLogs = logs.filter(args => args[0] === "[BLS] Canvas HDR/precision detection");
    const precisionLogs = logs.filter(args => args[0] === "[BLS] Video color precision");
    check(precisionLogs.length >= 3, "Video precision diagnostics missing");
    check(
      outputLogs.length === 3 && (outputLogs[0][1] as { extendedRangeOutput: boolean }).extendedRangeOutput === false,
      "HDR diagnostic missing/inaccurate"
    );
    destroyKawarp(PIP_LOCATION);
    const finalUploads = uploads;
    await wait(150);
    check(uploads === finalUploads && displayListeners.size === 0, "Sampler/display listener cleanup failed");
    return {
      passed: true,
      uploads,
      gpuUploads,
      floatUploads,
      fractionalUploads,
      byteUploads,
      highPrecision: renderer.highPrecisionOutput,
      diagnostics: logs,
      blurBypassPixel: Array.from(pixel),
    };
  } finally {
    destroyKawarp(PIP_LOCATION);
    console.info = info;
    Kawarp.prototype.loadImageData = original;
    Kawarp.prototype.loadTexture = originalTexture;
    GpuVideoProcessor.prototype.process = originalProcess;
    window.clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
    player.remove();
    iframe.remove();
    URL.revokeObjectURL(artwork);
  }
}
