import React from "react";
import { GradientSettings } from "@/popup/types";
import { CONTROL_HINTS } from "@/popup/utils";
import { ControlSlider } from "../ControlSlider";

export interface SliderPanelProps {
  settings: GradientSettings;
  onSettingChange: (key: keyof GradientSettings, value: number) => void;
  onSettingReset: (key: keyof GradientSettings) => void;
}

interface Props extends SliderPanelProps {
  keys: (keyof GradientSettings)[];
}

export const SliderPanel: React.FC<Props> = ({ keys, settings, onSettingChange, onSettingReset }) => (
  <>
    {keys.map(key => (
      <ControlSlider
        key={key}
        keyName={key}
        value={settings[key] as number}
        onChange={onSettingChange}
        onReset={onSettingReset}
        hint={CONTROL_HINTS[key]}
      />
    ))}
  </>
);
