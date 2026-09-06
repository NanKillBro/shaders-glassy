import React from "react";
import { GradientSettings, defaultSettings } from "@/popup/types";
import { formatValue, getControlConfig, getControlLabel } from "@/popup/utils";
import { ResetIcon } from "./icons";
import { Tooltip } from "./Tooltip";

interface ControlSliderProps {
  keyName: keyof GradientSettings;
  value: number;
  onChange: (key: keyof GradientSettings, value: number) => void;
  onReset: (key: keyof GradientSettings) => void;
  hint?: string;
}

export const ControlSlider: React.FC<ControlSliderProps> = ({ keyName, value, onChange, onReset, hint }) => {
  const { min, max, step } = getControlConfig(keyName);
  const label = getControlLabel(keyName);
  const defaultValue = defaultSettings[keyName] as number;
  const isModified = value !== defaultValue;
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const labelNode = <span className="slider-row__label">{label}</span>;

  return (
    <div className={`slider-row${isModified ? " slider-row--modified" : ""}`}>
      <div className="slider-row__head">
        {hint ? <Tooltip content={hint}>{labelNode}</Tooltip> : labelNode}
        <button
          type="button"
          className="slider-row__reset"
          onClick={() => onReset(keyName)}
          title={`Reset ${label.toLowerCase()} to ${formatValue(keyName, defaultValue)}`}
        >
          <ResetIcon size={13} />
        </button>
        <span className="slider-row__value">{formatValue(keyName, value)}</span>
      </div>
      <input
        type="range"
        className="slider"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={event => onChange(keyName, parseFloat(event.target.value))}
      />
    </div>
  );
};
