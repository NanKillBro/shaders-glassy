import React from "react";
import { ExportIcon, ImportIcon, InfoIcon, ResetIcon } from "./icons";

interface FooterProps {
  isAboutOpen: boolean;
  onAboutToggle: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
  /** Set while the host's theme manages these values — see shared/constants/themeLock.ts. */
  locked?: boolean;
}

/** Export stays available while locked: reading the settings out changes nothing. */
export const Footer: React.FC<FooterProps> = ({
  isAboutOpen,
  onAboutToggle,
  onImport,
  onExport,
  onReset,
  locked = false,
}) => {
  const lockedTitle = "Managed by the Glassy theme";

  return (
    <div className="footer">
      <button type="button" className="text-button" aria-pressed={isAboutOpen} onClick={onAboutToggle}>
        <InfoIcon size={14} />
        About
      </button>
      <div className="footer__spacer" />
      <button
        type="button"
        className="text-button"
        onClick={onImport}
        disabled={locked}
        title={locked ? lockedTitle : "Import settings"}
      >
        <ImportIcon size={14} />
        Import
      </button>
      <button type="button" className="text-button" onClick={onExport} title="Export settings">
        <ExportIcon size={14} />
        Export
      </button>
      <button
        type="button"
        className="text-button"
        onClick={onReset}
        disabled={locked}
        title={locked ? lockedTitle : "Reset all settings to defaults"}
      >
        <ResetIcon size={14} />
        Reset
      </button>
    </div>
  );
};
