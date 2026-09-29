export const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const getControlLabel = (key: string): string => {
  const labels: Record<string, string> = {
    videoBrightnessSampleSize: "Brightness sample size",
    videoBrightnessInterval: "Brightness check interval",
    videoOpacity: "Opacity",
    videoWarpIntensity: "Warp intensity",
    videoBlurPasses: "Blur passes",
    videoAnimationSpeed: "Animation speed",
    videoSaturation: "Saturation",
    videoDithering: "Dithering",
    videoHdrDitheringScale: "HDR dither amount",
    videoDimStrength: "Dim strength",
    videoBrightnessTransition: "Dim response",
    videoBeatSpeedMultiplier: "Beat speed boost",
    videoBeatZoom: "Beat zoom",
    videoZoomAttack: "Zoom attack",
    videoZoomRelease: "Zoom release",
    videoSampleWidth: "Sample width",
    videoSampleHeight: "Sample height",
    videoFrameRate: "Capture limit",
    videoColorResponse: "Color smoothing",
    videoDownsampleFactor: "Downsample step",
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
    autoDimStrength: "Dim strength",
  };

  return labels[key] || capitalizeFirst(key);
};
