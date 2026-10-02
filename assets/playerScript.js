(function () {
  let lastVideoKey = null;

  setInterval(() => {
    const player = document.getElementById("movie_player");
    if (!player?.getVideoData || !player?.getDuration) return;

    try {
      const { video_id, title, author } = player.getVideoData();
      const duration = player.getDuration();

      if (!video_id) return;

      const videoKey = `${video_id}|${title}`;
      if (videoKey !== lastVideoKey) {
        lastVideoKey = videoKey;
        document.dispatchEvent(
          new CustomEvent("bls-send-player-time", {
            detail: {
              videoId: video_id,
              song: title,
              artist: author,
              duration,
            },
          })
        );
      }
    } catch {}
  }, 20);
})();
