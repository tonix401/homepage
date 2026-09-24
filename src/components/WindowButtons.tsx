/**
 * Maximize/restore and close, for an app that draws its own chrome in the
 * theme's colours — jizi today. A maximized window covers the bar, so this
 * restore button is the only way back to the strip, and every app has to carry
 * one. (Codium and Chromium keep their own, in their own look.)
 */

import "./WindowButtons.css";
import { type WindowHandle } from "../apps/types";

export function WindowButtons({ handle, maximized }: { handle: WindowHandle; maximized: boolean }) {
  return (
    <div className="win-btns">
      <button
        className="win-btn"
        onClick={handle.toggleFullscreen}
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? (
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M3.5 3.5v-2h7v7h-2" />
            <rect x="1.5" y="3.5" width="7" height="7" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="1.5" y="1.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button
        className="win-btn win-btn--close"
        onClick={handle.close}
        aria-label="Close"
        title="Close"
      >
        <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  );
}
