import React from "react";
import { ExportIcon, ImportIcon, InfoIcon, ResetIcon } from "./icons";

interface FooterProps {
  isAboutOpen: boolean;
  onAboutToggle: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
}

export const Footer: React.FC<FooterProps> = ({ isAboutOpen, onAboutToggle, onImport, onExport, onReset }) => (
  <div className="footer">
    <button type="button" className="text-button" aria-pressed={isAboutOpen} onClick={onAboutToggle}>
      <InfoIcon size={14} />
      About
    </button>
    <div className="footer__spacer" />
    <button type="button" className="text-button" onClick={onImport} title="Import settings">
      <ImportIcon size={14} />
      Import
    </button>
    <button type="button" className="text-button" onClick={onExport} title="Export settings">
      <ExportIcon size={14} />
      Export
    </button>
    <button type="button" className="text-button" onClick={onReset} title="Reset all settings to defaults">
      <ResetIcon size={14} />
      Reset
    </button>
  </div>
);
