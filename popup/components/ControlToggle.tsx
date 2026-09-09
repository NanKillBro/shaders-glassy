import React, { useId } from "react";

interface ControlToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export const ControlToggle: React.FC<ControlToggleProps> = ({ label, hint, value, onChange, disabled = false }) => {
  const labelId = useId();

  return (
    <div className={`row${disabled ? " row--disabled" : ""}`}>
      <div className="row__text">
        <span className="row__label" id={labelId}>
          {label}
        </span>
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
