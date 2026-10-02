import React from "react";
import { GradientSettings } from "@/popup/types";
import { ControlToggle } from "../ControlToggle";
import { SliderPanel, SliderPanelProps } from "./SliderPanel";

const LOOK_KEYS = [
  "kawarpOpacity",
  "kawarpWarpIntensity",
  "kawarpBlurPasses",
  "kawarpSaturation",
  "kawarpDithering",
] as const;

interface LookTabProps extends SliderPanelProps {
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

export const LookTab: React.FC<LookTabProps> = ({ onToggleChange, ...sliderProps }) => (
  <div className="panel">
    <SliderPanel keys={[...LOOK_KEYS]} {...sliderProps} />
    <ControlToggle
      label="Dim bright artwork"
      hint="Darken white and very bright covers so the lyrics stay readable."
      value={sliderProps.settings.autoDimBrightArtwork}
      onChange={value => onToggleChange("autoDimBrightArtwork", value)}
      disabled={sliderProps.locked}
    />
    <div className={`subgroup${sliderProps.settings.autoDimBrightArtwork ? "" : " subgroup--disabled"}`}>
      <SliderPanel keys={["autoDimStrength"]} {...sliderProps} />
    </div>
  </div>
);
