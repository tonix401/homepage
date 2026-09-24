/**
 * Every app the window manager can run.
 *
 * Deliberately a leaf with no imports: `route.ts` has to validate an app id
 * coming out of a URL, and `session.ts` one coming out of storage, without
 * either of them pulling in the registry — and with it React and the whole
 * app tree. The registry imports this; this imports nothing.
 */

export const APP_IDS = ["editor", "browser", "terminal", "notes", "monitor", "fetch"] as const;

export type AppId = (typeof APP_IDS)[number];

/** What `?file=…` and a bare `/` open, and what a window with no app names. */
export const DEFAULT_APP: AppId = "editor";

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}
