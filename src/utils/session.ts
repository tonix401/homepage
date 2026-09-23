/**
 * What the tab remembers across a reload.
 *
 * The whole desktop lives here and nowhere else — there is no URL to fall back
 * on, so this is the one thing standing between a reload and an empty screen.
 * `sessionStorage` rather than `localStorage`, on purpose: it is per tab, so
 * two tabs of the site are two independent desktops that cannot clobber each
 * other's writes, and a layout does not outlive the visit that built it.
 *
 * Validation here is about *shapes* — is this JSON a desktop at all. Whether
 * that desktop is self-consistent is `repairDesktop`'s question, and it is
 * asked last, on the way out.
 *
 * Nothing here knows about the file tree: a payload naming a file that has
 * since gone is the app's problem, and `AppDefinition.normalizeArg` handles it
 * on the way in.
 */

import { isAppId } from "../apps/ids";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_WORKSPACE,
  WORKSPACE_COUNT,
  WORKSPACE_LANGUAGES,
  repairDesktop,
  type Desktop,
  type WindowId,
  type WindowRecord,
  type WorkspaceRecord,
} from "./desktop";

/** Bumped — key and all — whenever the stored shape changes, so stale data is
 *  never read rather than needing a migration. */
export const SESSION_KEY = "homepage.session.v2";

const VERSION = 2;

interface StoredDesktop extends Desktop {
  v: number;
}

/**
 * Safari's private mode throws on *reaching* `sessionStorage`, not only on
 * writing to it, so even the lookup is guarded.
 */
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The key is the window's identity; a stored `id` field is ignored, so the two
 * can never disagree about which window this is.
 */
function readWindows(value: unknown): Record<WindowId, WindowRecord> {
  const windows: Record<WindowId, WindowRecord> = {};
  if (typeof value !== "object" || value === null) return windows;

  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!id || typeof entry !== "object" || entry === null) continue;
    const { app, arg } = entry as Partial<WindowRecord>;
    // An app that no longer exists — a renamed id, an older build — takes its
    // window with it rather than rendering as a blank column.
    if (typeof app !== "string" || !isAppId(app)) continue;
    if (arg !== null && typeof arg !== "string") continue;
    windows[id] = { id, app, arg };
  }
  return windows;
}

function readWorkspaces(value: unknown): Record<number, WorkspaceRecord> {
  const workspaces: Record<number, WorkspaceRecord> = {};
  if (typeof value !== "object" || value === null) return workspaces;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const workspace = Number(key);
    if (!Number.isInteger(workspace) || workspace < 1 || workspace > WORKSPACE_COUNT) continue;
    if (typeof entry !== "object" || entry === null) continue;

    const { windows, focus } = entry as Partial<WorkspaceRecord>;
    if (!Array.isArray(windows)) continue;
    workspaces[workspace] = {
      windows: windows.filter((id): id is WindowId => typeof id === "string" && id !== ""),
      focus: typeof focus === "string" ? focus : null,
    };
  }
  return workspaces;
}

/**
 * Everything the stored blob is allowed to be, or `null`. Pure, so tested.
 *
 * An empty desktop comes back as an empty desktop rather than as `null`:
 * closing your last window and reloading should leave the wallpaper you left,
 * not conjure an editor back.
 */
export function parseDesktop(raw: string | null): Desktop | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const { v, workspace, language, fullscreen, workspaces, windows } =
    value as Partial<StoredDesktop>;
  if (v !== VERSION) return null;

  return repairDesktop({
    workspace: typeof workspace === "number" ? workspace : DEFAULT_WORKSPACE,
    language: WORKSPACE_LANGUAGES.find((known) => known === language) ?? DEFAULT_LANGUAGE,
    fullscreen: fullscreen === true,
    workspaces: readWorkspaces(workspaces),
    windows: readWindows(windows),
  });
}

export function loadDesktop(store: Storage | null = storage()): Desktop | null {
  if (!store) return null;
  try {
    return parseDesktop(store.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function saveDesktop(desktop: Desktop, store: Storage | null = storage()): void {
  if (!store) return;
  try {
    store.setItem(SESSION_KEY, JSON.stringify({ v: VERSION, ...desktop }));
  } catch {
    // Full, disabled, or a context that refuses to store anything. A lost
    // session is not worth a console warning on every navigation.
  }
}
