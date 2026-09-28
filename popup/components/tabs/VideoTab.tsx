import type { GradientSettings } from "@/popup/types";
import React from "react";
import { ControlToggle } from "../ControlToggle";
import { SliderPanel, type SliderPanelProps } from "./SliderPanel";

interface Props extends SliderPanelProps {
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

export const VideoTab: React.FC<Props> = ({ onToggleChange, ...props }) => (
  <div className="panel">
    <ControlToggle
      label="Video ambient colors"
      hint="Sample the playing music video. When off, use album artwork."
      value={props.settings.videoEnabled}
      onChange={value => onToggleChange("videoEnabled", value)}
    />
    <div className={props.settings.videoEnabled ? "" : "subgroup--disabled"}>
      <h3 className="video-section">Appearance</h3>
      <SliderPanel
        {...props}
        keys={[
          "videoOpacity",
          "videoWarpIntensity",
          "videoBlurPasses",
          "videoSaturation",
          "videoDithering",
          "videoHdrDitheringScale",
        ]}
      />
      <ControlToggle
        label="Dim bright frames"
        hint="Keep lyrics readable over bright video colors."
        value={props.settings.videoAutoDim}
        onChange={value => onToggleChange("videoAutoDim", value)}
      />
      <div className={props.settings.videoAutoDim ? "subgroup" : "subgroup subgroup--disabled"}>
        <SliderPanel {...props} keys={["videoDimStrength", "videoBrightnessTransition"]} />
      </div>
      <h3 className="video-section">Motion</h3>
      <SliderPanel {...props} keys={["videoAnimationSpeed"]} />
      <ControlToggle
        label="React to beats"
        hint="Use the beat detector from the Audio tab with separate video speed and zoom strengths."
        value={props.settings.videoAudioResponsive}
        onChange={value => onToggleChange("videoAudioResponsive", value)}
      />
      <div className={props.settings.videoAudioResponsive ? "" : "subgroup--disabled"}>
        <SliderPanel
          {...props}
          keys={["videoBeatSpeedMultiplier", "videoBeatZoom", "videoZoomAttack", "videoZoomRelease"]}
        />
      </div>
      <h3 className="video-section">Sampling</h3>
      <ControlToggle
        label="Process video on GPU"
        hint="Keep color frames in GPU textures. Falls back to CPU sampling when unsupported."
        value={props.settings.videoGpuProcessing}
        onChange={value => onToggleChange("videoGpuProcessing", value)}
      />
      <div
        className={
          props.settings.videoGpuProcessing && props.settings.videoAutoDim ? "subgroup" : "subgroup subgroup--disabled"
        }
      >
        <SliderPanel {...props} keys={["videoGpuBrightnessSize", "videoGpuBrightnessInterval"]} />
      </div>
      <ControlToggle
        label="High-precision colors"
        hint="Preserve fractional colors through sampling and blending. Uses float16 where supported, with an 8-bit fallback. Uses more memory and bandwidth."
        value={props.settings.videoHighPrecisionSampling}
        onChange={value => onToggleChange("videoHighPrecisionSampling", value)}
      />
      <SliderPanel
        {...props}
        keys={["videoSampleWidth", "videoSampleHeight", "videoFrameRate", "videoColorResponse", "videoFrameTransition"]}
      />
      <ControlToggle
        label="Staged downsampling"
        hint="Reduce the video in smaller steps to prevent flickering fine detail. Turn off for a cheaper single resize."
        value={props.settings.videoStagedDownsampling}
        onChange={value => onToggleChange("videoStagedDownsampling", value)}
      />
      <div className={props.settings.videoStagedDownsampling ? "subgroup" : "subgroup subgroup--disabled"}>
        <SliderPanel {...props} keys={["videoDownsampleFactor"]} />
      </div>
    </div>
  </div>
);
