import React, { useState } from "react";
import { AnimatedArtIcon } from "./icons";

interface NowPlayingProps {
  songTitle: string;
  songAuthor: string;
  albumArtUrl: string | null;
  animatedArtUrl: string | null;
  isAd: boolean;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
}

const FadingImage: React.FC<{ src: string }> = ({ src }) => {
  const [isReady, setIsReady] = useState(false);
  return (
    <img
      className={`now-playing__art${isReady ? " now-playing__art--ready" : ""}`}
      src={src}
      alt=""
      onLoad={() => setIsReady(true)}
    />
  );
};

const FadingVideo: React.FC<{ src: string }> = ({ src }) => {
  const [isReady, setIsReady] = useState(false);
  return (
    <video
      className={`now-playing__art now-playing__art--overlay${isReady ? " now-playing__art--ready" : ""}`}
      src={src}
      muted
      autoPlay
      loop
      playsInline
      onCanPlay={() => setIsReady(true)}
    />
  );
};

/** Static art stays underneath so the animated variant can fade in over it, the
 *  same layering the content script uses on the page. */
const Artwork: React.FC<{ albumArtUrl: string | null; animatedArtUrl: string | null }> = ({
  albumArtUrl,
  animatedArtUrl,
}) => {
  if (!albumArtUrl && !animatedArtUrl) return null;

  return (
    <span className="now-playing__thumb">
      {albumArtUrl && <FadingImage key={albumArtUrl} src={albumArtUrl} />}
      {animatedArtUrl && <FadingVideo key={animatedArtUrl} src={animatedArtUrl} />}
    </span>
  );
};

/** An ad's title and thumbnail are not the listener's music, so neither is shown. */
const IDLE_COPY = { title: "Effects", hint: "Animated backgrounds built from the album art." };
const AD_COPY = { title: "Sitting this one out", hint: "Back when the music is." };

export const NowPlaying: React.FC<NowPlayingProps> = ({
  songTitle,
  songAuthor,
  albumArtUrl,
  animatedArtUrl,
  isAd,
  enabled,
  onEnabledChange,
}) => {
  const [fakeOff, setFakeOff] = useState(false);
  const isPlayingMusic = Boolean(songTitle) && !isAd;
  const hasArtwork = isPlayingMusic && Boolean(animatedArtUrl || albumArtUrl);
  const placeholder = isAd ? AD_COPY : IDLE_COPY;

  const handleToggle = () => {
    if (fakeOff) return;
    if (enabled) {
      setFakeOff(true);
      setTimeout(() => {
        setFakeOff(false);
      }, 500);
      return;
    }
    onEnabledChange(true);
  };

  const isChecked = enabled && !fakeOff;

  return (
    <div className={`now-playing${hasArtwork ? "" : " now-playing--no-art"}`}>
      {isPlayingMusic && <Artwork albumArtUrl={albumArtUrl} animatedArtUrl={animatedArtUrl} />}
      <div className="now-playing__text">
        <div className="now-playing__song">
          <span className="now-playing__song-name">{isPlayingMusic ? songTitle : placeholder.title}</span>
          {isPlayingMusic && animatedArtUrl && (
            <span className="now-playing__pill" title="Animated artwork is playing">
              <AnimatedArtIcon />
              Animated
            </span>
          )}
        </div>
        <div className="now-playing__artist">{isPlayingMusic ? songAuthor : placeholder.hint}</div>
      </div>
      <button
        type="button"
        className="toggle toggle--lg"
        role="switch"
        aria-checked={isChecked}
        aria-label="Effects"
        title={isChecked ? "Turn effects off" : "Turn effects on"}
        onClick={handleToggle}
      />
    </div>
  );
};
