import React from "react";
import { SliderPanel, SliderPanelProps } from "./SliderPanel";

const MOTION_KEYS = ["kawarpAnimationSpeed", "kawarpTransitionDuration"] as const;

export const MotionTab: React.FC<SliderPanelProps> = props => (
  <div className="panel">
    <SliderPanel keys={[...MOTION_KEYS]} {...props} />
  </div>
);
