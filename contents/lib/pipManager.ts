import type { DynamicMultipliers, GradientSettings } from "@/shared/constants/gradientSettings";
import { logger } from "@/shared/utils/logger";
import * as kawarpManager from "./kawarpManager";

const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";
const SHELL_SELECTOR = ".blyrics-pip-shell";
const ART_PROPERTY = "--blyrics-pip-art";
const BACKDROP_SELECTOR = ".blyrics-pip-backdrop";
const SUPPRESSION_STYLE_ID = "better-lyrics-shaders-backdrop-suppression";
const SHELL_TIMEOUT_MS = 5000;

// Some Gecko builds hand a content script a cross-origin wrapper on the Picture-in-Picture window,
// where the first property access throws (bugzilla 2045666 and 2053139). Rather than infer that
// from the browser or a version number, touch the window once and latch the answer: Firefox 153
// scripts it fine from an MV2 content script, so a version gate would disable a path that works.
//
// Latched rather than retried because the alternative is throwing and logging on every song change
// for the lifetime of the tab.
let isWindowUnreachable = false;

const canScript = (pipWindow: Window): boolean => {
  try {
    return !!pipWindow.document.body;
  } catch {
    return false;
  }
};

interface PipSession {
  window: Window;
  shell: HTMLElement;
  artObserver: MutationObserver;
  suppressionStyle: HTMLStyleElement;
}

// Better Lyrics paints its own blurred album-art wash. Kawarp replaces it rather than stacking
// under it. Suppressed from this side rather than through a hook in Better Lyrics: shaders already
// depends on that window's shell class and art custom property, so one more selector is the same
// coupling, and doing it here works against every version that has shipped the window.
const suppressBuiltInBackdrop = (pipWindow: Window): HTMLStyleElement => {
  const style = pipWindow.document.createElement("style");
  style.id = SUPPRESSION_STYLE_ID;
  style.textContent = `${BACKDROP_SELECTOR} { opacity: 0 !important; }`;
  pipWindow.document.head.appendChild(style);

  if (!pipWindow.document.querySelector(BACKDROP_SELECTOR)) {
    logger.log(`No ${BACKDROP_SELECTOR} found; Better Lyrics may have renamed it`);
  }

  return style;
};

let session: PipSession | null = null;
let openObserver: MutationObserver | null = null;
let isMounting = false;
let isSyncPending = false;
let getSettings: (() => GradientSettings) | null = null;
let getMultipliers: (() => DynamicMultipliers) | null = null;

const readArtworkUrl = (shell: HTMLElement): string | null => {
  const raw = shell.style.getPropertyValue(ART_PROPERTY).trim();
  const match = raw.match(/^url\(["']?(.+?)["']?\)$/);
  return match ? match[1] : null;
};

// Better Lyrics sets blyrics-pip-open before it runs body.replaceChildren(shell), so anything
// mounted on the attribute alone gets discarded. Wait for the shell itself.
const waitForShell = (pipWindow: Window): Promise<HTMLElement | null> =>
  new Promise(resolve => {
    const existing = pipWindow.document.querySelector<HTMLElement>(SHELL_SELECTOR);
    if (existing) {
      resolve(existing);
      return;
    }

    // Deliberately the opener's timer, not pipWindow's. A closing Picture-in-Picture window
    // discards its pending timers along with its document, so a timeout scheduled there would
    // never fire and this promise would never settle, wedging the caller's mounting guard.
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, SHELL_TIMEOUT_MS);

    const observer = new MutationObserver(() => {
      const shell = pipWindow.document.querySelector<HTMLElement>(SHELL_SELECTOR);
      if (!shell) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(shell);
    });

    observer.observe(pipWindow.document.body, { childList: true, subtree: true });
  });

// A closed window's pagehide can arrive after its successor has already opened, so only the window
// that owns the current session may tear it down. Better Lyrics hit the same ordering (pipHost.ts).
const teardown = (owner?: Window): void => {
  if (!session || (owner && session.window !== owner)) return;
  logger.log("Tearing down the floating window effect");

  session.artObserver.disconnect();
  session.suppressionStyle.remove();
  kawarpManager.destroyKawarp(kawarpManager.PIP_LOCATION);
  session = null;
};

const isPipEffectWanted = (): boolean =>
  document.documentElement.hasAttribute(PIP_OPEN_ATTRIBUTE) && getSettings?.().enabled === true;

// Identity is not liveness. For roughly 50ms after close, documentPictureInPicture.window still
// hands back the same dead window, while `closed` flips synchronously. Without the `closed` term a
// mount can finish against a window whose pagehide has already fired, leaving `session` bound to a
// window that can never tear itself down. Keep this call adjacent to the pagehide registration
// below: the stretch between them must stay synchronous for that guarantee to hold.
const canFinishMount = (pipWindow: Window): boolean =>
  !pipWindow.closed && window.documentPictureInPicture?.window === pipWindow && isPipEffectWanted();

// `session` is only assigned after two awaits, so it cannot guard against a second entry on its own.
const mount = async (): Promise<void> => {
  if (session || isMounting || isWindowUnreachable || !getSettings || !getMultipliers) return;

  const pipWindow = window.documentPictureInPicture?.window;
  if (!pipWindow) return;

  if (!canScript(pipWindow)) {
    isWindowUnreachable = true;
    logger.log("This browser does not allow scripting the floating window, disabling the effect");
    return;
  }

  isMounting = true;
  let hasInstance = false;
  try {
    const shell = await waitForShell(pipWindow);
    if (!shell) {
      logger.log("Floating window shell never appeared, skipping");
      return;
    }

    if (!canFinishMount(pipWindow)) return;

    const settings = getSettings();
    const mounted = await kawarpManager.createPipKawarp(pipWindow, settings, getMultipliers(), readArtworkUrl(shell));
    if (!mounted) return;
    hasInstance = true;

    if (!canFinishMount(pipWindow)) return;

    const suppressionStyle = suppressBuiltInBackdrop(pipWindow);

    const artObserver = new MutationObserver(() => {
      const url = readArtworkUrl(shell);
      if (url) void kawarpManager.setPipKawarpImage(url);
    });
    artObserver.observe(shell, { attributes: true, attributeFilter: ["style"] });

    pipWindow.addEventListener("pagehide", () => teardown(pipWindow), { once: true });

    session = { window: pipWindow, shell, artObserver, suppressionStyle };
  } finally {
    isMounting = false;
    // Every exit between creating the instance and recording the session leaves it unreachable:
    // nothing else holds a handle, so teardown() and sync() have nothing to act on. Covers both
    // the window closing mid-mount and anything below it throwing.
    if (hasInstance && !session) kawarpManager.destroyKawarp(kawarpManager.PIP_LOCATION);

    // Replayed last: a sync replayed before the cleanup above would start a mount whose still-null
    // session makes `hasInstance && !session` destroy the state it is building. Clearing the flag
    // first keeps a sync that lands during the replayed mount from being swallowed in turn.
    if (isSyncPending) {
      isSyncPending = false;
      sync();
    }
  }
};

// Exported because the popup can toggle `enabled` while the window is already open, and no attribute
// changes when it does.
export const sync = (): void => {
  // A mount is a long await chain that cannot observe state changes, and it assigns `session` last,
  // so a sync arriving mid-mount matches neither branch below. Record it and reconcile once it lands.
  if (isMounting) {
    isSyncPending = true;
    return;
  }

  const isWanted = isPipEffectWanted();
  if (isWanted && !session) void mount();
  else if (!isWanted && session) teardown();
};

export const initialize = (dependencies: {
  getSettings: () => GradientSettings;
  getMultipliers: () => DynamicMultipliers;
}): void => {
  getSettings = dependencies.getSettings;
  getMultipliers = dependencies.getMultipliers;

  openObserver?.disconnect();
  openObserver = new MutationObserver(sync);
  openObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [PIP_OPEN_ATTRIBUTE],
  });

  // Better Lyrics can auto-restore the window before shaders finishes initializing.
  sync();
};

export const cleanup = (): void => {
  openObserver?.disconnect();
  openObserver = null;
  // Without this an in-flight mount's replay would remount right after an explicit teardown.
  isSyncPending = false;
  teardown();
};
