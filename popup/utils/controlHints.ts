import type { GradientSettings } from "@/popup/types";

export const CONTROL_HINTS: Partial<Record<keyof GradientSettings, string>> = {
  videoBrightnessSampleSize:
    "Width and height of the tiny brightness thumbnail. Larger values improve dimming estimates but cost more to analyze.",
  videoBrightnessInterval:
    "Minimum time between asynchronous brightness checks. Checks stop while the video is paused.",
  videoOpacity: "Visibility of the background while sampling the music video.",
  videoWarpIntensity: "Direct warp strength for video. Zero preserves the frame; 1 allows the full abstract warp.",
  videoBlurPasses: "Extra shader blur passes. Zero bypasses the blur passes; sampling can still soften the image.",
  videoAnimationSpeed: "How quickly video colors flow, independently of the artwork animation speed.",
  videoSaturation: "Color intensity for video frames. 1 preserves the sampled colors.",
  videoDithering: "Noise used to hide bands in video gradients. Zero disables it.",
  videoHdrDitheringScale:
    "Fraction of dithering retained with a 16-bit canvas on an HDR display. Keep 100% if bands are visible; canvas precision does not verify the final display pipeline.",
  videoDimStrength: "How much bright video frames are darkened for lyric readability.",
  videoBrightnessTransition: "How quickly dimming follows changes in frame brightness.",
  videoBeatSpeedMultiplier: "Warp speed on a detected beat. Uses the beat detection enabled in the Audio tab.",
  videoBeatZoom: "Extra zoom on a detected beat, independent of the artwork scale boost.",
  videoZoomAttack: "How quickly zoom rises. Larger values respond more sharply.",
  videoZoomRelease: "How quickly zoom settles after a beat. Smaller values produce a longer release.",
  videoSampleWidth: "Columns of sampled colors. Larger samples retain more detail and cost a little more GPU time.",
  videoSampleHeight: "Rows of sampled colors. Larger samples retain more detail.",
  videoFrameRate: "Maximum fresh captures per second. Zero follows decoded video frames.",
  videoColorResponse:
    "Blends color changes over this many milliseconds. Higher values soften flashes and strobes in the video.",
  videoDownsampleFactor:
    "Maximum shrink per downsampling stage. Smaller steps average fine detail more carefully; larger steps are cheaper.",
  kawarpOpacity:
    "Visibility of the effect layer. At 0 it is invisible, at 1 fully opaque. Use it to blend the background into the original interface.",
  kawarpWarpIntensity:
    "How much the fluid simulation stretches the artwork. At 0 the image stays still, higher values make it flow.",
  kawarpBlurPasses:
    "How soft the background gets. More passes blend the colours further, fewer keep detail from the artwork visible.",
  kawarpAnimationSpeed:
    "How fast the warping animates. Lower is slow and hypnotic, higher is energetic. Works with audio reactive for beat-synced motion.",
  kawarpTransitionDuration:
    "How long the crossfade takes when the artwork changes. Shorter feels snappy, longer feels cinematic.",
  kawarpSaturation:
    "Colour intensity of the artwork. Above 1.0 is more vivid, below 1.0 is muted. 1.0 keeps the original colours.",
  kawarpDithering: "Adds fine noise so smooth gradients do not band into visible steps. Higher values add more grain.",
  autoDimStrength:
    "How far bright artwork is darkened so white lyrics stay readable. At 0 nothing changes, higher values darken bright covers more.",
  audioBeatThreshold:
    "Amplitude a peak has to clear to count as a beat. Lower is more sensitive and triggers on quieter sounds.",
  audioSpeedMultiplier: "How far animation speed jumps on a detected beat. Applied momentarily, then eased back down.",
  kawarpAudioScaleBoost:
    "How far the background zooms on a detected beat, as a percentage. Creates the pulsing effect.",
};
