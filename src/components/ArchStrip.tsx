/**
 * The scrolling window layout, the way niri arranges columns.
 *
 * Windows sit in one horizontal row that is wider than the screen. A single
 * window fills the viewport; two or more take half of it each, so opening a
 * third pushes the first off the left edge and the strip scrolls to follow.
 *
 * It is a real scroll container rather than a translated row, which buys the
 * trackpad, shift-wheel, touch and keyboard scrolling, a draggable scrollbar
 * and `scrollIntoView`'s "bring it into view, but do not move if it already
 * is" — the exact focus-scroll rule — for none of the measuring a transform
 * would need.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  columnFraction,
  scrollShiftFor,
  type WindowId,
  type WindowRecord,
} from "../utils/desktop";

interface ArchStripProps {
  windows: readonly WindowRecord[];
  focusedId: WindowId | null;
  onFocus: (id: WindowId) => void;
  renderWindow: (window: WindowRecord) => ReactNode;
}

export function ArchStrip({ windows, focusedId, onFocus, renderWindow }: ArchStripProps) {
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  /** Set when the focus change under way came from the pointer wandering. */
  const followedMouse = useRef(false);
  /** Arriving already scrolled is not a journey worth animating. */
  const firstRun = useRef(true);
  const focusIndex = windows.findIndex((window) => window.id === focusedId);

  /*
   * A deliberate focus change scrolls the view; the view never sets focus.
   * Nothing here listens to `scroll`, so reading along the strip by hand
   * leaves focus where it was — which is the point of a scrolling layout, and
   * the first thing a later change is tempted to "fix".
   *
   * Focus that merely followed the mouse does *not* scroll. Otherwise brushing
   * past a half-visible column on the way to somewhere else would haul the
   * whole strip along with it.
   *
   * Keyed on the focused window's id rather than the index, so opening another
   * file in a window that is already on screen does not yank the strip about.
   */
  useEffect(() => {
    if (!focusedId) return;
    if (followedMouse.current) {
      followedMouse.current = false;
      return;
    }
    const column = columns.current[focusIndex];
    const scroller = column?.parentElement;
    if (!column || !scroller) return;

    // The gutter is the strip's own padding, so the gap around a column that
    // has just been scrolled to is whatever the stylesheet says it is.
    const box = scroller.getBoundingClientRect();
    const style = getComputedStyle(scroller);
    const shift = scrollShiftFor(column.getBoundingClientRect(), {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
    });
    // Arriving on a route is not a journey, and neither is any of this to
    // someone who has asked for less motion.
    const still =
      firstRun.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    firstRun.current = false;
    if (shift !== 0) {
      scroller.scrollTo({ left: scroller.scrollLeft + shift, behavior: still ? "instant" : "smooth" });
    }
  }, [focusedId, focusIndex, windows.length]);

  const style = { "--strip-fraction": columnFraction(windows.length) } as CSSProperties;

  return (
    <div className="arch-strip" style={style}>
      {windows.map((window, i) => (
        <div
          key={window.id}
          ref={(el) => {
            columns.current[i] = el;
          }}
          className={`arch-column${window.id === focusedId ? " arch-column--focused" : ""}`}
          // Focus follows the mouse. `mousemove` rather than `mouseenter`,
          // because a column that slides under a still cursor — which is what
          // the strip does every time a window opens — has not been pointed
          // at, and must not steal focus from the window just opened. The
          // guard makes it a single comparison per move once settled.
          onMouseMove={() => {
            if (window.id === focusedId) return;
            followedMouse.current = true;
            onFocus(window.id);
          }}
          // A press covers touch, where there is no hover to follow; with a
          // mouse the move above has already focused it, so this is a no-op.
          // Capture phase, and nothing prevented or stopped, so the control
          // underneath still gets its click. `focusin` covers tabbing in.
          onPointerDownCapture={() => onFocus(window.id)}
          onFocusCapture={() => onFocus(window.id)}
        >
          {renderWindow(window)}
        </div>
      ))}
    </div>
  );
}
