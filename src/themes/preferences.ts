/**
 * Reading and writing the desktop's preferences — the theme and the wallpaper
 * subject — in `localStorage`. Unlike the window layout, which lives in
 * `sessionStorage` and ends with the visit (see `session.ts`), a preference
 * should still be there next time.
 *
 * Storage can be missing (the node tests), blocked (a private window) or full,
 * and none of that is worth an error: the choice just falls back to its default.
 */

/** `null` where storage is unavailable. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPreference<T extends string>(
  key: string,
  isValid: (value: unknown) => value is T,
  fallback: T,
  store: Storage | null = storage(),
): T {
  try {
    const stored = store?.getItem(key);
    return isValid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string, store: Storage | null = storage()): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Full or blocked storage costs the preference, not the page.
  }
}
