import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../contents/lib/videoFrameSampler.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { startVideoFrameSampler, smoothVideoPixels } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function setup(t, samplingSettings, support = {}) {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const state = {
    active: true,
    video: { currentSrc: "blob:video-1", currentTime: 0, videoWidth: 1920, videoHeight: 1080, readyState: 4 },
    frames: [],
    unavailable: 0,
    reads: 0,
    draws: 0,
    error: null,
    stopped: false,
    tick: null,
    interval: null,
    now: 1000,
    reductions: [],
    surfaces: [],
    floatReads: 0,
    gpuFrames: [],
    gpuHandles: true,
    floatValues: [0.50048828125, 0.25, 0.125, 1],
  };
  const createCanvas = () => ({
    width: 0,
    height: 0,
    getContext: (_type, attributes) => {
      state.surfaces.push(attributes);
      return {
        getContextAttributes: () => ({
          colorType:
            support.floatCanvas && (attributes.willReadFrequently || support.floatStages !== false)
              ? attributes.colorType
              : "unorm8",
        }),
        setTransform: (...values) => assert.deepEqual(values, [1, 0, 0, -1, 0, samplingSettings?.height ?? 72]),
        drawImage: (input, _x, _y, width, height) => {
          state.reductions.push({
            from: [input.videoWidth ?? input.width, input.videoHeight ?? input.height],
            to: [width, height],
          });
          state.draws++;
        },
        getImageData: (_x, _y, width, height, options) => {
          state.reads++;
          if (state.error) throw state.error;
          if (options?.pixelFormat === "rgba-float16") {
            state.floatReads++;
            if (support.floatReadback === false) throw new TypeError("Unsupported pixel format");
            return {
              data: Object.assign([...state.floatValues], { BYTES_PER_ELEMENT: 2 }),
              pixelFormat: "rgba-float16",
              width,
              height,
            };
          }
          return { data: new Uint8ClampedArray([state.video.currentTime, 0, 0, 255]), width, height };
        },
      };
    },
  });
  globalThis.document = { createElement: createCanvas };
  globalThis.window = {
    setInterval: (callback, interval) => {
      state.interval = interval;
      state.tick = callback;
      return 42;
    },
    clearInterval: id => {
      assert.equal(id, 42);
      state.stopped = true;
    },
  };
  t.mock.method(performance, "now", () => state.now);
  const stop = startVideoFrameSampler({
    getSettings: samplingSettings ? () => samplingSettings : undefined,
    getVideo: () => state.video,
    onVideoFrame: support.gpu
      ? (_video, info) => {
          state.gpuFrames.push(info);
          return state.gpuHandles;
        }
      : undefined,
    isActive: () => state.active,
    onFrame: frame => state.frames.push(frame),
    onUnavailable: () => state.unavailable++,
  });
  t.after(() => {
    stop();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });
  return { state, stop };
}

test("samples advancing frames and reuses a paused frame for new consumers", t => {
  const { state } = setup(t);
  state.tick();
  state.tick();
  assert.equal(state.reads, 1);
  assert.equal(state.frames[0], state.frames[1]);
  state.video.currentTime = 10;
  state.tick();
  assert.equal(state.reads, 2);
  assert.notEqual(state.frames[1], state.frames[2]);
  assert.equal(state.frames[2].pixels.data[0], 10);
});

test("does no readback for hidden effects and cancels its timer on cleanup", t => {
  const { state, stop } = setup(t);
  state.active = false;
  state.tick();
  assert.equal(state.draws, 0);
  assert.equal(state.unavailable, 0);
  state.active = true;
  state.tick();
  assert.equal(state.reads, 1);
  stop();
  assert.equal(state.stopped, true);
});

test("falls back for audio-only or removed video, retaining colors during seeking and buffering", t => {
  const { state } = setup(t);
  state.tick();
  state.video.seeking = true;
  state.video.currentTime = 20;
  state.tick();
  state.video.seeking = false;
  state.video.readyState = 1;
  state.tick();
  assert.equal(state.reads, 1);
  assert.equal(state.unavailable, 0);
  state.video.readyState = 4;
  state.tick();
  assert.equal(state.frames.at(-1).pixels.data[0], 20);
  state.video.videoWidth = 0;
  state.tick();
  state.video = null;
  state.tick();
  assert.equal(state.unavailable, 2);
});

test("suppresses repeated security failures and retries a new source or player element", t => {
  const { state } = setup(t);
  state.error = new DOMException("Unreadable video", "SecurityError");
  state.tick();
  state.tick();
  assert.equal(state.reads, 1);
  assert.equal(state.frames.length, 0);
  state.error = null;
  state.video.currentSrc = "blob:video-2";
  state.tick();
  assert.equal(state.reads, 2);
  state.video = { ...state.video };
  state.tick();
  assert.equal(state.reads, 3);
});

test("recovers from a transient drawing failure without permanently blocking the source", t => {
  const { state } = setup(t);
  state.error = new DOMException("Frame not ready", "InvalidStateError");
  state.tick();
  state.error = null;
  state.tick();
  assert.equal(state.reads, 2);
  assert.equal(state.frames.length, 1);
});

test("reads once per presented video frame and cancels callbacks on hide, replacement and cleanup", t => {
  const { state, stop } = setup(t);
  let callback;
  let cancelled = 0;
  state.video.requestVideoFrameCallback = next => {
    callback = next;
    return 7;
  };
  state.video.cancelVideoFrameCallback = id => {
    assert.equal(id, 7);
    cancelled++;
  };
  state.tick();
  state.video.currentTime = 0.01;
  state.tick();
  assert.equal(state.reads, 1, "polling must not duplicate decoded frames");
  callback();
  assert.equal(state.reads, 2);
  state.active = false;
  state.tick();
  assert.equal(cancelled, 1);
  state.active = true;
  state.tick();
  state.video = { ...state.video, currentSrc: "blob:replacement" };
  state.tick();
  assert.equal(cancelled, 2);
  assert.equal(state.reads, 3);
  stop();
  assert.equal(cancelled, 3);
  callback();
  assert.equal(state.reads, 3, "a stale callback must not restart the sampler");
});

test("reduces 1080p in filtered stages before the single 128 by 72 readback", t => {
  const { state } = setup(t);
  state.tick();
  assert.ok(state.reductions.length > 1);
  for (const { from, to } of state.reductions) {
    assert.ok(from[0] / to[0] <= 2 && from[1] / to[1] <= 2);
  }
  assert.deepEqual(state.reductions.at(-1).to, [128, 72]);
  assert.equal(state.reads, 1);
});

test("temporal smoothing attenuates rapid color changes without mixing spatial regions", () => {
  const history = new Float32Array([0, 0, 0, 255, 200, 200, 200, 255]);
  const next = new Uint8ClampedArray([200, 0, 0, 255, 0, 200, 200, 255]);
  smoothVideoPixels(next, history, 1000 / 60);
  assert.ok(next[0] > 0 && next[0] < 60);
  assert.ok(next[4] > 140 && next[4] < 200);
  assert.equal(next[1], 0);
  assert.equal(next[5], 200);
  assert.equal(next[3], 255);
});

test("temporal response depends on elapsed time and resets without carrying old colors", () => {
  const target = () => new Uint8ClampedArray([200, 100, 50, 255]);
  const oneStep = smoothVideoPixels(target(), new Float32Array([0, 0, 0, 255]), 65);
  let twoSteps = smoothVideoPixels(target(), new Float32Array([0, 0, 0, 255]), 32.5);
  twoSteps = smoothVideoPixels(target(), twoSteps, 32.5);
  assert.ok(Math.abs(oneStep[0] - twoSteps[0]) < 0.001);
  const firstFrame = target();
  assert.deepEqual(Array.from(smoothVideoPixels(firstFrame, null, 0)), Array.from(firstFrame));
});

const samplingDefaults = () => ({
  width: 128,
  height: 72,
  frameRate: 0,
  responseMs: 65,
  stagedDownsampling: true,
  downsampleFactor: 2,
});

test("resizes a paused frame live and rebuilds the downsampling chain", t => {
  const settings = samplingDefaults();
  const { state } = setup(t, settings);
  state.video.paused = true;
  state.tick();
  const previous = state.frames.at(-1);
  settings.width = 256;
  settings.height = 144;
  state.tick();
  assert.equal(state.reads, 2);
  assert.notEqual(state.frames.at(-1), previous);
  assert.equal(state.frames.at(-1).pixels.width, 256);
  assert.equal(state.frames.at(-1).pixels.height, 144);
  assert.deepEqual(state.reductions.at(-1).to, [256, 144]);
});

test("capture limit throttles readback and changes the polling rate live", t => {
  const settings = { ...samplingDefaults(), frameRate: 10 };
  const { state } = setup(t, settings);
  state.tick();
  assert.equal(state.interval, 100);
  state.now += 50;
  state.video.currentTime = 0.05;
  state.tick();
  assert.equal(state.reads, 1);
  state.now += 50;
  state.video.currentTime = 0.1;
  state.tick();
  assert.equal(state.reads, 2);
  settings.frameRate = 20;
  state.now += 50;
  state.video.currentTime = 0.15;
  state.tick();
  assert.equal(state.interval, 50);
  assert.equal(state.reads, 3);
  // Seeking while paused bypasses the frame cap.
  state.video.paused = true;
  state.video.currentTime = 4;
  state.tick();
  assert.equal(state.reads, 4);
});

test("downsampling can be bypassed or use a different reduction factor", t => {
  const settings = samplingDefaults();
  const { state } = setup(t, settings);
  state.tick();
  const careful = state.draws;
  settings.stagedDownsampling = false;
  state.tick();
  assert.equal(state.draws - careful, 1);
  settings.stagedDownsampling = true;
  settings.downsampleFactor = 4;
  state.reductions = [];
  state.tick();
  assert.deepEqual(
    state.reductions.map(r => r.to),
    [
      [480, 270],
      [128, 72],
    ]
  );
});

test("color response is configurable and zero disables temporal blending", () => {
  const dark = new Float32Array([0, 0, 0, 255]);
  const instant = new Uint8ClampedArray([200, 100, 40, 255]);
  smoothVideoPixels(instant, dark, 16, 0);
  assert.deepEqual([...instant], [200, 100, 40, 255]);
  const fast = new Uint8ClampedArray([200, 100, 40, 255]);
  const slow = new Uint8ClampedArray(fast);
  smoothVideoPixels(fast, new Float32Array(dark), 16, 20);
  smoothVideoPixels(slow, new Float32Array(dark), 16, 200);
  assert.ok(fast[0] > slow[0]);
});

test("float canvases retain sub-byte colors through every resize and smoothing", t => {
  const { state } = setup(t, samplingDefaults(), { floatCanvas: true });
  state.tick();
  const first = state.frames.at(-1);
  assert.equal(first.samplingPrecision, "float16");
  assert.ok(first.pixels.data instanceof Float32Array);
  assert.equal(first.pixels.data[0], 0.50048828125);
  assert.ok(state.surfaces.every(surface => surface.colorType === "float16"));
  state.now += 16;
  state.video.currentTime += 0.016;
  state.floatValues[0] = 0.501953125;
  state.tick();
  const next = state.frames.at(-1).pixels.data;
  assert.ok(next[0] > first.pixels.data[0] && next[0] < state.floatValues[0]);
  assert.notEqual(next[0], Math.round(next[0] * 255) / 255);
  assert.equal(next[3], 1);
  assert.equal(first.pixels.data[0], 0.50048828125, "cached frame must not mutate with history");
});

test("precision can be toggled live while paused without mixing normalized and byte histories", t => {
  const settings = { ...samplingDefaults(), highPrecision: true };
  const { state } = setup(t, settings, { floatCanvas: true });
  state.video.paused = true;
  state.tick();
  assert.equal(state.frames.at(-1).samplingPrecision, "float16");
  settings.highPrecision = false;
  state.tick();
  assert.equal(state.frames.at(-1).samplingPrecision, "unorm8");
  assert.ok(state.frames.at(-1).pixels.data instanceof Uint8ClampedArray);
  settings.highPrecision = true;
  state.tick();
  assert.equal(state.frames.at(-1).pixels.data[0], state.floatValues[0]);
  assert.equal(state.frames.at(-1).pixels.data[3], 1);
});

test("unsupported float readback falls back once and continues sampling", t => {
  const { state } = setup(t, samplingDefaults(), { floatCanvas: true, floatReadback: false });
  state.tick();
  assert.equal(state.frames.at(-1).samplingPrecision, "unorm8");
  assert.match(state.frames.at(-1).fallbackReason, /readback/);
  state.video.currentTime += 1;
  state.tick();
  assert.equal(state.floatReads, 1);
  assert.equal(state.unavailable, 0);
});

test("unsupported float stage falls back the entire downsampling chain", t => {
  const { state } = setup(t, samplingDefaults(), { floatCanvas: true, floatStages: false });
  state.tick();
  assert.equal(state.frames.at(-1).samplingPrecision, "unorm8");
  assert.match(state.frames.at(-1).fallbackReason, /backing store/);
  assert.equal(state.floatReads, 0);
  assert.equal(state.unavailable, 0);
});

test("protected float sources are blocked without retrying in byte mode", t => {
  const { state } = setup(t, samplingDefaults(), { floatCanvas: true });
  state.error = new DOMException("Protected source", "SecurityError");
  state.tick();
  state.tick();
  assert.equal(state.reads, 1);
  assert.equal(state.frames.length, 0);
});

test("GPU consumers receive scheduled metadata without CPU draws or readback", t => {
  const settings = { ...samplingDefaults(), gpuProcessing: true, frameRate: 10 };
  const { state } = setup(t, settings, { gpu: true });
  state.tick();
  const first = state.gpuFrames.at(-1);
  assert.equal(first.resetHistory, true);
  state.now += 50;
  state.video.currentTime += 0.05;
  state.tick();
  assert.equal(state.gpuFrames.at(-1), first, "frame limit must also apply to GPU captures");
  state.now += 50;
  state.video.currentTime += 0.05;
  state.tick();
  assert.notEqual(state.gpuFrames.at(-1).id, first.id);
  assert.equal(state.reads, 0);
  assert.equal(state.draws, 0);
  state.video.paused = true;
  state.video.currentTime = 5;
  state.tick();
  assert.equal(state.gpuFrames.at(-1).resetHistory, true);
  const paused = state.gpuFrames.at(-1);
  state.tick();
  assert.equal(state.gpuFrames.at(-1), paused);
});

test("GPU fallback and live CPU/GPU changes preserve frame delivery", t => {
  const settings = { ...samplingDefaults(), gpuProcessing: true };
  const { state } = setup(t, settings, { gpu: true });
  state.tick();
  state.gpuHandles = false;
  state.tick();
  assert.equal(state.reads, 1, "late consumer can request CPU pixels of a cached GPU frame");
  assert.equal(state.frames.at(-1).id, state.gpuFrames.at(-1).id);
  state.gpuHandles = true;
  settings.gpuProcessing = false;
  state.tick();
  assert.equal(state.reads, 2);
  const cpuId = state.frames.at(-1).id;
  settings.gpuProcessing = true;
  state.tick();
  assert.ok(state.gpuFrames.at(-1).id > cpuId);
  assert.equal(state.reads, 2);
});
