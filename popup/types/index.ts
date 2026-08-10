export {
  type GradientSettings,
  DEFAULT_GRADIENT_SETTINGS as defaultSettings,
} from "@/shared/constants/gradientSettings";

export const SETTINGS_TABS = ["general", "look", "motion", "audio", "extras"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];
