const PLAYER_BAR_SELECTOR = "ytmusic-player-bar";
const PLAYER_BAR_AD_ATTRIBUTE = "is-advertisement";
const MOVIE_PLAYER_ELEMENT_ID = "movie_player";

/** `ad-created` is not in this list: it stays set after the ad has finished. */
const MOVIE_PLAYER_AD_CLASSES = ["ad-showing", "ad-interrupting"];

export const isAdPlaying = (doc: Document = document): boolean => {
  const playerBar = doc.querySelector(PLAYER_BAR_SELECTOR);
  if (playerBar?.hasAttribute(PLAYER_BAR_AD_ATTRIBUTE)) return true;

  const moviePlayer = doc.getElementById(MOVIE_PLAYER_ELEMENT_ID);
  if (!moviePlayer) return false;

  return MOVIE_PLAYER_AD_CLASSES.some(name => moviePlayer.classList.contains(name));
};
