import type { DynamicMultipliers, GradientSettings } from "../constants/gradientSettings";

export const videoMotion = (settings: GradientSettings, multipliers: DynamicMultipliers) => {
  // A separate beat flag keeps video zoom independent of artwork boost amounts.
  const beat =
    settings.audioResponsive &&
    settings.videoAudioResponsive &&
    (multipliers.isBeat ?? (multipliers.speedMultiplier > 1 || multipliers.scaleMultiplier > 1));
  return {
    speed: settings.videoAnimationSpeed * (beat ? settings.videoBeatSpeedMultiplier : 1),
    scale: 1 + (beat ? settings.videoBeatZoom / 100 : 0),
  };
};
