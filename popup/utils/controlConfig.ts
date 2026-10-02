export interface ControlConfig {
  min: number;
  max: number;
  step: number;
}

export const getControlConfig = (key: string): ControlConfig => {
  const videoControls: Record<string, ControlConfig> = {
    videoBrightnessSampleSize: { min: 8, max: 64, step: 8 },
    videoBrightnessInterval: { min: 0, max: 1000, step: 25 },
    videoOpacity: { min: 0, max: 1, step: 0.01 },
    videoWarpIntensity: { min: 0, max: 1, step: 0.01 },
    videoBlurPasses: { min: 0, max: 40, step: 1 },
    videoAnimationSpeed: { min: 0, max: 2, step: 0.01 },
    videoSaturation: { min: 0, max: 2, step: 0.01 },
    videoDithering: { min: 0, max: 0.05, step: 0.001 },
    videoHdrDitheringScale: { min: 0, max: 1, step: 0.05 },
    videoDimStrength: { min: 0, max: 1, step: 0.01 },
    videoBrightnessTransition: { min: 0, max: 1000, step: 10 },
    videoBeatSpeedMultiplier: { min: 1, max: 8, step: 0.1 },
    videoBeatZoom: { min: 0, max: 10, step: 0.1 },
    videoZoomAttack: { min: 0.01, max: 1, step: 0.01 },
    videoZoomRelease: { min: 0.01, max: 1, step: 0.01 },
    videoSampleWidth: { min: 16, max: 512, step: 16 },
    videoSampleHeight: { min: 9, max: 288, step: 9 },
    videoFrameRate: { min: 0, max: 120, step: 1 },
    videoColorResponse: { min: 0, max: 1000, step: 5 },
    videoDownsampleFactor: { min: 1.25, max: 4, step: 0.25 },
  };
  if (videoControls[key]) return videoControls[key];
  let min = 0,
    max = 2,
    step = 0.01;

  if (key === "audioSpeedMultiplier") {
    min = 2;
    max = 8;
    step = 0.1;
  } else if (key === "kawarpAudioScaleBoost") {
    min = 0;
    max = 10;
    step = 0.1;
  } else if (key === "audioBeatThreshold") {
    min = 0.01;
    max = 1.5;
    step = 0.005;
  } else if (key === "kawarpOpacity") {
    min = 0;
    max = 1;
    step = 0.01;
  } else if (key === "kawarpWarpIntensity") {
    min = 0;
    max = 1;
    step = 0.01;
  } else if (key === "kawarpBlurPasses") {
    min = 1;
    max = 40;
    step = 1;
  } else if (key === "kawarpAnimationSpeed") {
    min = 0;
    max = 2;
    step = 0.01;
  } else if (key === "kawarpTransitionDuration") {
    min = 100;
    max = 5000;
    step = 100;
  } else if (key === "kawarpSaturation") {
    min = 0;
    max = 2;
    step = 0.01;
  } else if (key === "autoDimStrength") {
    min = 0;
    max = 1;
    step = 0.01;
  } else if (key === "kawarpDithering") {
    min = 0;
    max = 0.05;
    step = 0.001;
  }

  return { min, max, step };
};
