import type { GradientSettings } from "@/popup/types";

export const CONTROL_HINTS: Partial<Record<keyof GradientSettings, string>> = {
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
  audioBeatThreshold:
    "Amplitude a peak has to clear to count as a beat. Lower is more sensitive and triggers on quieter sounds.",
  audioSpeedMultiplier: "How far animation speed jumps on a detected beat. Applied momentarily, then eased back down.",
  kawarpAudioScaleBoost:
    "How far the background zooms on a detected beat, as a percentage. Creates the pulsing effect.",
};
