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

// A url: import resolves against the page rather than the extension, so only
// the hashed filename survives the trip. Plasmo adds that same hashed name to
// web_accessible_resources on our behalf.
function injectBundle(bundleUrl: string): void {
  const fileName = bundleUrl.split("/").pop()?.split("?")[0];
  if (fileName) injectScript(fileName);
}

injectScript("assets/earlyInject.js");
injectBundle(audioGraphBundleUrl);

window.addEventListener("DOMContentLoaded", () => {
  injectScript("assets/playerScript.js");
});
