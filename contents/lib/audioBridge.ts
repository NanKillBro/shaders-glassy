import { logger } from "@/shared/utils/logger";

interface AnalysisSettings {
  audioResponsive: boolean;
  audioBeatThreshold: number;
  audioSpeedMultiplier: number;
  kawarpAudioScaleBoost: number;
}

type AudioCommand =
  | { type: "bls-audio-set-logging"; showLogs: boolean }
  | { type: "bls-audio-initialize" }
  | { type: "bls-audio-start"; settings: AnalysisSettings }
  | { type: "bls-audio-stop" }
  | { type: "bls-audio-reconnect" };

type AudioResult =
  | { type: "bls-audio-ready" }
  | { type: "bls-audio-initialized" }
  | { type: "bls-audio-beat"; speedMultiplier: number; scaleMultiplier: number };

const messageFields = (message: unknown): Record<string, unknown> | null => {
  if (typeof message !== "object" || message === null) return null;
  return typeof (message as { type?: unknown }).type === "string" ? (message as Record<string, unknown>) : null;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isAnalysisSettings = (value: unknown): value is AnalysisSettings => {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.audioResponsive === "boolean" &&
    isFiniteNumber(settings.audioBeatThreshold) &&
    isFiniteNumber(settings.audioSpeedMultiplier) &&
    isFiniteNumber(settings.kawarpAudioScaleBoost)
  );
};

const isAudioCommand = (message: unknown): message is AudioCommand => {
  const fields = messageFields(message);
  if (!fields) return false;

  switch (fields.type) {
    case "bls-audio-set-logging":
      return typeof fields.showLogs === "boolean";
    case "bls-audio-start":
      return isAnalysisSettings(fields.settings);
    case "bls-audio-initialize":
    case "bls-audio-stop":
    case "bls-audio-reconnect":
      return true;
    default:
      return false;
  }
};

const isAudioResult = (message: unknown): message is AudioResult => {
  const fields = messageFields(message);
  if (!fields) return false;

  switch (fields.type) {
    case "bls-audio-ready":
    case "bls-audio-initialized":
      return true;
    case "bls-audio-beat":
      return isFiniteNumber(fields.speedMultiplier) && isFiniteNumber(fields.scaleMultiplier);
    default:
      return false;
  }
};

const postAudioMessage = (message: AudioCommand | AudioResult): void => {
  window.postMessage(message, window.location.origin);
};

const AUDIO_BUS_KEY = "__blyricsAudio";
const AUDIO_BUS_VERSION = 1;

const AUDIO_BUS_CONTRACT =
  `window.${AUDIO_BUS_KEY} must be { version, context, source, element } where source.context === context ` +
  "and source.mediaElement === element. Adopt the context already published on the bus rather than creating " +
  "a second AudioContext: a media element only ever gets one MediaElementAudioSourceNode, and audio nodes " +
  "cannot be connected across contexts.";

interface SharedAudioBus {
  version: number;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  element: HTMLMediaElement;
}

const adoptableBus = (value: unknown): SharedAudioBus | null => {
  if (typeof value !== "object" || value === null) return null;
  const { version, context, source, element } = value as Partial<SharedAudioBus>;
  if (typeof version !== "number") return null;
  if (!(context instanceof AudioContext)) return null;
  if (!(source instanceof MediaElementAudioSourceNode)) return null;
  if (!(element instanceof HTMLMediaElement)) return null;
  if (source.context !== context || source.mediaElement !== element) return null;
  return { version, context, source, element };
};

let hasReportedUnusableBus = false;

const reportUnusableBus = (reason: string): void => {
  if (hasReportedUnusableBus) return;
  hasReportedUnusableBus = true;
  logger.error(`Ignoring a shared audio bus that cannot be adopted (${reason}). ${AUDIO_BUS_CONTRACT}`);
};

const readSharedAudioBus = (): SharedAudioBus | null => {
  const existing = (window as unknown as Record<string, unknown>)[AUDIO_BUS_KEY];
  if (existing === undefined || existing === null) return null;

  const bus = adoptableBus(existing);
  if (!bus) {
    reportUnusableBus("malformed, or its source does not belong to its context and element");
    return null;
  }

  if (bus.version !== AUDIO_BUS_VERSION) {
    reportUnusableBus(`version ${bus.version}, this build speaks version ${AUDIO_BUS_VERSION}`);
    return null;
  }

  return bus;
};

const publishSharedAudioBus = (bus: SharedAudioBus): void => {
  (window as unknown as Record<string, unknown>)[AUDIO_BUS_KEY] = bus;
};

export {
  AUDIO_BUS_VERSION,
  isAudioCommand,
  isAudioResult,
  postAudioMessage,
  publishSharedAudioBus,
  readSharedAudioBus,
};
export type { AnalysisSettings, SharedAudioBus };
