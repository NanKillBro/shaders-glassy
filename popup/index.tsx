import React from "react";
import "./popup.css";

import { isPopupThemeLocked } from "@/shared/constants/themeLock";
import {
  AboutTab,
  AudioTab,
  ExtrasTab,
  Footer,
  GeneralTab,
  Header,
  LookTab,
  MotionTab,
  NowPlaying,
  TabBar,
  ThemeLockNotice,
  VideoTab,
} from "./components";
import { useContentScript, useGradientSettings, useTabState } from "./hooks";
import { GradientSettings, SettingsTab, defaultSettings } from "./types";

/** Fixed for the life of the window: the host stamps it on the URL before load. */
const isLocked = isPopupThemeLocked();

const Popup: React.FC = () => {
  const { activeTab, selectTab, isAboutOpen, toggleAbout } = useTabState();
  const { songTitle, songAuthor, albumArtUrl, animatedArtUrl, isAd, updateGradientSettings } = useContentScript();

  const {
    gradientSettings,
    setGradientSettings,
    updateGradientSetting,
    resetGradientSettings,
    exportSettings,
    importSettings,
  } = useGradientSettings(isLocked);

  const handleSettingChange = async (key: keyof GradientSettings, value: number) => {
    await updateGradientSettings(updateGradientSetting(key, value));
  };

  const handleToggleChange = async (key: keyof GradientSettings, value: boolean) => {
    const newSettings = { ...gradientSettings, [key]: value };
    await setGradientSettings(newSettings);
    await updateGradientSettings(newSettings);
  };

  const handleSettingReset = async (key: keyof GradientSettings) => {
    await handleSettingChange(key, defaultSettings[key] as number);
  };

  const handleResetAll = async () => {
    await updateGradientSettings(await resetGradientSettings());
  };

  const handleImport = async () => {
    const imported = await importSettings();
    if (imported) await updateGradientSettings(imported);
  };

  const sliderProps = {
    settings: gradientSettings,
    onSettingChange: handleSettingChange,
    onSettingReset: handleSettingReset,
    locked: isLocked,
  };

  const panels: Record<SettingsTab, React.ReactNode> = {
    general: <GeneralTab settings={gradientSettings} onToggleChange={handleToggleChange} locked={isLocked} />,
    look: <LookTab {...sliderProps} onToggleChange={handleToggleChange} />,
    motion: <MotionTab {...sliderProps} />,
    video: <VideoTab {...sliderProps} onToggleChange={handleToggleChange} />,
    audio: <AudioTab {...sliderProps} onToggleChange={handleToggleChange} />,
    // Debug logs and the artwork cache tools stay usable for troubleshooting.
    extras: <ExtrasTab settings={gradientSettings} onToggleChange={handleToggleChange} />,
  };

  return (
    <div className="popup">
      <Header />

      <NowPlaying
        songTitle={songTitle}
        songAuthor={songAuthor}
        albumArtUrl={albumArtUrl}
        animatedArtUrl={animatedArtUrl}
        isAd={isAd}
        enabled={gradientSettings.enabled}
        onEnabledChange={value => handleToggleChange("enabled", value)}
        locked={isLocked}
      />

      {!isAboutOpen && isLocked && <ThemeLockNotice />}
      {!isAboutOpen && <TabBar activeTab={activeTab} onTabChange={selectTab} />}

      <div className="scroll">{isAboutOpen ? <AboutTab /> : panels[activeTab]}</div>

      <Footer
        isAboutOpen={isAboutOpen}
        onAboutToggle={toggleAbout}
        onImport={handleImport}
        onExport={exportSettings}
        onReset={handleResetAll}
        locked={isLocked}
      />
    </div>
  );
};

export default Popup;
