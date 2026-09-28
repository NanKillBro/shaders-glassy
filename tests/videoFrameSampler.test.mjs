import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../contents/lib/videoFrameSampler.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { startVideoFrameSampler, smoothVideoPixels, FRAME_INTERVAL_MS } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function setup(t) {
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
    reductions: [],
  };
  const createCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      setTransform: (...values) => assert.deepEqual(values, [1, 0, 0, -1, 0, 72]),
      drawImage: (input, _x, _y, width, height) => {
        state.reductions.push({
          from: [input.videoWidth ?? input.width, input.videoHeight ?? input.height],
          to: [width, height],
        });
        state.draws++;
      },
      getImageData: () => {
        state.reads++;
        if (state.error) throw state.error;
        return { data: new Uint8ClampedArray([state.video.currentTime, 0, 0, 255]), width: 128, height: 72 };
      },
    }),
  });
  globalThis.document = { createElement: createCanvas };
  globalThis.window = {
    setInterval: (callback, interval) => {
      assert.equal(interval, FRAME_INTERVAL_MS);
      state.tick = callback;
      return 42;
    },
    clearInterval: id => {
      assert.equal(id, 42);
      state.stopped = true;
    },
  };
  const stop = startVideoFrameSampler({
    getVideo: () => state.video,
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
