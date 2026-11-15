import React, { useId } from "react";
import { Tooltip } from "./Tooltip";

interface ControlToggleProps {
  label: string;
  hint?: string;
  tooltip?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export const ControlToggle: React.FC<ControlToggleProps> = ({
  label,
  hint,
  tooltip,
  value,
  onChange,
  disabled = false,
}) => {
  const labelId = useId();
  const labelNode = (
    <span className={tooltip ? "row__label row__label--tooltip" : "row__label"} id={labelId}>
      {label}
    </span>
  );

  return (
    <div className={`row${disabled ? " row--disabled" : ""}`}>
      <div className="row__text">
        {tooltip ? <Tooltip content={tooltip}>{labelNode}</Tooltip> : labelNode}
        {hint && <span className="row__hint">{hint}</span>}
      </div>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!value)}
      />
    </div>
  );
};
