type FirefoxXrayMediaElement = HTMLMediaElement & { wrappedJSObject?: HTMLMediaElement };

// Firefox MV2 blocks CORS media loads started by a content script; writing through the page wrapper makes the page the requester.
export const setCorsMediaSource = (media: HTMLMediaElement, url: string): void => {
  const pageMedia = (media as FirefoxXrayMediaElement).wrappedJSObject ?? media;
  pageMedia.setAttribute("crossorigin", "anonymous");
  pageMedia.setAttribute("src", url);
};
