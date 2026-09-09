import React from "react";
import { LockIcon } from "./icons";

/**
 * Shown when the host app's Glassy merge theme is driving these effects. Sits above
 * the tab bar rather than inside a panel so it stays visible whichever tab is open —
 * the greyed-out controls are otherwise unexplained.
 */
export const ThemeLockNotice: React.FC = () => (
  <div className="notice" role="status">
    <LockIcon size={14} className="notice__icon" />
    <div className="notice__text">
      <span className="notice__title">Managed by the Glassy theme</span>
      <span className="notice__body">
        The merge theme tunes these effects to match its look. Switch Better Lyrics to another theme to change them.
      </span>
    </div>
  </div>
);
