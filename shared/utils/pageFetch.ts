type FirefoxContentScriptGlobal = typeof globalThis & { content?: { fetch?: typeof fetch } };

// Firefox MV2 content-script fetch cannot send the page Origin, so hosts that allow only music.youtube.com reject it.
export const pageFetch: typeof fetch = (input, init) => {
  const pageWindow = (globalThis as FirefoxContentScriptGlobal).content;
  return pageWindow?.fetch ? pageWindow.fetch(input, init) : fetch(input, init);
};
