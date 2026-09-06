export const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const getControlLabel = (key: string): string => {
  const labels: Record<string, string> = {
    kawarpOpacity: "Opacity",
    kawarpWarpIntensity: "Warp intensity",
    kawarpBlurPasses: "Blur passes",
    kawarpSaturation: "Saturation",
    kawarpDithering: "Dithering",
    kawarpAnimationSpeed: "Animation speed",
    kawarpTransitionDuration: "Transition duration",
    audioBeatThreshold: "Beat threshold",
    audioSpeedMultiplier: "Speed multiplier",
    kawarpAudioScaleBoost: "Scale boost",
  };

  return labels[key] || capitalizeFirst(key);
};
