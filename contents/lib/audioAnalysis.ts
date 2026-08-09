import type { DynamicMultipliers, GradientSettings } from "@/shared/constants/gradientSettings";
import { PLAYER_MEDIA_SELECTOR } from "@/shared/constants/mediaElements";
import { type AnalysisSettings, audioResultFrom, clampBeatMultipliers, postAudioMessage } from "./audioBridge";

interface FacadeState {
  element: HTMLMediaElement | null;
  isInitialized: boolean;
  playHandler: (() => void) | null;
  pauseHandler: (() => void) | null;
  onPlaybackStateChange: ((isPlaying: boolean) => void) | null;
  onBeatDetected: ((multipliers: DynamicMultipliers) => void) | null;
  elementPollId: number | null;
  pendingStart: { settings: GradientSettings } | null;
  pendingInitialize: boolean;
  authorizedSettings: AnalysisSettings | null;
  showLogs: boolean;
}

const state: FacadeState = {
  element: null,
  isInitialized: false,
  playHandler: null,
  pauseHandler: null,
  onPlaybackStateChange: null,
  onBeatDetected: null,
  elementPollId: null,
  pendingStart: null,
  pendingInitialize: false,
  authorizedSettings: null,
  showLogs: false,
};

const ELEMENT_POLL_MS = 1000;

const reusableMultipliers: DynamicMultipliers = {
  speedMultiplier: 1,
  scaleMultiplier: 1,
};

const currentElement = (): HTMLMediaElement | null => document.querySelector(PLAYER_MEDIA_SELECTOR);

const postLogging = (showLogs: boolean): void => {
  postAudioMessage({ type: "bls-audio-set-logging", showLogs });
};

const postInitialize = (): void => {
  postAudioMessage({ type: "bls-audio-initialize" });
};

const postStart = (settings: GradientSettings): void => {
  const analysisSettings: AnalysisSettings = {
    audioResponsive: settings.audioResponsive,
    audioBeatThreshold: settings.audioBeatThreshold,
    audioSpeedMultiplier: settings.audioSpeedMultiplier,
    kawarpAudioScaleBoost: settings.kawarpAudioScaleBoost,
  };
  state.authorizedSettings = analysisSettings;
  postAudioMessage({ type: "bls-audio-start", settings: analysisSettings });
};

const removeElementListeners = (element: HTMLMediaElement): void => {
  if (state.playHandler) {
    element.removeEventListener("play", state.playHandler);
  }
  if (state.pauseHandler) {
    element.removeEventListener("pause", state.pauseHandler);
  }
};

const addElementListeners = (element: HTMLMediaElement): void => {
  state.playHandler = () => {
    state.onPlaybackStateChange?.(true);
  };
  state.pauseHandler = () => {
    state.onPlaybackStateChange?.(false);
  };
  element.addEventListener("play", state.playHandler);
  element.addEventListener("pause", state.pauseHandler);
};

const bindListenersTo = (element: HTMLMediaElement): void => {
  if (element === state.element) return;
  if (state.element) removeElementListeners(state.element);
  state.element = element;
  addElementListeners(element);
};

const trackElement = (): void => {
  const element = currentElement();
  if (element) bindListenersTo(element);
  if (state.elementPollId !== null || state.element) return;
  state.elementPollId = window.setTimeout(() => {
    state.elementPollId = null;
    trackElement();
  }, ELEMENT_POLL_MS);
};

window.addEventListener("message", event => {
  const message = audioResultFrom(event);
  if (!message) return;

  switch (message.type) {
    case "bls-audio-ready":
      postLogging(state.showLogs);
      if (state.pendingInitialize) postInitialize();
      break;
    case "bls-audio-initialized": {
      state.isInitialized = true;
      state.pendingInitialize = false;
      const pendingStart = state.pendingStart;
      state.pendingStart = null;
      if (pendingStart) postStart(pendingStart.settings);
      break;
    }
    case "bls-audio-beat": {
      const bounded = clampBeatMultipliers(message, state.authorizedSettings);
      reusableMultipliers.speedMultiplier = bounded.speedMultiplier;
      reusableMultipliers.scaleMultiplier = bounded.scaleMultiplier;
      state.onBeatDetected?.(reusableMultipliers);
      break;
    }
  }
});

export const setAudioLogging = (showLogs: boolean): void => {
  state.showLogs = showLogs;
  postLogging(showLogs);
};

export const initializeAudioAnalysis = async (showLogs: boolean): Promise<void> => {
  trackElement();
  setAudioLogging(showLogs);
  state.pendingInitialize = true;
  postInitialize();
};

export const startAudioAnalysis = (
  settings: GradientSettings,
  onBeatDetected: (multipliers: DynamicMultipliers) => void
): void => {
  state.onBeatDetected = onBeatDetected;
  state.pendingStart = { settings };
  postStart(settings);
};

export const stopAudioAnalysis = (): void => {
  state.pendingStart = null;
  state.onBeatDetected = null;
  state.authorizedSettings = null;
  postAudioMessage({ type: "bls-audio-stop" });
};

export const checkAndReconnectElement = (): void => {
  const element = currentElement();
  if (element) bindListenersTo(element);
  if (!state.isInitialized) return;
  postAudioMessage({ type: "bls-audio-reconnect" });
};

export const isAudioInitialized = (): boolean => state.isInitialized;

export const setPlaybackStateCallback = (callback: ((isPlaying: boolean) => void) | null): void => {
  state.onPlaybackStateChange = callback;
};

export const isPlaying = (): boolean => {
  const element = state.element ?? currentElement();
  return element ? !element.paused : false;
};
