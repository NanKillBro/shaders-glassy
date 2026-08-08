interface AnalysisSettings {
  audioResponsive: boolean;
  audioBeatThreshold: number;
  audioSpeedMultiplier: number;
  kawarpAudioScaleBoost: number;
}

type AudioCommand =
  | { type: "bls-audio-initialize"; showLogs: boolean }
  | { type: "bls-audio-start"; settings: AnalysisSettings; showLogs: boolean }
  | { type: "bls-audio-stop" }
  | { type: "bls-audio-reconnect" };

type AudioResult =
  | { type: "bls-audio-ready" }
  | { type: "bls-audio-initialized" }
  | { type: "bls-audio-beat"; speedMultiplier: number; scaleMultiplier: number };

const AUDIO_COMMAND_TYPES: readonly string[] = [
  "bls-audio-initialize",
  "bls-audio-start",
  "bls-audio-stop",
  "bls-audio-reconnect",
];

const AUDIO_RESULT_TYPES: readonly string[] = ["bls-audio-ready", "bls-audio-initialized", "bls-audio-beat"];

const messageType = (data: unknown): string | null => {
  if (typeof data !== "object" || data === null) return null;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
};

const isAudioCommand = (data: unknown): data is AudioCommand => {
  const type = messageType(data);
  return type !== null && AUDIO_COMMAND_TYPES.includes(type);
};

const isAudioResult = (data: unknown): data is AudioResult => {
  const type = messageType(data);
  return type !== null && AUDIO_RESULT_TYPES.includes(type);
};

const postAudioMessage = (message: AudioCommand | AudioResult): void => {
  window.postMessage(message, window.location.origin);
};

const AUDIO_BUS_KEY = "__blyricsAudio";
const AUDIO_BUS_VERSION = 1;

interface SharedAudioBus {
  version: number;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  element: HTMLMediaElement;
}

const isSharedAudioBus = (value: unknown): value is SharedAudioBus => {
  if (typeof value !== "object" || value === null) return false;
  const bus = value as Record<string, unknown>;
  return (
    typeof bus.version === "number" &&
    bus.context instanceof AudioContext &&
    bus.source instanceof MediaElementAudioSourceNode &&
    bus.element instanceof HTMLMediaElement
  );
};

const readSharedAudioBus = (): SharedAudioBus | null => {
  const existing = (window as unknown as Record<string, unknown>)[AUDIO_BUS_KEY];
  if (!isSharedAudioBus(existing)) return null;
  return existing.version === AUDIO_BUS_VERSION ? existing : null;
};

const publishSharedAudioBus = (bus: SharedAudioBus): void => {
  (window as unknown as Record<string, unknown>)[AUDIO_BUS_KEY] = bus;
};

export { isAudioCommand, isAudioResult, postAudioMessage, publishSharedAudioBus, readSharedAudioBus };
export type { AnalysisSettings, SharedAudioBus };
