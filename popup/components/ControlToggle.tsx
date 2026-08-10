import React, { useId } from "react";

interface ControlToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export const ControlToggle: React.FC<ControlToggleProps> = ({ label, hint, value, onChange }) => {
  const labelId = useId();

  return (
    <div className="row">
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
        onClick={() => onChange(!value)}
      />
    </div>
  );
};
