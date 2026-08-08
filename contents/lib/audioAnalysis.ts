import type { DynamicMultipliers, GradientSettings } from "@/shared/constants/gradientSettings";
import { isAudioResult, postAudioMessage } from "./audioBridge";

// Drives the page-world graph in audioGraph.ts. The element listeners need no
// AudioContext, so they stay on this side.

interface FacadeState {
  element: HTMLMediaElement | null;
  isInitialized: boolean;
  playHandler: (() => void) | null;
  pauseHandler: (() => void) | null;
  onPlaybackStateChange: ((isPlaying: boolean) => void) | null;
  onBeatDetected: ((multipliers: DynamicMultipliers) => void) | null;
  elementPollId: number | null;
  pendingStart: { settings: GradientSettings } | null;
  pendingInitialize: { showLogs: boolean } | null;
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
  pendingInitialize: null,
};

const ELEMENT_POLL_MS = 1000;

const reusableMultipliers: DynamicMultipliers = {
  speedMultiplier: 1,
  scaleMultiplier: 1,
};

const currentElement = (): HTMLMediaElement | null => document.querySelector("audio, video");

const postInitialize = (showLogs: boolean): void => {
  postAudioMessage({ type: "bls-audio-initialize", showLogs });
};

const postStart = (settings: GradientSettings): void => {
  postAudioMessage({
    type: "bls-audio-start",
    showLogs: settings.showLogs,
    settings: {
      audioResponsive: settings.audioResponsive,
      audioBeatThreshold: settings.audioBeatThreshold,
      audioSpeedMultiplier: settings.audioSpeedMultiplier,
      kawarpAudioScaleBoost: settings.kawarpAudioScaleBoost,
    },
  });
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
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data: unknown = event.data;
  if (!isAudioResult(data)) return;

  // The two scripts race, and a loser posts into a window nobody is listening on.
  if (data.type === "bls-audio-ready") {
    if (state.pendingInitialize) postInitialize(state.pendingInitialize.showLogs);
    return;
  }

  if (data.type === "bls-audio-initialized") {
    state.isInitialized = true;
    state.pendingInitialize = null;
    // A start issued before the claim landed would otherwise be dropped.
    if (state.pendingStart) postStart(state.pendingStart.settings);
    return;
  }

  reusableMultipliers.speedMultiplier = data.speedMultiplier;
  reusableMultipliers.scaleMultiplier = data.scaleMultiplier;
  state.onBeatDetected?.(reusableMultipliers);
});

export const initializeAudioAnalysis = async (showLogs = true): Promise<void> => {
  trackElement();
  state.pendingInitialize = { showLogs };
  postInitialize(showLogs);
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
  postAudioMessage({ type: "bls-audio-stop" });
};

export const checkAndReconnectElement = (): void => {
  if (!state.isInitialized) return;
  const element = currentElement();
  if (element) bindListenersTo(element);
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
