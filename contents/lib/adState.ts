const PLAYER_BAR_SELECTOR = "ytmusic-player-bar";
const PLAYER_BAR_AD_ATTRIBUTE = "is-advertisement";
const MOVIE_PLAYER_ELEMENT_ID = "movie_player";

/** `ad-created` is not in this list: it stays set after the ad has finished. */
const MOVIE_PLAYER_AD_CLASSES = ["ad-showing", "ad-interrupting"];

interface CachedAdDomState {
  doc: Document;
  playerBar: Element | null;
  moviePlayer: Element | null;
  observer: MutationObserver | null;
  isAd: boolean;
}

let fastDomLookupEnabled = false;
let docCache = new WeakMap<Document, CachedAdDomState>();
const activeStates = new Set<CachedAdDomState>();

const evaluateAdNodes = (playerBar: Element | null, moviePlayer: Element | null): boolean => {
  if (playerBar?.hasAttribute(PLAYER_BAR_AD_ATTRIBUTE)) return true;
  if (!moviePlayer) return false;
  return MOVIE_PLAYER_AD_CLASSES.some(name => moviePlayer.classList.contains(name));
};

const bindAdObserver = (entry: CachedAdDomState): void => {
  entry.observer?.disconnect();
  entry.observer = null;

  const ObserverCtor = entry.doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!ObserverCtor || (!entry.playerBar && !entry.moviePlayer)) {
    activeStates.delete(entry);
    return;
  }

  const observer = new ObserverCtor(() => {
    entry.isAd = evaluateAdNodes(entry.playerBar, entry.moviePlayer);
  });
  if (entry.playerBar) {
    observer.observe(entry.playerBar, { attributes: true, attributeFilter: [PLAYER_BAR_AD_ATTRIBUTE] });
  }
  if (entry.moviePlayer) {
    observer.observe(entry.moviePlayer, { attributes: true, attributeFilter: ["class"] });
  }
  entry.observer = observer;
  activeStates.add(entry);
};

export const resetAdStateCache = (): void => {
  for (const state of activeStates) {
    state.observer?.disconnect();
    state.observer = null;
  }
  activeStates.clear();
  docCache = new WeakMap<Document, CachedAdDomState>();
};

export const setFastDomLookupEnabled = (enabled: boolean): void => {
  if (fastDomLookupEnabled === enabled) return;
  fastDomLookupEnabled = enabled;
  if (!enabled) {
    resetAdStateCache();
  }
};

export const isAdPlaying = (doc: Document = document): boolean => {
  if (!fastDomLookupEnabled) {
    const playerBar = doc.querySelector(PLAYER_BAR_SELECTOR);
    if (playerBar?.hasAttribute(PLAYER_BAR_AD_ATTRIBUTE)) return true;

    const moviePlayer = doc.getElementById(MOVIE_PLAYER_ELEMENT_ID);
    if (!moviePlayer) return false;

    return MOVIE_PLAYER_AD_CLASSES.some(name => moviePlayer.classList.contains(name));
  }

  let entry = docCache.get(doc);
  if (!entry) {
    entry = { doc, playerBar: null, moviePlayer: null, observer: null, isAd: false };
    docCache.set(doc, entry);
  }

  let nodesChanged = false;
  if (!entry.playerBar?.isConnected) {
    const nextBar = doc.querySelector(PLAYER_BAR_SELECTOR);
    if (nextBar !== entry.playerBar || (entry.playerBar && !entry.playerBar.isConnected)) {
      entry.playerBar = nextBar;
      nodesChanged = true;
    }
  }
  if (!entry.moviePlayer?.isConnected) {
    const nextPlayer = doc.getElementById(MOVIE_PLAYER_ELEMENT_ID);
    if (nextPlayer !== entry.moviePlayer || (entry.moviePlayer && !entry.moviePlayer.isConnected)) {
      entry.moviePlayer = nextPlayer;
      nodesChanged = true;
    }
  }

  if (nodesChanged) {
    entry.isAd = evaluateAdNodes(entry.playerBar, entry.moviePlayer);
    bindAdObserver(entry);
  } else if (typeof entry.observer?.takeRecords === "function") {
    if (entry.observer.takeRecords().length > 0) {
      entry.isAd = evaluateAdNodes(entry.playerBar, entry.moviePlayer);
    }
  } else {
    entry.isAd = evaluateAdNodes(entry.playerBar, entry.moviePlayer);
  }

  return entry.isAd;
};
