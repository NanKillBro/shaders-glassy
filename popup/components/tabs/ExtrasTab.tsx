import React from "react";
import { GradientSettings } from "@/popup/types";
import { CacheOverview } from "../CacheOverview";
import { ControlToggle } from "../ControlToggle";

interface ExtrasTabProps {
  settings: GradientSettings;
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

export const ExtrasTab: React.FC<ExtrasTabProps> = ({ settings, onToggleChange }) => (
  <div className="panel">
    <ControlToggle
      label="Debug logs"
      hint="Print audio and render events to the console."
      value={settings.showLogs}
      onChange={value => onToggleChange("showLogs", value)}
    />
    <CacheOverview />
  </div>
);
