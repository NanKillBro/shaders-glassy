import { PLAYER_MEDIA_SELECTOR } from "@/shared/constants/mediaElements";
import { logger } from "@/shared/utils/logger";
import {
  type AnalysisSettings,
  AUDIO_BUS_VERSION,
  isAudioCommand,
  postAudioMessage,
  publishSharedAudioBus,
  readSharedAudioBus,
  type SharedAudioBus,
} from "./audioBridge";

const ANALYSIS_INTERVAL = 100;
const MIN_VOLUME_FOR_ANALYSIS = 0.005;
const INIT_RETRY_MS = 1000;
const ANALYSER_FFT_SIZE = 1024;
const ANALYSER_SMOOTHING = 0.8;

interface GraphState {
  context: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaElementAudioSourceNode | null;
  element: HTMLMediaElement | null;
  dataArray: Uint8Array<ArrayBuffer> | null;
  rafId: number | null;
  initTimeoutId: number | null;
  resumeContextHandler: (() => Promise<void>) | null;
  settings: AnalysisSettings | null;
  isInitialized: boolean;
  lastAnalysisTime: number;
}

const state: GraphState = {
  context: null,
  analyser: null,
  source: null,
  element: null,
  dataArray: null,
  rafId: null,
  initTimeoutId: null,
  resumeContextHandler: null,
  settings: null,
  isInitialized: false,
  lastAnalysisTime: 0,
};

const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode | null>();

const currentElement = (): HTMLMediaElement | null => document.querySelector(PLAYER_MEDIA_SELECTOR);

const detachResumeOnGesture = (): void => {
  if (!state.resumeContextHandler) return;
  document.removeEventListener("click", state.resumeContextHandler);
  document.removeEventListener("keydown", state.resumeContextHandler);
  state.resumeContextHandler = null;
};

const attachResumeOnGesture = (context: AudioContext): void => {
  if (context.state !== "suspended") return;

  detachResumeOnGesture();

  state.resumeContextHandler = async () => {
    if (context.state === "suspended") {
      await context.resume();
    }
    detachResumeOnGesture();
  };

  document.addEventListener("click", state.resumeContextHandler);
  document.addEventListener("keydown", state.resumeContextHandler);
};

const buildAnalyser = (context: AudioContext, source: MediaElementAudioSourceNode): void => {
  if (state.source && state.analyser) {
    state.source.disconnect(state.analyser);
  }
  state.analyser = context.createAnalyser();
  state.analyser.fftSize = ANALYSER_FFT_SIZE;
  state.analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
  state.dataArray = new Uint8Array(new ArrayBuffer(state.analyser.frequencyBinCount));
  source.connect(state.analyser);
};

const ownContext = (): AudioContext => {
  if (!state.context) {
    state.context = new AudioContext();
  }
  return state.context;
};

const sourceFor = (context: AudioContext, element: HTMLMediaElement): MediaElementAudioSourceNode | null => {
  const cached = elementSources.get(element);
  if (cached !== undefined) return cached;

  try {
    const source = context.createMediaElementSource(element);
    source.connect(context.destination);
    elementSources.set(element, source);
    return source;
  } catch (error) {
    elementSources.set(element, null);
    logger.error("Could not capture the audio element, effects will not react to sound:", error);
    return null;
  }
};

const acquireBus = (element: HTMLMediaElement): SharedAudioBus | null => {
  const shared = readSharedAudioBus();
  if (shared && shared.element === element) {
    attachResumeOnGesture(shared.context);
    logger.log("Audio analysis attached to an existing shared bus");
    return shared;
  }

  const context = shared?.context ?? ownContext();
  attachResumeOnGesture(context);

  const source = sourceFor(context, element);
  if (!source) return null;

  const bus: SharedAudioBus = { version: AUDIO_BUS_VERSION, context, source, element };
  publishSharedAudioBus(bus);
  return bus;
};

const bindTo = (element: HTMLMediaElement): boolean => {
  const bus = acquireBus(element);
  if (!bus) return false;

  buildAnalyser(bus.context, bus.source);
  state.context = bus.context;
  state.source = bus.source;
  state.element = element;
  return true;
};

const initialize = (): void => {
  if (state.isInitialized) return;

  if (state.initTimeoutId !== null) {
    clearTimeout(state.initTimeoutId);
    state.initTimeoutId = null;
  }

  try {
    const element = currentElement();
    if (!element) {
      state.initTimeoutId = window.setTimeout(initialize, INIT_RETRY_MS);
      return;
    }

    if (!bindTo(element)) {
      state.initTimeoutId = window.setTimeout(initialize, INIT_RETRY_MS);
      return;
    }

    state.isInitialized = true;
    postAudioMessage({ type: "bls-audio-initialized" });
    logger.log("Audio analysis initialized (passthrough mode)");
  } catch (error) {
    logger.error("Error initializing audio analysis:", error);
  }
};

const analyzeAudioFrame = (timestamp: number): void => {
  const settings = state.settings;
  if (!state.analyser || !state.dataArray || !state.element || !settings) {
    state.rafId = null;
    return;
  }

  if (timestamp - state.lastAnalysisTime >= ANALYSIS_INTERVAL) {
    state.analyser.getByteTimeDomainData(state.dataArray);

    const currentVolume = state.element.volume;
    const volumeMultiplier = currentVolume > MIN_VOLUME_FOR_ANALYSIS ? 1 / currentVolume : 1;

    let peak = 0;
    const length = state.dataArray.length;
    const threshold = settings.audioBeatThreshold;

    for (let i = 0; i < length; i++) {
      const rawAmplitude = Math.abs(state.dataArray[i] - 128) / 128;
      const amplitude = rawAmplitude * volumeMultiplier;
      if (amplitude > peak) {
        peak = amplitude;
        if (peak > threshold) break;
      }
    }

    const isBeat = peak > threshold;
    const scaleBoost = settings.kawarpAudioScaleBoost;

    postAudioMessage({
      type: "bls-audio-beat",
      speedMultiplier: settings.audioResponsive && isBeat ? settings.audioSpeedMultiplier : 1,
      scaleMultiplier: settings.audioResponsive && isBeat ? 1 + scaleBoost / 100 : 1,
    });

    state.lastAnalysisTime = timestamp;
  }

  state.rafId = requestAnimationFrame(analyzeAudioFrame);
};

const startAnalysis = (settings: AnalysisSettings): void => {
  state.settings = settings;
  if (state.rafId !== null) cancelAnimationFrame(state.rafId);
  state.lastAnalysisTime = 0;
  state.rafId = requestAnimationFrame(analyzeAudioFrame);
};

const stopAnalysis = (): void => {
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  if (state.initTimeoutId !== null) {
    clearTimeout(state.initTimeoutId);
    state.initTimeoutId = null;
  }
  state.lastAnalysisTime = 0;
};

const reconnect = (): void => {
  if (!state.isInitialized) return;

  const element = currentElement();
  if (!element) return;

  const elementChanged = element !== state.element;
  const boundElementDetached = state.element !== null && !document.contains(state.element);
  if (!elementChanged && !boundElementDetached) return;

  logger.log("Audio element changed, reconnecting...");
  if (!bindTo(element)) {
    logger.error("Could not rebind audio analysis to the current media element");
  }
};

window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message: unknown = event.data;
  if (!isAudioCommand(message)) return;

  switch (message.type) {
    case "bls-audio-initialize":
      logger.setEnabled(message.showLogs);
      initialize();
      break;
    case "bls-audio-start":
      logger.setEnabled(message.showLogs);
      startAnalysis(message.settings);
      break;
    case "bls-audio-stop":
      stopAnalysis();
      break;
    case "bls-audio-reconnect":
      reconnect();
      break;
  }
});

postAudioMessage({ type: "bls-audio-ready" });
