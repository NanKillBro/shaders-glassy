import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);

  // Top, because a tooltip below the label covers the slider it describes.
  // flip() only drops it underneath when there is no room above.
  const { refs, floatingStyles } = useFloating({
    open: visible,
    placement: "top-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  return (
    <>
      <span
        ref={refs.setReference}
        className="tooltip-wrapper"
        tabIndex={0}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div ref={refs.setFloating} style={floatingStyles} role="tooltip" className="tooltip">
            {content}
          </div>,
          document.body
        )}
    </>
  );
};
