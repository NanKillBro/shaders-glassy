import React from "react";
import { GradientSettings } from "@/popup/types";
import { ControlToggle } from "../ControlToggle";

interface GeneralTabProps {
  settings: GradientSettings;
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
  /** Set while the host's theme manages these values — see shared/constants/themeLock.ts. */
  locked?: boolean;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ settings, onToggleChange, locked }) => (
  <div className="panel">
    <ControlToggle
      label="Audio reactive"
      hint="Pulse the background in time with the music."
      value={settings.audioResponsive}
      onChange={value => onToggleChange("audioResponsive", value)}
      disabled={locked}
    />
    <ControlToggle
      label="Animated album art"
      hint="Play looping artwork when the album has it."
      value={settings.enableAnimatedArt}
      onChange={value => onToggleChange("enableAnimatedArt", value)}
      disabled={locked}
    />
    <ControlToggle
      label="Show on browse pages"
      hint="Extends the effect to home and search. Costs performance."
      value={settings.showOnBrowsePages}
      onChange={value => onToggleChange("showOnBrowsePages", value)}
      disabled={locked}
    />
    <ControlToggle
      label="Pause when inactive"
      hint="Stop rendering while the tab is hidden."
      value={settings.pauseOnInactive}
      onChange={value => onToggleChange("pauseOnInactive", value)}
      disabled={locked}
    />
  </div>
);
