import {
  DEFAULT_DYNAMIC_MULTIPLIERS,
  type DynamicMultipliers,
  type GradientSettings,
} from "@/shared/constants/gradientSettings";
import { applyThemeLock, isPageThemeLocked, isThemeLockSatisfied } from "@/shared/constants/themeLock";
import { logger } from "@/shared/utils/logger";
import * as animatedArtManager from "./animatedArtManager";
import * as audioAnalysis from "./audioAnalysis";
import * as kawarpManager from "./kawarpManager";
import * as pipManager from "./pipManager";
import * as storage from "./storage";

let gradientSettings: GradientSettings;
let dynamicMultipliers: DynamicMultipliers = { ...DEFAULT_DYNAMIC_MULTIPLIERS };

const getCurrentPageType = (): "player" | "homepage" | "search" | "other" => {
  const hasPlayerPage = !!document.getElementById("player-page");
  const hasSearchPage = !!document.getElementById("search-page");
  const hasHomepageGradient = !!document.querySelector(".background-gradient.style-scope.ytmusic-browse-response");

  logger.log("getCurrentPageType check:", {
    hasPlayerPage,
    hasSearchPage,
    hasHomepageGradient,
  });

  if (hasPlayerPage) return "player";
  if (hasSearchPage) return "search";
  if (hasHomepageGradient) return "homepage";
  return "other";
};

const getTargetSelectorFromPageType = (pageType: "player" | "homepage" | "search"): string => {
  if (pageType === "player") return "player-page";
  if (pageType === "search") return "search-page";
  return "homepage";
};

const handleBeatDetected = (multipliers: DynamicMultipliers): void => {
  dynamicMultipliers = { ...multipliers };
  kawarpManager.updateKawarpSpeed(gradientSettings, dynamicMultipliers);
};

const handlePlaybackStateChange = (isPlaying: boolean): void => {
  if (!gradientSettings.pauseOnInactive) return;

  logger.log("Playback state changed:", isPlaying ? "playing" : "paused");

  if (isPlaying) {
    kawarpManager.resumeKawarp();
    animatedArtManager.resumeAnimatedArt();
  } else {
    kawarpManager.pauseKawarp();
    animatedArtManager.pauseAnimatedArt();
  }
};

const handleAudioResponsiveToggle = (): void => {
  if (gradientSettings.audioResponsive) {
    audioAnalysis.startAudioAnalysis(gradientSettings, handleBeatDetected);
    return;
  }

  audioAnalysis.stopAudioAnalysis();
  dynamicMultipliers = { ...DEFAULT_DYNAMIC_MULTIPLIERS };
  kawarpManager.updateKawarpSpeed(gradientSettings, dynamicMultipliers);
};

const destroyBrowsePageEffects = (): void => {
  if (kawarpManager.hasKawarp("homepage")) {
    logger.log("Removing homepage kawarp");
    kawarpManager.destroyKawarp("homepage");
  }
  if (kawarpManager.hasKawarp("search")) {
    logger.log("Removing search kawarp");
    kawarpManager.destroyKawarp("search");
  }
};

/**
 * The host's preload races this content script, so the lock flag can land after the
 * settings have already been read. Re-checked on every gradient pass rather than
 * latched once at startup, which lets a late flag heal itself through the normal
 * settings-update path.
 */
const enforceThemeLock = async (): Promise<void> => {
  if (!isPageThemeLocked() || isThemeLockSatisfied(gradientSettings)) return;

  logger.log("Glassy theme lock active - restoring default effect settings");
  const locked = applyThemeLock(gradientSettings);
  await storage.saveGradientSettings(locked);
  await updateGradientSettings(locked);
};

export const checkAndUpdateGradient = async (): Promise<void> => {
  // Ahead of the `enabled` guard: `enabled` is itself a managed setting, so a
  // locked-but-disabled state has to be able to recover from here.
  await enforceThemeLock();

  if (!gradientSettings.enabled) {
    logger.log("Effects disabled - skipping gradient update");
    return;
  }

  const pageType = getCurrentPageType();
  const hasPlayerEffect = kawarpManager.hasKawarp("player");
  const hasHomepageEffect = kawarpManager.hasKawarp("homepage");
  const hasSearchEffect = kawarpManager.hasKawarp("search");

  logger.log("checkAndUpdateGradient", {
    pageType,
    hasPlayerEffect,
    hasHomepageEffect,
    hasSearchEffect,
    showOnBrowsePages: gradientSettings.showOnBrowsePages,
  });

  if (pageType === "player") {
    logger.log("On player page - creating/updating kawarp");
    if (!hasPlayerEffect) {
      await kawarpManager.createKawarp(gradientSettings, dynamicMultipliers, "player-page");
    } else {
      await kawarpManager.updateKawarpImage("player");
    }

    if (gradientSettings.showOnBrowsePages) {
      if (hasHomepageEffect) {
        await kawarpManager.updateKawarpImage("homepage");
      }
      if (hasSearchEffect) {
        await kawarpManager.updateKawarpImage("search");
      }
      if (!hasHomepageEffect) {
        logger.log("Creating homepage kawarp");
        await kawarpManager.createKawarp(gradientSettings, dynamicMultipliers, "homepage");
      }
      if (!hasSearchEffect) {
        logger.log("Creating search kawarp");
        await kawarpManager.createKawarp(gradientSettings, dynamicMultipliers, "search-page");
      }
    } else {
      destroyBrowsePageEffects();
    }
  } else if (pageType === "homepage" || pageType === "search") {
    if (gradientSettings.showOnBrowsePages) {
      const targetSelector = getTargetSelectorFromPageType(pageType);
      const hasTargetEffect = pageType === "homepage" ? hasHomepageEffect : hasSearchEffect;

      logger.log(`On ${pageType} - showOnBrowsePages enabled`, {
        hasTargetEffect,
      });

      if (!hasTargetEffect) {
        logger.log(`Creating ${pageType} kawarp`);
        await kawarpManager.createKawarp(gradientSettings, dynamicMultipliers, targetSelector);
      }
    } else {
      destroyBrowsePageEffects();
    }

    if (hasPlayerEffect) {
      logger.log("Not on player page - removing player effect");
      kawarpManager.destroyKawarp("player");
    }
  } else {
    logger.log("On other page - removing all effects");
    kawarpManager.destroyKawarp();
  }
};

export const updateGradientSettings = async (incomingSettings: GradientSettings): Promise<void> => {
  // A popup that has not noticed the lock yet, or an imported settings file, must
  // not be able to push managed values back in.
  const settings = isPageThemeLocked() ? applyThemeLock(incomingSettings) : incomingSettings;

  const wasEnabled = gradientSettings.enabled;
  const wasAudioResponsive = gradientSettings.audioResponsive;
  const wasShowOnBrowsePages = gradientSettings.showOnBrowsePages;
  const wasPauseOnInactive = gradientSettings.pauseOnInactive;
  const wasAnimatedArtEnabled = gradientSettings.enableAnimatedArt;
  const audioSettingsChanged =
    gradientSettings.audioSpeedMultiplier !== settings.audioSpeedMultiplier ||
    gradientSettings.kawarpAudioScaleBoost !== settings.kawarpAudioScaleBoost ||
    gradientSettings.audioBeatThreshold !== settings.audioBeatThreshold;

  gradientSettings = settings;

  // Handle animated art toggle
  if (wasAnimatedArtEnabled !== settings.enableAnimatedArt) {
    animatedArtManager.setEnabled(settings.enableAnimatedArt);
  }

  logger.setEnabled(settings.showLogs);
  audioAnalysis.setAudioLogging(settings.showLogs);

  if (wasEnabled !== settings.enabled) {
    if (!settings.enabled) {
      logger.log("Effects disabled - destroying all kawarp instances");
      kawarpManager.destroyKawarp();
      audioAnalysis.stopAudioAnalysis();
    } else {
      logger.log("Effects enabled - reinitializing");
      await checkAndUpdateGradient();
      if (settings.audioResponsive) {
        audioAnalysis.startAudioAnalysis(settings, handleBeatDetected);
      }
    }
    pipManager.sync();
    return;
  }

  if (!settings.enabled) {
    return;
  }

  if (wasAudioResponsive !== settings.audioResponsive || audioSettingsChanged) {
    handleAudioResponsiveToggle();
  }

  if (wasShowOnBrowsePages !== settings.showOnBrowsePages) {
    await checkAndUpdateGradient();
  }

  if (wasPauseOnInactive !== settings.pauseOnInactive) {
    if (settings.pauseOnInactive && audioAnalysis.isAudioInitialized() && !audioAnalysis.isPlaying()) {
      kawarpManager.pauseKawarp();
    } else if (!settings.pauseOnInactive) {
      kawarpManager.resumeKawarp();
    }
  }

  if (kawarpManager.hasKawarp()) {
    kawarpManager.updateKawarpSettings(settings, dynamicMultipliers);
  }
};

export const initializeSettings = async (): Promise<GradientSettings> => {
  gradientSettings = await storage.loadGradientSettings();
  logger.setEnabled(gradientSettings.showLogs);

  // Under the lock the customised values are wiped, not merely ignored, so storage
  // always matches what the popup shows. `showLogs` survives — see themeLock.ts.
  if (isPageThemeLocked() && !isThemeLockSatisfied(gradientSettings)) {
    logger.log("Glassy theme lock active - resetting stored effect settings to defaults");
    gradientSettings = applyThemeLock(gradientSettings);
    await storage.saveGradientSettings(gradientSettings);
  }

  audioAnalysis.setPlaybackStateCallback(handlePlaybackStateChange);
  await animatedArtManager.initialize(gradientSettings.enableAnimatedArt);
  return gradientSettings;
};

export const getSettings = (): GradientSettings => gradientSettings;

export const getDynamicMultipliers = (): DynamicMultipliers => dynamicMultipliers;

export const startAudioIfEnabled = (): void => {
  if (gradientSettings.enabled && gradientSettings.audioResponsive) {
    audioAnalysis.startAudioAnalysis(gradientSettings, handleBeatDetected);
  }
};

export const hasActiveEffect = (): boolean => {
  return kawarpManager.hasKawarp("player");
};

export const cleanup = (): void => {
  audioAnalysis.stopAudioAnalysis();
  kawarpManager.destroyKawarp();
  animatedArtManager.cleanup();
};
