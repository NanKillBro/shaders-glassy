import { DEFAULT_GRADIENT_SETTINGS, type GradientSettings } from "./gradientSettings";

/**
 * The desktop app ships this extension alongside a "glassy merge theme" whose CSS is
 * tuned against these effects. While that theme is active the host locks the settings
 * to their defaults, so the two never fight each other.
 *
 * Both signals below are written by the host (pear-desktop, `src/plugins/better-lyrics/theme.ts`)
 * and must stay string-identical to the constants there. In a plain browser neither is
 * ever present, so every check degrades to "unlocked" and the extension behaves normally.
 */

/** Set on the music.youtube.com origin's localStorage by the host's preload script. */
export const THEME_LOCK_FLAG = "blsGlassyThemeLock";

/**
 * The same signal on the page's document element, written alongside the flag above.
 * Two channels because they fail in different ways: the DOM is shared by every
 * JavaScript world regardless of how storage is partitioned, but is not built yet at
 * the point the host writes; storage is available immediately. Either one is enough.
 */
export const THEME_LOCK_ATTRIBUTE = "data-bls-glassy-lock";

/** Appended to the popup URL by the host, so the popup is correct on its first paint. */
export const POPUP_LOCK_HASH = "#glassy-locked";

/**
 * Settings that stay editable under the lock. Only the *visuals* are managed by the
 * theme; debug logging is a troubleshooting aid with no bearing on how the theme looks.
 */
export const UNLOCKED_SETTING_KEYS = ["showLogs"] as const satisfies readonly (keyof GradientSettings)[];

/** Defaults for every locked key, with the unlocked ones left out. */
const LOCKED_DEFAULTS: Partial<GradientSettings> = (() => {
  const locked: Partial<GradientSettings> = { ...DEFAULT_GRADIENT_SETTINGS };
  for (const key of UNLOCKED_SETTING_KEYS) delete locked[key];
  return locked;
})();

/** Forces every locked key back to its default, preserving the unlocked ones. */
export const applyThemeLock = (settings: GradientSettings): GradientSettings => ({
  ...settings,
  ...LOCKED_DEFAULTS,
});

/** True when `settings` already matches what {@link applyThemeLock} would produce. */
export const isThemeLockSatisfied = (settings: GradientSettings): boolean =>
  (Object.keys(LOCKED_DEFAULTS) as (keyof GradientSettings)[]).every(
    key => settings[key] === LOCKED_DEFAULTS[key]
  );

/**
 * Read on every check rather than latched once: the host's preload races the content
 * script, so the flag can land after this script has already started.
 */
export const isPageThemeLocked = (): boolean => {
  if (document.documentElement?.hasAttribute(THEME_LOCK_ATTRIBUTE)) return true;

  try {
    return window.localStorage.getItem(THEME_LOCK_FLAG) !== null;
  } catch {
    // Storage can be blocked outright by the browser's site settings.
    return false;
  }
};

export const isPopupThemeLocked = (): boolean => {
  try {
    return window.location.hash === POPUP_LOCK_HASH;
  } catch {
    return false;
  }
};
