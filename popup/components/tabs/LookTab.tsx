import React from "react";
import { SliderPanel, SliderPanelProps } from "./SliderPanel";

const LOOK_KEYS = [
  "kawarpOpacity",
  "kawarpWarpIntensity",
  "kawarpBlurPasses",
  "kawarpSaturation",
  "kawarpDithering",
] as const;

export const LookTab: React.FC<SliderPanelProps> = props => (
  <div className="panel">
    <SliderPanel keys={[...LOOK_KEYS]} {...props} />
  </div>
);
