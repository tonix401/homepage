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

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
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
  /** Where each column was last laid out, for the FLIP on a close. */
  const lastLefts = useRef(new Map<WindowId, number>());
  const focusIndex = windows.findIndex((window) => window.id === focusedId);

  /*
   * Closing a column must leave the survivors where they are and let them grow
   * *into* the gap, rather than snapping across it first.
   *
   * The snap is what a plain flex-basis transition gives you: `--strip-fraction`
   * lives on the strip, so when two windows become one the survivor is child #0
   * — pinned to the left gutter — from the very first frame, while its width is
   * still transitioning up from a half. It jumps left, looks half-width, then
   * grows rightward.
   *
   * So the columns are FLIPped: put each one back where it was with a
   * transform, then let the transform animate to zero alongside the width. The
   * two must share a duration and easing (see `.arch-column` in
   * ArchDesktop.css) — that is the whole trick. With content width C and gap g,
   * the survivor of a 2 -> 1 close starts at translateX((C+g)/2) with basis
   * (C-g)/2 and ends at translateX(0) with basis C, so `left + width` is C at
   * every moment in between: the right edge never moves and the window widens
   * to the left.
   *
   * The measured rects are exact rather than mid-transition, which is not
   * obvious. `columnFraction` is 0.5 for any count above one, so the basis only
   * ever changes on the 2 -> 1 close — and that close leaves a single survivor,
   * child #0, whose left edge is the strip's padding whatever its width is
   * doing. Closing one of three changes no basis at all, so those rects are
   * settled too.
   */
  useLayoutEffect(() => {
    const before = lastLefts.current;
    const after = new Map<WindowId, number>();
    // Only a close animates. An opening column has its own `arch-column-in`
    // keyframe, and its transform would fight this one.
    const closed =
      windows.length < before.size && windows.every((window) => before.has(window.id));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    windows.forEach((record, i) => {
      const column = columns.current[i];
      if (!column) return;
      const left = column.getBoundingClientRect().left;
      after.set(record.id, left);

      const was = before.get(record.id);
      if (!closed || still || was === undefined || was === left) return;
      column.style.transition = "none";
      column.style.transform = `translateX(${was - left}px)`;
      void column.offsetWidth; // commit the start value before releasing it
      column.style.transition = "";
      column.style.transform = "";
    });

    lastLefts.current = after;
  });

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
