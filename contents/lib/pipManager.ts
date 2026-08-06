import type { DynamicMultipliers, GradientSettings } from "@/shared/constants/gradientSettings";
import { logger } from "@/shared/utils/logger";
import * as kawarpManager from "./kawarpManager";

const PIP_OPEN_ATTRIBUTE = "blyrics-pip-open";
const SHELL_SELECTOR = ".blyrics-pip-shell";
const ART_PROPERTY = "--blyrics-pip-art";
const BACKDROP_SELECTOR = ".blyrics-pip-backdrop";
const SUPPRESSION_STYLE_ID = "better-lyrics-shaders-backdrop-suppression";
const SHELL_TIMEOUT_MS = 5000;

// Gecko hands a content script a cross-origin wrapper on the Picture-in-Picture window, so nothing
// in this world can script it. Fixed in Firefox 154 (bugzilla 2045666 and 2053139), but 153 is the
// current release, so every shipping Firefox lands here. `wrappedJSObject` is the Xray marker that
// identifies the restricted sandbox, and is the same check Better Lyrics uses to decide whether to
// delegate its own window to the page world.
//
// This is checked once and up front rather than left to the try/catch in createPipKawarp, because
// that path would throw and log on every song change for the lifetime of the tab.
const isRestrictedSandbox = "wrappedJSObject" in window;

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

// `session` is only assigned after two awaits, so it cannot guard against a second entry on its own.
const mount = async (): Promise<void> => {
  if (session || isMounting || !getSettings || !getMultipliers) return;

  const pipWindow = window.documentPictureInPicture?.window;
  if (!pipWindow) return;

  isMounting = true;
  try {
    const shell = await waitForShell(pipWindow);
    if (!shell) {
      logger.log("Floating window shell never appeared, skipping");
      return;
    }

    // The window can close, or be replaced, while waitForShell is pending.
    if (window.documentPictureInPicture?.window !== pipWindow) return;

    const settings = getSettings();
    const mounted = await kawarpManager.createPipKawarp(pipWindow, settings, getMultipliers(), readArtworkUrl(shell));
    if (!mounted) return;

    // createPipKawarp awaits an image load, so the window can close inside it. sync() cannot catch
    // that: session is still null at this point, so it sees nothing to tear down.
    if (window.documentPictureInPicture?.window !== pipWindow) {
      kawarpManager.destroyKawarp(kawarpManager.PIP_LOCATION);
      return;
    }

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
  }
};

// Exported because the popup can toggle `enabled` while the window is already open, and no attribute
// changes when it does.
export const sync = (): void => {
  const shouldRun = document.documentElement.hasAttribute(PIP_OPEN_ATTRIBUTE) && getSettings?.().enabled === true;
  if (shouldRun && !session) void mount();
  else if (!shouldRun && session) teardown();
};

export const initialize = (dependencies: {
  getSettings: () => GradientSettings;
  getMultipliers: () => DynamicMultipliers;
}): void => {
  if (isRestrictedSandbox) {
    logger.log("This browser does not let a content script reach the floating window, skipping");
    return;
  }

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
  teardown();
};
