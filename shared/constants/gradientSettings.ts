export interface GradientSettings {
  enabled: boolean;
  // Kawarp settings
  kawarpOpacity: number;
  kawarpWarpIntensity: number;
  kawarpBlurPasses: number;
  kawarpAnimationSpeed: number;
  kawarpTransitionDuration: number;
  kawarpSaturation: number;
  kawarpDithering: number;
  kawarpAudioScaleBoost: number;
  // Video ambient mode (independent of album artwork settings)
  videoEnabled: boolean;
  videoOpacity: number;
  videoWarpIntensity: number;
  videoBlurPasses: number;
  videoAnimationSpeed: number;
  videoSaturation: number;
  videoDithering: number;
  videoHdrDitheringScale: number;
  videoAutoDim: boolean;
  videoDimStrength: number;
  videoBrightnessTransition: number;
  videoAudioResponsive: boolean;
  videoBeatSpeedMultiplier: number;
  videoBeatZoom: number;
  videoZoomAttack: number;
  videoZoomRelease: number;
  videoSampleWidth: number;
  videoSampleHeight: number;
  videoFrameRate: number;
  videoColorResponse: number;
  videoFrameTransition: number;
  videoStagedDownsampling: boolean;
  videoHighPrecisionSampling: boolean;
  videoGpuProcessing: boolean;
  videoGpuBrightnessSize: number;
  videoGpuBrightnessInterval: number;
  videoDownsampleFactor: number;
  // Bright artwork
  autoDimBrightArtwork: boolean;
  autoDimStrength: number;
  // Audio responsive
  audioResponsive: boolean;
  audioSpeedMultiplier: number;
  audioBeatThreshold: number;
  pauseOnInactive: boolean;
  // Other settings
  showLogs: boolean;
  showOnBrowsePages: boolean;
  // Animated album art
  enableAnimatedArt: boolean;
}

export interface DynamicMultipliers {
  isBeat?: boolean;
  speedMultiplier: number;
  scaleMultiplier: number;
}

export const DEFAULT_GRADIENT_SETTINGS: GradientSettings = {
  enabled: true,
  // Album artwork defaults
  kawarpOpacity: 1,
  kawarpWarpIntensity: 1.0,
  kawarpBlurPasses: 8,
  kawarpAnimationSpeed: 1.0,
  kawarpTransitionDuration: 1000,
  kawarpSaturation: 1.5,
  kawarpDithering: 0.008,
  kawarpAudioScaleBoost: 2,
  // Video defaults; 0 FPS limit follows decoded frames.
  videoEnabled: true,
  videoOpacity: 1,
  videoWarpIntensity: 1,
  videoBlurPasses: 7,
  videoAnimationSpeed: 1,
  videoSaturation: 1.5,
  videoDithering: 0.008,
  videoHdrDitheringScale: 1,
  videoAutoDim: false,
  videoDimStrength: 0.3,
  videoBrightnessTransition: 150,
  videoAudioResponsive: true,
  videoBeatSpeedMultiplier: 4,
  videoBeatZoom: 2,
  videoZoomAttack: 0.5,
  videoZoomRelease: 0.12,
  videoSampleWidth: 208,
  videoSampleHeight: 117,
  videoFrameRate: 0,
  videoColorResponse: 0,
  videoFrameTransition: 11,
  videoStagedDownsampling: true,
  videoHighPrecisionSampling: true,
  videoGpuProcessing: true,
  videoGpuBrightnessSize: 32,
  videoGpuBrightnessInterval: 100,
  videoDownsampleFactor: 2,
  // Bright artwork
  autoDimBrightArtwork: true,
  autoDimStrength: 0.3,
  // Audio responsive
  audioResponsive: true,
  audioSpeedMultiplier: 4,
  audioBeatThreshold: 0.75,
  pauseOnInactive: true,
  // Other settings
  showLogs: false,
  showOnBrowsePages: false,
  // Animated album art
  enableAnimatedArt: true,
};

export const DEFAULT_DYNAMIC_MULTIPLIERS: DynamicMultipliers = {
  speedMultiplier: 1,
  scaleMultiplier: 1,
};

export const GRADIENT_SETTINGS_STORAGE_KEY = "gradientSettings";
