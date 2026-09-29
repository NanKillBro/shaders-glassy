import type { DynamicMultipliers, GradientSettings } from "../constants/gradientSettings";

export const videoMotion = (settings: GradientSettings, multipliers: DynamicMultipliers) => {
  const beat = settings.audioResponsive && settings.videoAudioResponsive && multipliers.isBeat;
  return {
    speed: settings.videoAnimationSpeed * (beat ? settings.videoBeatSpeedMultiplier : 1),
    scale: 1 + (beat ? settings.videoBeatZoom / 100 : 0),
  };
};
