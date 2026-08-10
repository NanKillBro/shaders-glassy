import React from "react";
import { GradientSettings } from "@/popup/types";
import { ControlToggle } from "../ControlToggle";
import { SliderPanel, SliderPanelProps } from "./SliderPanel";

const AUDIO_KEYS = ["audioBeatThreshold", "audioSpeedMultiplier", "kawarpAudioScaleBoost"] as const;

interface AudioTabProps extends SliderPanelProps {
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

export const AudioTab: React.FC<AudioTabProps> = ({ onToggleChange, ...sliderProps }) => (
  <div className="panel">
    <ControlToggle
      label="Audio reactive"
      hint="Pulse the background in time with the music."
      value={sliderProps.settings.audioResponsive}
      onChange={value => onToggleChange("audioResponsive", value)}
    />
    <div className={`subgroup${sliderProps.settings.audioResponsive ? "" : " subgroup--disabled"}`}>
      <SliderPanel keys={[...AUDIO_KEYS]} {...sliderProps} />
    </div>
  </div>
);
