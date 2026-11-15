import React from "react";
import { GradientSettings } from "@/popup/types";
import { ControlToggle } from "../ControlToggle";

interface PerformanceTabProps {
  settings: GradientSettings;
  onToggleChange: (key: keyof GradientSettings, value: boolean) => void;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({ settings, onToggleChange }) => (
  <div className="panel">
    <div className="group-label">Experimental optimizations (off by default)</div>
    <ControlToggle
      label="Fast DOM lookup"
      hint="Cache player bar, ad, and video element references across 10 Hz polls."
      tooltip="Replaces repeated document-wide querySelector calls for ad state and playable video discovery with cached node references and scoped MutationObservers. Trade-off: if YouTube Music mutates ad attributes dynamically in custom ways outside player-bar/movie-player, detection falls back when nodes detach."
      value={settings.perfFastDomLookup}
      onChange={value => onToggleChange("perfFastDomLookup", value)}
    />
    <ControlToggle
      label="Skip redundant filter writes"
      hint="Quantize brightness to 0.001 steps and skip unchanged CSS writes."
      tooltip="Caches the last written transition and filter strings per effect instance and rounds auto-dim brightness to 0.001 precision so tiny video frame luminance jitter does not schedule repeated style recalculations. Trade-off: sub-0.1% brightness deltas are coalesced."
      value={settings.perfSkipRedundantFilter}
      onChange={value => onToggleChange("perfSkipRedundantFilter", value)}
    />
    <ControlToggle
      label="Throttle video brightness PBO polling"
      hint="Clamp luminance sampling to ≥400ms and skip duplicate video timestamps."
      tooltip="Raises the minimum GPU pixel-readback interval (sampleSource / gl.getBufferSubData) during video mode from 100ms to 400ms and skips re-sampling when video.currentTime is unchanged after the initial readback. Trade-off: auto-dim luminance reacts up to ~400ms slower to sudden scene brightness changes."
      value={settings.perfThrottleVideoBrightness}
      onChange={value => onToggleChange("perfThrottleVideoBrightness", value)}
    />
    <ControlToggle
      label="Cap unthrottled video texture uploads at 24 fps"
      hint="Limit automatic video shader sampling (frameRate: 0) to 24 fps."
      tooltip="When Video FPS is set to Auto (0), passes frameRate: 24 into @kawarp/core so high-framerate music videos upload background textures at 24 fps instead of 60 fps while preserving color smoothing. Explicit non-zero FPS settings are left untouched. Trade-off: background color transitions follow fast video cuts at 24 fps instead of full video rate."
      value={settings.perfCapVideoFrameRate}
      onChange={value => onToggleChange("perfCapVideoFrameRate", value)}
    />
  </div>
);
