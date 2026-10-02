export const ANIMATED_ART_VIDEO_ID = "bls-video";

export const ANIMATED_ART_VIDEO_SELECTOR = `#${ANIMATED_ART_VIDEO_ID}`;

export const PLAYER_MEDIA_SELECTOR = `audio, video:not(#${ANIMATED_ART_VIDEO_ID})`;

// Scoped to the player: previews and injected artwork are separate media.
export const PLAYER_VIDEO_SELECTOR = `#movie_player video:not(#${ANIMATED_ART_VIDEO_ID})`;

export const SONG_IMAGE_CONTAINER_SELECTOR = "#song-image";

export const PLAYER_BAR_THUMBNAIL_CONTAINER_SELECTOR = "ytmusic-player-bar .thumbnail-image-wrapper";
