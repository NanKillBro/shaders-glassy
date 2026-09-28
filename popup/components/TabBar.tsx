import { SETTINGS_TABS, SettingsTab } from "@/popup/types";
import React from "react";

interface TabBarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  look: "Look",
  motion: "Motion",
  video: "Video",
  audio: "Audio",
  extras: "Extras",
};

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => (
  <div className="tabs" role="tablist">
    {SETTINGS_TABS.map(tab => (
      <button
        key={tab}
        type="button"
        className="tab"
        role="tab"
        aria-selected={activeTab === tab}
        onClick={() => onTabChange(tab)}
      >
        {TAB_LABELS[tab]}
      </button>
    ))}
  </div>
);
