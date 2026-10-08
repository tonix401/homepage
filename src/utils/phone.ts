/**
 * The phone layout's one switch. Below this width the desktop shows a single
 * window at a time and the apps fold their side panes into drawers; the CSS
 * uses the same width in `@media (max-width: 640px)`, so the two halves can
 * never disagree about which layout is on screen. Only behaviour the
 * stylesheet cannot express reads it here: how wide a column is, whether a
 * drawer starts open, and whether a swipe moves focus.
 *
 * Landscape phones are wider than this and keep the desktop layout.
 */
export const PHONE = "(max-width: 640px)";

export function isPhone(): boolean {
  return window.matchMedia(PHONE).matches;
}

/** For `useSyncExternalStore`: rotating, or resizing a window, crosses it live. */
export function watchPhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
