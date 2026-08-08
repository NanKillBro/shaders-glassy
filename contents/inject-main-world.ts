import type { PlasmoCSConfig } from "plasmo";
import audioGraphBundleUrl from "url:./lib/audioGraph";

export const config: PlasmoCSConfig = {
  matches: ["https://music.youtube.com/*"],
  run_at: "document_start",
  all_frames: false,
};

function injectScript(fileName: string): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(fileName);
  script.type = "text/javascript";
  (document.head || document.documentElement).appendChild(script);
}

function extensionRelativeName(pageRelativeBundleUrl: string): string | undefined {
  return pageRelativeBundleUrl.split("/").pop()?.split("?")[0];
}

function injectBundle(pageRelativeBundleUrl: string): void {
  const fileName = extensionRelativeName(pageRelativeBundleUrl);
  if (fileName) injectScript(fileName);
}

injectScript("assets/earlyInject.js");
injectBundle(audioGraphBundleUrl);

window.addEventListener("DOMContentLoaded", () => {
  injectScript("assets/playerScript.js");
});
