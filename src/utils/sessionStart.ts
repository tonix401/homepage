/**
 * When this tab's session began, for the uptime fastfetch and btop report.
 *
 * The page writes the moment it first loads into `sessionStorage`, once, and
 * leaves it: a reload keeps the same start, so the uptime keeps counting the
 * way a machine's does across a restart of one program, and a new tab starts
 * its own. That is the same lifetime as the desktop layout (`session.ts`).
 */

export const START_KEY = "homepage.started";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Records now as the start, unless this tab already has one. */
export function recordSessionStart(store: Storage | null = storage(), now = Date.now()): void {
  try {
    if (!store || isStart(store.getItem(START_KEY))) return;
    store.setItem(START_KEY, String(now));
  } catch {
    // Blocked or full storage costs the uptime its memory, not the page.
  }
}

/**
 * The start, in epoch milliseconds. Without one — storage unavailable, or
 * cleared by hand — this page load is the start, which is what a plain
 * `performance.now()` uptime would have said anyway.
 */
export function sessionStart(store: Storage | null = storage()): number {
  try {
    const stored = store?.getItem(START_KEY) ?? null;
    if (isStart(stored)) return Number(stored);
  } catch {
    // Fall through to this page load.
  }
  return performance.timeOrigin;
}

/** A stored start is a positive whole number of milliseconds, and not in the future. */
function isStart(value: string | null): value is string {
  if (value === null || !/^\d+$/.test(value)) return false;
  const ms = Number(value);
  return ms > 0 && ms <= Date.now();
}
