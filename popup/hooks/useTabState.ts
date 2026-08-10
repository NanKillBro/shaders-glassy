import { useCallback, useState } from "react";
import { SettingsTab } from "@/popup/types";

export const useTabState = (initialTab: SettingsTab = "general") => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const selectTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    setIsAboutOpen(false);
  }, []);

  const toggleAbout = useCallback(() => setIsAboutOpen(open => !open), []);

  return { activeTab, selectTab, isAboutOpen, toggleAbout };
};
