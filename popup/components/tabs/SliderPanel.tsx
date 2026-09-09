import React from "react";
import { GradientSettings } from "@/popup/types";
import { CONTROL_HINTS } from "@/popup/utils";
import { ControlSlider } from "../ControlSlider";

export interface SliderPanelProps {
  settings: GradientSettings;
  onSettingChange: (key: keyof GradientSettings, value: number) => void;
  onSettingReset: (key: keyof GradientSettings) => void;
  /** Set while the host's theme manages these values — see shared/constants/themeLock.ts. */
  locked?: boolean;
}

interface Props extends SliderPanelProps {
  keys: (keyof GradientSettings)[];
}

export const SliderPanel: React.FC<Props> = ({ keys, settings, onSettingChange, onSettingReset, locked }) => (
  <>
    {keys.map(key => (
      <ControlSlider
        key={key}
        keyName={key}
        value={settings[key] as number}
        onChange={onSettingChange}
        onReset={onSettingReset}
        hint={CONTROL_HINTS[key]}
        disabled={locked}
      />
    ))}
  </>
);
