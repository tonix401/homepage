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

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  columnAt,
  columnFraction,
  columnSpan,
  scrollShiftFor,
  type WindowId,
  type WindowRecord,
} from "../utils/desktop";
import { isPhone, watchPhone } from "../utils/phone";

/**
 * How long a phone's strip must sit still before the window it rests on takes
 * focus, where the browser has no `scrollend` (Safari before 26).
 */
const SETTLE_DELAY = 120;

/**
 * How long the survivors of a close wait before growing into the gap, so the
 * closed window's genie gets a head start and they are not seen to fill its
 * place before it has visibly left.
 */
const CLOSE_DELAY = 90;

/** Which way a strip is sliding during a workspace switch, and why. */
export interface Slide {
  phase: "in" | "out";
  /** -1 carries the strip leftward, +1 rightward. */
  dir: -1 | 1;
}

interface ArchStripProps {
  windows: readonly WindowRecord[];
  focusedId: WindowId | null;
  onFocus: (id: WindowId) => void;
  renderWindow: (window: WindowRecord) => ReactNode;
  /** Set only while this strip is arriving on, or leaving, the screen. */
  slide?: Slide;
  onSlideEnd?: () => void;
}

export function ArchStrip({
  windows,
  focusedId,
  onFocus,
  renderWindow,
  slide,
  onSlideEnd,
}: ArchStripProps) {
  /**
   * The windows this strip was built with.
   *
   * `arch-column-in` is for a window *opening* into a strip that is already
   * there. A strip that mounts with its columns — a workspace arriving, or the
   * first paint — is not a series of openings, and animating each column then
   * doubles up with whatever the strip itself is doing. So only a column that
   * turns up later is marked as new.
   */
  const [initial] = useState(() => new Set(windows.map((window) => window.id)));
  const root = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  /** Set when the focus change under way came from the pointer wandering. */
  const followedMouse = useRef(false);
  /** Arriving already scrolled is not a journey worth animating. */
  const firstRun = useRef(true);
  /** Where each column was last laid out, for the FLIP on a close. */
  const lastLefts = useRef(new Map<WindowId, number>());
  const focusIndex = windows.findIndex((window) => window.id === focusedId);
  const phone = useSyncExternalStore(watchPhone, isPhone);

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
   * two must share a duration and easing, which is why the transform reads
   * `--column-move` and `--column-ease` from `.arch-column` in
   * ArchDesktop.css — that is the whole trick. With content width C and gap g,
   * the survivor of a 2 -> 1 close starts at translateX((C+g)/2) with basis
   * (C-g)/2 and ends at translateX(0) with basis C, so `left + width` is C at
   * every moment in between: the right edge never moves and the window widens
   * to the left.
   *
   * The measured rects are exact rather than mid-transition, which is not
   * obvious. `columnFraction` is 0.5 for any count above one (and 1 for every
   * count on a phone, where the basis never changes at all), so the basis only
   * ever changes on the 2 -> 1 close — and that close leaves a single survivor,
   * child #0, whose left edge is the strip's padding whatever its width is
   * doing. Closing one of three changes no basis at all, so those rects are
   * settled too.
   *
   * The transform is a Web Animation rather than a transition, because the
   * way to set a transition's start value is `transition: none`, and that
   * cancels the flex-basis transition already running on the same column: the
   * survivor snapped to its full width and only slid.
   *
   * Both wait `CLOSE_DELAY` first, and must wait it together or the right edge
   * moves after all. The transition's delay goes on before anything is
   * measured, because measuring is what starts it, and comes off straight
   * after: a running transition keeps the delay it started with, and every
   * later one (a focus border, say) starts at once. The transform holds its
   * start value through the delay (`fill: "backwards"`).
   */
  useLayoutEffect(() => {
    const before = lastLefts.current;
    const after = new Map<WindowId, number>();
    // Only a close animates. An opening column has its own `arch-column-in`
    // keyframe, and its transform would fight this one.
    const closed =
      windows.length < before.size && windows.every((window) => before.has(window.id));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const survivors = columns.current.slice(0, windows.length);
    if (closed && !still) {
      for (const column of survivors) if (column) column.style.transitionDelay = `${CLOSE_DELAY}ms`;
    }

    windows.forEach((record, i) => {
      const column = columns.current[i];
      if (!column) return;
      const left = column.getBoundingClientRect().left;
      after.set(record.id, left);

      const was = before.get(record.id);
      if (!closed || still || was === undefined || was === left) return;
      const style = getComputedStyle(column);
      column.animate([{ transform: `translateX(${was - left}px)` }, { transform: "none" }], {
        duration: parseFloat(style.getPropertyValue("--column-move")),
        easing: style.getPropertyValue("--column-ease").trim(),
        delay: CLOSE_DELAY,
        fill: "backwards",
      });
    });

    if (closed && !still) {
      for (const column of survivors) if (column) column.style.transitionDelay = "";
    }

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

    // Where the column will be, not where it is: widths may be mid-transition
    // (see `columnSpan`). Both ranges are in the content box's coordinates,
    // whose visible part starts at `scrollLeft`; the gutter is the strip's own
    // padding, so the gap around a column that has just been scrolled to is
    // whatever the stylesheet says it is.
    const style = getComputedStyle(scroller);
    const content =
      scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const span = columnSpan(focusIndex, windows.length, content, parseFloat(style.columnGap), phone);
    const shift = scrollShiftFor(span, {
      left: scroller.scrollLeft,
      right: scroller.scrollLeft + content,
    });
    // Arriving on a route is not a journey, and neither is any of this to
    // someone who has asked for less motion.
    const still =
      firstRun.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    firstRun.current = false;
    if (shift !== 0) {
      scroller.scrollTo({ left: scroller.scrollLeft + shift, behavior: still ? "instant" : "smooth" });
    }
  }, [focusedId, focusIndex, windows.length, phone]);

  /*
   * On a phone the view *does* set focus — the one exception to the rule
   * above. Each window fills the screen there and the strip snaps from one to
   * the next, so whatever is on screen is the only window you can see, and
   * focus left behind on one swiped away would have the bar name it, the genie
   * pour from it and Ctrl+B fold its sidebar. So once a swipe comes to rest,
   * the window it rests on takes focus.
   *
   * It counts as having followed the pointer: the strip is already where it
   * should be, and the effect above must not scroll it again. A focus change
   * that scrolls the strip itself ends on the window it focused, so it comes
   * back here as a no-op.
   */
  useEffect(() => {
    const scroller = root.current;
    if (!phone || !scroller || slide) return;
    const settle = () => {
      const style = getComputedStyle(scroller);
      const content =
        scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const at = windows[columnAt(scroller.scrollLeft, windows.length, content, parseFloat(style.columnGap))];
      if (!at || at.id === focusedId) return;
      followedMouse.current = true;
      onFocus(at.id);
    };
    if ("onscrollend" in window) {
      scroller.addEventListener("scrollend", settle);
      return () => scroller.removeEventListener("scrollend", settle);
    }
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_DELAY);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [phone, slide, windows, focusedId, onFocus]);

  /*
   * The slide is over when its animation is — and `animationend` is not a
   * dependable way to hear that. An animation that runs out while the tab is
   * in the background completes without ever dispatching to a listener that
   * comes back afterwards, and a strip left waiting for that event keeps a
   * whole app subtree mounted off-screen until the next switch replaces it.
   * `getAnimations()` reports the animation whatever the tab was doing, and
   * `finished` resolves straight away for one that is already done.
   */
  useEffect(() => {
    if (!slide || !onSlideEnd) return;
    const animation = root.current?.getAnimations()[0];
    if (!animation) {
      onSlideEnd();
      return;
    }
    let cancelled = false;
    animation.finished.then(
      () => {
        if (!cancelled) onSlideEnd();
      },
      // A cancelled animation rejects; the strip is being replaced anyway.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [slide, onSlideEnd]);

  const style = {
    "--strip-fraction": columnFraction(windows.length, phone),
    "--slide-dir": slide?.dir,
  } as CSSProperties;

  // A phone shows one window of several, and a swipe gives no sign there are
  // more: a dot per window under the strip says how many and which this is.
  // Not for a strip on its way out, whose dots would sit on the new one's.
  const paged = phone && windows.length > 1;

  return (
    <>
      <div
        className={`arch-strip${paged ? " arch-strip--paged" : ""}${slide ? ` arch-strip--${slide.phase}` : ""}`}
        style={style}
        // A strip on its way out is still on screen for a third of a second, and
        // nothing about it should answer: `inert` takes it out of the tab order
        // and stops the pointer reaching a window that has already gone.
        inert={slide?.phase === "out" || undefined}
        ref={root}
      >
        {windows.map((window, i) => (
          <div
            key={window.id}
            data-window-id={window.id}
            ref={(el) => {
              columns.current[i] = el;
            }}
            className={
              "arch-column" +
              (window.id === focusedId ? " arch-column--focused" : "") +
              (initial.has(window.id) ? "" : " arch-column--new")
            }
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
      {paged && slide?.phase !== "out" && (
        <div className="arch-strip-dots" role="group" aria-label="Windows on this workspace">
          {windows.map((window, i) => (
            <button
              key={window.id}
              className={`arch-strip-dot${window.id === focusedId ? " arch-strip-dot--focused" : ""}`}
              aria-label={`Window ${i + 1} of ${windows.length}`}
              aria-current={window.id === focusedId || undefined}
              onClick={() => onFocus(window.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
