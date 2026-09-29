export const formatValue = (key: string, value: number): string => {
  if (value === undefined || value === null) return "0";
  if (key === "videoBrightnessSampleSize") return `${Math.round(value)} × ${Math.round(value)}`;
  if (key === "videoBrightnessInterval") return `${Math.round(value)} ms`;
  if (key === "videoFrameRate") return value === 0 ? "Native" : `${Math.round(value)} FPS`;
  if (key === "videoSampleWidth" || key === "videoSampleHeight") return `${Math.round(value)} px`;
  if (["videoColorResponse", "videoBrightnessTransition"].includes(key)) return `${Math.round(value)} ms`;
  if (["videoHdrDitheringScale", "videoDimStrength", "videoZoomAttack", "videoZoomRelease"].includes(key))
    return `${Math.round(value * 100)}%`;
  if (key === "videoBlurPasses") return value === 0 ? "Off" : value.toFixed(0);
  if (key === "videoDithering") return value.toFixed(3);
  if (key === "videoBeatZoom") return `${value.toFixed(1)}%`;
  if (key === "videoBeatSpeedMultiplier" || key === "videoDownsampleFactor") return `${value.toFixed(2)}×`;
  if (key === "audioSpeedMultiplier") return value.toFixed(1) + "x";
  if (key === "kawarpAudioScaleBoost") return value.toFixed(1) + "%";
  if (key === "audioBeatThreshold") return value.toFixed(3);
  if (key === "kawarpBlurPasses") return value.toFixed(0);
  if (key === "kawarpTransitionDuration") return value.toFixed(0) + "ms";
  if (key === "kawarpDithering") return value.toFixed(3);
  if (key === "autoDimStrength") return `${Math.round(value * 100)}%`;
  return value.toFixed(2);
};
