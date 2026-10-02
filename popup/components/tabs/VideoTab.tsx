import { type GradientSettings, defaultSettings } from "@/popup/types";
import React from "react";
import { ControlToggle } from "../ControlToggle";
import { SliderPanel, type SliderPanelProps } from "./SliderPanel";

interface Props extends SliderPanelProps {
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

const FlashWarning: React.FC<{ open: boolean }> = ({ open }) => (
  <div className={`flash-warning${open ? " flash-warning--open" : ""}`} aria-hidden={!open}>
    <div className="flash-warning__clip">
      <p className="flash-warning__text">
        Flashes in the video will flash the whole background. If flashing light can trigger seizures for you, keep this
        at {defaultSettings.videoColorResponse} ms or higher.
      </p>
    </div>
  </div>
);

export const VideoTab: React.FC<Props> = ({ onToggleChange, ...props }) => (
  <div className="panel">
    <ControlToggle
      label="Video ambient colors"
      hint="Sample the playing music video. When off, use album artwork."
      value={props.settings.videoEnabled}
      onChange={value => onToggleChange("videoEnabled", value)}
      disabled={props.locked}
    />
    <div className={props.settings.videoEnabled ? "" : "subgroup--disabled"}>
      <h3 className="video-section">Appearance</h3>
      <SliderPanel {...props} keys={["videoOpacity", "videoColorResponse"]} />
      <FlashWarning open={props.settings.videoColorResponse < defaultSettings.videoColorResponse} />
      <SliderPanel
        {...props}
        keys={["videoWarpIntensity", "videoBlurPasses", "videoSaturation", "videoDithering", "videoHdrDitheringScale"]}
      />
      <ControlToggle
        label="Dim bright frames"
        hint="Keep lyrics readable over bright video colors. Shared with the artwork setting."
        value={props.settings.autoDimBrightArtwork}
        onChange={value => onToggleChange("autoDimBrightArtwork", value)}
        disabled={props.locked}
      />
      <div className={props.settings.autoDimBrightArtwork ? "subgroup" : "subgroup subgroup--disabled"}>
        <SliderPanel
          {...props}
          keys={[
            "videoDimStrength",
            "videoBrightnessTransition",
            "videoBrightnessSampleSize",
            "videoBrightnessInterval",
          ]}
        />
      </div>
      <h3 className="video-section">Motion</h3>
      <SliderPanel {...props} keys={["videoAnimationSpeed"]} />
      <ControlToggle
        label="React to beats"
        hint="Use the beat detector from the Audio tab with separate video speed and zoom strengths."
        value={props.settings.videoAudioResponsive}
        onChange={value => onToggleChange("videoAudioResponsive", value)}
        disabled={props.locked}
      />
      <div className={props.settings.videoAudioResponsive ? "" : "subgroup--disabled"}>
        <SliderPanel
          {...props}
          keys={["videoBeatSpeedMultiplier", "videoBeatZoom", "videoZoomAttack", "videoZoomRelease"]}
        />
      </div>
      <h3 className="video-section">Sampling</h3>
      <SliderPanel
        {...props}
        keys={["videoSampleWidth", "videoSampleHeight", "videoFrameRate", "videoDownsampleFactor"]}
      />
    </div>
  </div>
);
