import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const moduleUrl = source => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
};

const readTs = relPath => readFileSync(new URL(relPath, import.meta.url), "utf8");

const gradientSettingsUrl = moduleUrl(readTs("../shared/constants/gradientSettings.ts"));
const themeLockUrl = moduleUrl(
  readTs("../shared/constants/themeLock.ts").replace("./gradientSettings", gradientSettingsUrl)
);
const mediaElementsUrl = moduleUrl(readTs("../shared/constants/mediaElements.ts"));
const loggerUrl = moduleUrl(readTs("../shared/utils/logger.ts"));
const pageFetchUrl = moduleUrl(readTs("../shared/utils/pageFetch.ts"));
const videoSettingsUrl = moduleUrl(readTs("../shared/utils/videoSettings.ts"));
const adStateUrl = moduleUrl(readTs("../contents/lib/adState.ts"));
const artworkBrightnessUrl = moduleUrl(
  readTs("../contents/lib/artworkBrightness.ts")
    .replace("@/shared/utils/logger", loggerUrl)
    .replace("@/shared/utils/pageFetch", pageFetchUrl)
);
const kawarpStubUrl = moduleUrl(`export default class Kawarp {}`);
const kawarpManagerUrl = moduleUrl(
  readTs("../contents/lib/kawarpManager.ts")
    .replace("@/shared/constants/gradientSettings", gradientSettingsUrl)
    .replace("@/shared/constants/mediaElements", mediaElementsUrl)
    .replace("@/shared/utils/logger", loggerUrl)
    .replace("@/shared/utils/pageFetch", pageFetchUrl)
    .replace("@/shared/utils/videoSettings", videoSettingsUrl)
    .replace("@kawarp/core", kawarpStubUrl)
    .replace("./adState", adStateUrl)
    .replace("./artworkBrightness", artworkBrightnessUrl)
);

const { DEFAULT_GRADIENT_SETTINGS } = await import(gradientSettingsUrl);
const { applyThemeLock, isThemeLockSatisfied } = await import(themeLockUrl);
const adState = await import(adStateUrl);
const kawarpManager = await import(kawarpManagerUrl);

class MockClassList {
  #set = new Set();
  #onMutate;
  constructor(onMutate) {
    this.#onMutate = onMutate;
  }
  add(...names) {
    for (const n of names) this.#set.add(n);
    this.#onMutate("attributes", "class");
  }
  remove(...names) {
    for (const n of names) this.#set.delete(n);
    this.#onMutate("attributes", "class");
  }
  contains(name) {
    return this.#set.has(name);
  }
}

class MockMutationObserver {
  #callback;
  #records = [];
  #subscriptions = [];
  disconnected = false;
  constructor(callback) {
    this.#callback = callback;
  }
  observe(target, options) {
    target._observers.add({ observer: this, options });
    this.#subscriptions.push(target);
  }
  disconnect() {
    this.disconnected = true;
    for (const target of this.#subscriptions) {
      for (const sub of target._observers) {
        if (sub.observer === this) target._observers.delete(sub);
      }
    }
    this.#subscriptions = [];
    this.#records = [];
  }
  _enqueue(record) {
    if (this.disconnected) return;
    const wasEmpty = this.#records.length === 0;
    this.#records.push(record);
    if (wasEmpty) {
      queueMicrotask(() => {
        if (this.disconnected || this.#records.length === 0) return;
        const batch = this.#records.splice(0, this.#records.length);
        this.#callback(batch, this);
      });
    }
  }
  takeRecords() {
    return this.#records.splice(0, this.#records.length);
  }
}

class MockElement {
  _observers = new Set();
  #attrs = new Map();
  children = [];
  parentNode = null;
  isConnected = true;
  error = null;
  videoWidth = 0;

  constructor(tagName, ownerDocument, id = "") {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = id;
    this.classList = new MockClassList((type, attributeName) => this._notify(type, attributeName));

    const styleState = { opacity: "", transition: "", filter: "" };
    const counts = { transition: 0, filter: 0 };
    this._styleCounts = counts;
    this.style = {
      get opacity() {
        return styleState.opacity;
      },
      set opacity(val) {
        styleState.opacity = val;
      },
      get transition() {
        return styleState.transition;
      },
      set transition(val) {
        counts.transition++;
        styleState.transition = val;
      },
      get filter() {
        return styleState.filter;
      },
      set filter(val) {
        counts.filter++;
        styleState.filter = val;
      },
    };
  }

  _notify(type, attributeName) {
    let cursor = this;
    while (cursor) {
      const isSelf = cursor === this;
      for (const { observer, options } of cursor._observers) {
        if (!isSelf && !options.subtree) continue;
        if (type === "attributes" && options.attributes) {
          if (!options.attributeFilter || options.attributeFilter.includes(attributeName)) {
            observer._enqueue({ type, target: this, attributeName });
          }
        } else if (type === "childList" && options.childList) {
          observer._enqueue({ type, target: this });
        }
      }
      cursor = cursor.parentNode;
    }
  }

  appendChild(child) {
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    this._notify("childList", null);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
    child.parentNode = null;
    child.isConnected = false;
    this._notify("childList", null);
  }

  setAttribute(name, value) {
    this.#attrs.set(name, String(value));
    this._notify("attributes", name);
  }

  removeAttribute(name) {
    this.#attrs.delete(name);
    this._notify("attributes", name);
  }

  hasAttribute(name) {
    return this.#attrs.has(name);
  }

  contains(other) {
    let cursor = other;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }

  querySelector(selector) {
    this.ownerDocument.elementQuerySelectorCalls++;
    if (selector === "video:not(#bls-video)") {
      return this.#findDescendant(el => el.tagName === "VIDEO" && el.id !== "bls-video");
    }
    return null;
  }

  #findDescendant(pred) {
    for (const child of this.children) {
      if (pred(child)) return child;
      const nested = child._findDescendant(pred);
      if (nested) return nested;
    }
    return null;
  }

  _findDescendant(pred) {
    return this.#findDescendant(pred);
  }
}

function createMockDocument() {
  const doc = {
    querySelectorCalls: 0,
    elementQuerySelectorCalls: 0,
    getElementByIdCalls: 0,
    defaultView: { MutationObserver: MockMutationObserver },
    nodes: [],
    querySelector(selector) {
      this.querySelectorCalls++;
      if (selector === "ytmusic-player-bar") {
        return this.nodes.find(n => n.isConnected && n.tagName === "YTMUSIC-PLAYER-BAR") ?? null;
      }
      if (selector === "#movie_player video:not(#bls-video)") {
        const player = this.nodes.find(n => n.isConnected && n.id === "movie_player");
        return player ? player._findDescendant(n => n.tagName === "VIDEO" && n.id !== "bls-video") : null;
      }
      if (selector === "#bls-video") {
        return this.nodes.find(n => n.isConnected && n.id === "bls-video") ?? null;
      }
      return null;
    },
    getElementById(id) {
      this.getElementByIdCalls++;
      return this.nodes.find(n => n.isConnected && n.id === id) ?? null;
    },
    createElement(tag, id = "") {
      const el = new MockElement(tag, this, id);
      this.nodes.push(el);
      return el;
    },
  };
  return doc;
}

test("performance toggles default off and remain editable under theme lock", () => {
  assert.equal(DEFAULT_GRADIENT_SETTINGS.perfFastDomLookup, false);
  assert.equal(DEFAULT_GRADIENT_SETTINGS.perfSkipRedundantFilter, false);

  const customPerf = {
    ...DEFAULT_GRADIENT_SETTINGS,
    perfFastDomLookup: true,
    perfSkipRedundantFilter: true,
  };
  assert.equal(isThemeLockSatisfied(customPerf), true);

  const locked = applyThemeLock({ ...customPerf, kawarpOpacity: 0.1 });
  assert.equal(locked.perfFastDomLookup, true);
  assert.equal(locked.perfSkipRedundantFilter, true);
  assert.equal(locked.kawarpOpacity, DEFAULT_GRADIENT_SETTINGS.kawarpOpacity);
});

test("adState fast DOM lookup eliminates steady-state querySelector scans while staying accurate", async () => {
  adState.resetAdStateCache();
  adState.setFastDomLookupEnabled(false);

  const doc = createMockDocument();
  const playerBar = doc.createElement("ytmusic-player-bar");
  const moviePlayer = doc.createElement("div", "movie_player");

  // Default OFF queries DOM every call.
  for (let i = 0; i < 6; i++) {
    assert.equal(adState.isAdPlaying(doc), false);
  }
  assert.equal(doc.querySelectorCalls, 6);

  // Opt-in ON queries only once in steady state.
  doc.querySelectorCalls = 0;
  doc.getElementByIdCalls = 0;
  adState.setFastDomLookupEnabled(true);

  for (let i = 0; i < 6; i++) {
    assert.equal(adState.isAdPlaying(doc), false);
  }
  assert.equal(doc.querySelectorCalls, 1);
  assert.equal(doc.getElementByIdCalls, 1);

  // Same-turn synchronous ad detection via takeRecords().
  playerBar.setAttribute("is-advertisement", "");
  assert.equal(adState.isAdPlaying(doc), true);
  assert.equal(doc.querySelectorCalls, 1);

  // Async microtask update when attribute removed.
  playerBar.removeAttribute("is-advertisement");
  await Promise.resolve();
  assert.equal(adState.isAdPlaying(doc), false);
  assert.equal(doc.querySelectorCalls, 1);

  // Movie player ad class triggers true; ad-created stays false.
  moviePlayer.classList.add("ad-created");
  assert.equal(adState.isAdPlaying(doc), false);
  moviePlayer.classList.add("ad-showing");
  assert.equal(adState.isAdPlaying(doc), true);
  moviePlayer.classList.remove("ad-showing");
  await Promise.resolve();
  assert.equal(adState.isAdPlaying(doc), false);

  // Re-queries cleanly when playerBar disconnects and a replacement connects.
  playerBar.isConnected = false;
  const newPlayerBar = doc.createElement("ytmusic-player-bar");
  newPlayerBar.setAttribute("is-advertisement", "");
  assert.equal(adState.isAdPlaying(doc), true);
  assert.equal(doc.querySelectorCalls, 2);

  adState.setFastDomLookupEnabled(false);
  adState.resetAdStateCache();
});

test("findPlayableVideo fast DOM lookup caches player & animated art videos safely", async () => {
  adState.resetAdStateCache();
  kawarpManager.resetVideoLookupCache();
  adState.setFastDomLookupEnabled(false);
  kawarpManager.setFastDomLookupEnabled(false);

  const doc = createMockDocument();
  doc.createElement("ytmusic-player-bar");
  const moviePlayer = doc.createElement("div", "movie_player");
  const playerVideo = doc.createElement("video");
  moviePlayer.appendChild(playerVideo);

  for (let i = 0; i < 5; i++) {
    assert.equal(kawarpManager.findPlayableVideo(doc), null);
  }
  assert.equal(doc.querySelectorCalls, 15); // adState + playerVideo + animatedArt per call

  // Enable fast DOM lookup -> 1 initial player discovery, then 0 querySelector calls.
  doc.querySelectorCalls = 0;
  doc.elementQuerySelectorCalls = 0;
  adState.setFastDomLookupEnabled(true);
  kawarpManager.setFastDomLookupEnabled(true);

  for (let i = 0; i < 5; i++) {
    assert.equal(kawarpManager.findPlayableVideo(doc), null);
  }
  assert.equal(doc.querySelectorCalls, 1); // only adState initial ytmusic-player-bar query
  assert.equal(doc.elementQuerySelectorCalls, 1); // only initial moviePlayer query

  // Becoming playable reuses cached video with zero queries.
  playerVideo.videoWidth = 640;
  assert.equal(kawarpManager.findPlayableVideo(doc), playerVideo);
  assert.equal(doc.elementQuerySelectorCalls, 1);

  // Animated art fallback works when playerVideo has zero width, and invalidates on replacement.
  playerVideo.videoWidth = 0;
  const artVideo = doc.createElement("video", "bls-video");
  artVideo.videoWidth = 512;
  assert.equal(kawarpManager.findPlayableVideo(doc), artVideo);
  assert.equal(kawarpManager.findPlayableVideo(doc), artVideo);

  // Replacing player video inside #movie_player invalidates via MutationObserver.
  moviePlayer.removeChild(playerVideo);
  const newPlayerVideo = doc.createElement("video");
  newPlayerVideo.videoWidth = 1280;
  moviePlayer.appendChild(newPlayerVideo);
  await Promise.resolve();
  assert.equal(kawarpManager.findPlayableVideo(doc), newPlayerVideo);
  assert.equal(doc.elementQuerySelectorCalls, 2);

  kawarpManager.setFastDomLookupEnabled(false);
  adState.setFastDomLookupEnabled(false);
});

test("applyArtworkBrightness skips redundant writes & quantizes brightness when opt-in enabled", () => {
  const doc = createMockDocument();
  const container = doc.createElement("div", "better-lyrics-kawarp-player");
  container.style.opacity = "0.8";

  const makeState = perfSkipRedundantFilter => ({
    container,
    videoMode: true,
    highlightLuminance: 0.9,
    lastAppliedTransition: null,
    lastAppliedFilter: null,
    lastSettings: {
      ...DEFAULT_GRADIENT_SETTINGS,
      autoDimBrightArtwork: true,
      videoDimStrength: 0.3,
      videoBrightnessTransition: 150,
      perfSkipRedundantFilter,
    },
  });

  // OFF: writes every call regardless of identical transition & tiny luminance deltas.
  const offState = makeState(false);
  const luminances = [0.9, 0.9001, 0.9002, 0.9003, 0.9004];
  for (const lum of luminances) {
    offState.highlightLuminance = lum;
    kawarpManager.applyArtworkBrightness(offState);
  }
  assert.equal(container._styleCounts.transition, 5);
  assert.equal(container._styleCounts.filter, 5);

  // ON: quantizes to 0.001 and writes transition & filter only when values change.
  const prevTransitionWrites = container._styleCounts.transition;
  const prevFilterWrites = container._styleCounts.filter;
  const onState = makeState(true);
  for (const lum of luminances) {
    onState.highlightLuminance = lum;
    kawarpManager.applyArtworkBrightness(onState);
  }
  assert.equal(container._styleCounts.transition - prevTransitionWrites, 1);
  assert.equal(container._styleCounts.filter - prevFilterWrites, 1);

  // Crossing quantized threshold or opacity state triggers a single targeted update.
  onState.highlightLuminance = 0.72;
  kawarpManager.applyArtworkBrightness(onState);
  assert.equal(container._styleCounts.transition - prevTransitionWrites, 1);
  assert.equal(container._styleCounts.filter - prevFilterWrites, 2);

  container.style.opacity = "0";
  kawarpManager.applyArtworkBrightness(onState);
  assert.equal(container._styleCounts.transition - prevTransitionWrites, 2);
  assert.equal(container._styleCounts.filter - prevFilterWrites, 2);
});
