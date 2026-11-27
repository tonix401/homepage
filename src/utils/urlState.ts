/**
 * The desktop in the address bar: `/#<base64url>`. A link opens the layout it
 * was copied from, and Back and Forward walk through the entries `App` pushes.
 *
 * What is encoded is a positional array, not the object `sessionStorage`
 * keeps (`session.ts`): no key names, and each window id once instead of four
 * times, about a third of the length.
 *
 *     [1, "cn", 0, 1, [[1, 0, [["editor-a3f9c1", "editor", "a.md"], …]], …]]
 *      │   │    │  │    └ per non-empty workspace: [number, index of the
 *      │   │    │  │      focused window or -1, its windows in strip order]
 *      │   │    │  └ the workspace on screen
 *      │   │    └ fullscreen, 0 or 1
 *      │   └ language
 *      └ the format's version, bumped when the array changes
 *
 * The ids stay in the link so that Back and Forward keep every unchanged
 * window the same window (a new id would remount it).
 *
 * A hash rather than a path or a query: the site is static, so there is no
 * server to route a path, and the hash is never sent to one. Decoding goes
 * through `parseDesktop`, so a hand-edited or stale link is repaired or
 * refused exactly as a stored session is — `null`, and the caller falls back.
 *
 * Pure, so tested; `App` does the reading of `location` and the history calls.
 */

import { type Desktop } from "./desktop";
import { STORED_VERSION, parseDesktop } from "./session";

/** Bumped whenever the array's shape changes; a link of another version names no desktop. */
const FORMAT = 1;

type Tuple = [number, number, [string, string, string | null][]];

/** The desktop as the hash's text, without the `#`. UTF-8, since a path may hold `ī`. */
export function encodeDesktop(desktop: Desktop): string {
  const workspaces = Object.entries(desktop.workspaces)
    .filter(([, record]) => record.windows.length > 0)
    .map(([key, record]): Tuple => [
      Number(key),
      record.focus === null ? -1 : record.windows.indexOf(record.focus),
      record.windows.flatMap((id) => {
        const window = desktop.windows[id];
        return window ? [[id, window.app, window.arg] as [string, string, string | null]] : [];
      }),
    ]);
  const array = [FORMAT, desktop.language, desktop.fullscreen ? 1 : 0, desktop.workspace, workspaces];
  const bytes = new TextEncoder().encode(JSON.stringify(array));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `value` as the array's windows, or `null` when any is not `[id, app, arg]`. */
function windowsOf(value: unknown): [string, string, string | null][] | null {
  if (!Array.isArray(value)) return null;
  const windows: [string, string, string | null][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
    if (entry[2] !== null && typeof entry[2] !== "string") return null;
    windows.push([entry[0], entry[1], entry[2]]);
  }
  return windows;
}

/** The desktop a hash (with or without its `#`) names, or `null` when it names none. */
export function decodeDesktop(hash: string): Desktop | null {
  const text = hash.replace(/^#/, "");
  if (!text) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const array: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(array) || array[0] !== FORMAT || !Array.isArray(array[4])) return null;
    const [, language, fullscreen, workspace, listed] = array as [number, unknown, unknown, unknown, unknown[]];

    // The stored object `parseDesktop` validates and repairs, so that stays in one place.
    const workspaces: Record<number, { windows: string[]; focus: string | null }> = {};
    const windows: Record<string, { id: string; app: string; arg: string | null }> = {};
    for (const entry of listed) {
      if (!Array.isArray(entry) || typeof entry[0] !== "number" || typeof entry[1] !== "number") return null;
      const own = windowsOf(entry[2]);
      if (!own) return null;
      workspaces[entry[0]] = { windows: own.map(([id]) => id), focus: own[entry[1]]?.[0] ?? null };
      for (const [id, app, arg] of own) windows[id] = { id, app, arg };
    }
    return parseDesktop(JSON.stringify({ v: STORED_VERSION, workspace, language, fullscreen: fullscreen === 1, workspaces, windows }));
  } catch {
    return null;
  }
}

/**
 * Whether going from `prev` to `next` is a step Back should undo: a window
 * opened, closed or moved, a workspace, language or fullscreen change, or a
 * window showing something else (a file opened). Moving focus only replaces
 * the entry, so Back does not retrace every click.
 */
export function historyMode(prev: Desktop, next: Desktop): "push" | "replace" {
  if (prev.workspace !== next.workspace) return "push";
  if (prev.language !== next.language) return "push";
  if (prev.fullscreen !== next.fullscreen) return "push";

  const keys = new Set([...Object.keys(prev.workspaces), ...Object.keys(next.workspaces)]);
  for (const key of keys) {
    const before = prev.workspaces[Number(key)]?.windows ?? [];
    const after = next.workspaces[Number(key)]?.windows ?? [];
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) return "push";
  }
  for (const [id, window] of Object.entries(next.windows)) {
    const before = prev.windows[id];
    if (!before || before.app !== window.app || before.arg !== window.arg) return "push";
  }
  return "replace";
}
