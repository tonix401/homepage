/**
 * The desktop: every workspace, every window, and which of them is on screen.
 *
 * This is the whole of the app's state. Nothing lives in the URL — the address
 * bar stays `/` however many windows are open — so this object, mirrored to
 * `sessionStorage` by `session.ts`, is the only thing a reload has to restore.
 *
 * Windows are stored once, in `windows`, and each workspace holds an ordered
 * list of their ids. That normalization buys one thing: a window is created
 * when it opens and lives until it closes, rather than being rebuilt whenever
 * its container changes. It costs three invariants that a plain array made
 * unrepresentable, and `repairDesktop` is where they are restored — see there.
 *
 * Layout follows niri: one workspace is a horizontal strip, one window fills
 * the viewport, two or more take half of it each, so opening a third pushes
 * the first off the left edge and the strip scrolls. The focused column is the
 * one the view scrolls to keep on screen — never the other way round, see
 * `ArchStrip.tsx`.
 *
 * Everything here is pure, so the interesting decisions — what closing the
 * focused window does to focus, what happens at the window cap — are covered
 * by `desktop.test.ts` rather than by clicking around.
 */

import { DEFAULT_APP, type AppId } from "../apps/ids";

/**
 * The numeral systems the Waybar can show workspaces in; `Waybar.tsx` has a
 * glyph set for each, keyed by these names.
 */
export const WORKSPACE_LANGUAGES = ["en", "cn", "roman"] as const;

export type WorkspaceLanguage = (typeof WORKSPACE_LANGUAGES)[number];

/** Kept in step with the glyph sets in `Waybar.tsx`. */
export const WORKSPACE_COUNT = 5;

/**
 * How many columns one workspace may hold. A cap rather than a design limit:
 * it stops a stored session — or a stuck launcher click — from mounting an
 * unbounded number of editors. Opening past it closes the leftmost column.
 */
export const MAX_WINDOWS = 8;

export const DEFAULT_WORKSPACE = 1;
export const DEFAULT_LANGUAGE: WorkspaceLanguage = "cn";

export type WindowId = string;

/** A window without its identity: what opens one, and what `lastWindow` keeps. */
export interface WindowSpec {
  readonly app: AppId;
  /** App-defined payload. Both current apps read it as a file path. */
  readonly arg: string | null;
}

export interface WindowRecord extends WindowSpec {
  readonly id: WindowId;
}

/** One workspace's strip of columns, left to right. */
export interface WorkspaceRecord {
  readonly windows: readonly WindowId[];
  /**
   * This workspace's active column, remembered while you are away on another
   * one. A desktop has a single focused window — `focusedId` — but it has to
   * be stored per workspace, or switching would land on an id that is not on
   * screen and focus would have to be guessed on every switch.
   */
  readonly focus: WindowId | null;
}

export interface Desktop {
  readonly workspace: number;
  /** Which numerals the Waybar labels its workspaces with. */
  readonly language: WorkspaceLanguage;
  /** Whether the focused window fills the viewport, covering the bar. */
  readonly fullscreen: boolean;
  readonly workspaces: Readonly<Record<number, WorkspaceRecord>>;
  readonly windows: Readonly<Record<WindowId, WindowRecord>>;
}

export const EMPTY_WORKSPACE: WorkspaceRecord = { windows: [], focus: null };

/**
 * Six random hex digits behind the app's own name — `editor-a3f9c1`.
 *
 * The prefix is there to make a stored session readable and nothing reads it
 * back: `app` is a field of its own, and parsing the id would make renaming an
 * app silently invalidate every window that has one.
 *
 * Random rather than a counter because ids now outlive the page: a counter
 * would restart at 1 on reload and hand a fresh window the id of a restored
 * one. `taken` closes the remaining gap — a collision is unlikely at eight
 * windows a workspace, and would quietly merge two of them.
 */
export function makeWindow(
  spec: WindowSpec,
  taken: Readonly<Record<WindowId, unknown>> = {},
): WindowRecord {
  let id: WindowId;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(3));
    id = `${spec.app}-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } while (id in taken);
  return { id, app: spec.app, arg: spec.arg };
}

/**
 * What a first visit shows: one editor on the default file, tiled on the first
 * workspace, so the bar and the wallpaper are visible from the start.
 */
export function defaultDesktop(): Desktop {
  const editor = makeWindow({ app: DEFAULT_APP, arg: null });
  return {
    workspace: DEFAULT_WORKSPACE,
    language: DEFAULT_LANGUAGE,
    fullscreen: false,
    workspaces: { [DEFAULT_WORKSPACE]: { windows: [editor.id], focus: editor.id } },
    windows: { [editor.id]: editor },
  };
}

export function getWorkspace(desktop: Desktop, workspace: number): WorkspaceRecord {
  return desktop.workspaces[workspace] ?? EMPTY_WORKSPACE;
}

/** The focused window's id, or `null` on an empty workspace. */
export function focusedId(desktop: Desktop): WindowId | null {
  return getWorkspace(desktop, desktop.workspace).focus;
}

export function focusedWindow(desktop: Desktop): WindowRecord | null {
  const id = focusedId(desktop);
  return id === null ? null : (desktop.windows[id] ?? null);
}

/** A workspace's windows themselves, in column order. */
export function windowsOf(
  desktop: Desktop,
  workspace: number = desktop.workspace,
): readonly WindowRecord[] {
  const records: WindowRecord[] = [];
  for (const id of getWorkspace(desktop, workspace).windows) {
    const record = desktop.windows[id];
    if (record) records.push(record);
  }
  return records;
}

/** Which workspace holds a window, or `null` if none does. */
function workspaceOf(desktop: Desktop, id: WindowId): number | null {
  for (const [key, workspace] of Object.entries(desktop.workspaces)) {
    if (workspace.windows.includes(id)) return Number(key);
  }
  return null;
}

/** Stores a workspace, dropping it when it empties so the keys are the
 *  workspaces that hold something — which is what the Waybar draws. */
function putWorkspace(desktop: Desktop, workspace: number, next: WorkspaceRecord): Desktop {
  const workspaces = { ...desktop.workspaces };
  if (next.windows.length === 0) delete workspaces[workspace];
  else workspaces[workspace] = next;
  return { ...desktop, workspaces };
}

/**
 * Appends a column at the right end of the current workspace and focuses it,
 * which is what niri does.
 *
 * Opening an app that is already on the strip gives a second window, the way a
 * launcher gives a second terminal. Nothing here folds duplicates together;
 * the browser's bookmarks navigate the window they are in instead.
 *
 * A full strip closes its leftmost columns to make room, rather than refusing:
 * they are the ones furthest off-screen, and the new window still lands on
 * the right where it always does.
 */
export function openWindow(desktop: Desktop, spec: WindowSpec): Desktop {
  const workspace = getWorkspace(desktop, desktop.workspace);
  const evicted = workspace.windows.slice(0, workspace.windows.length - (MAX_WINDOWS - 1));
  const kept = workspace.windows.slice(evicted.length);
  const rest = { ...desktop.windows };
  for (const id of evicted) delete rest[id];
  const window = makeWindow(spec, rest);
  return {
    ...putWorkspace(desktop, desktop.workspace, {
      windows: [...kept, window.id],
      focus: window.id,
    }),
    windows: { ...rest, [window.id]: window },
    // Opening always leaves the strip tiled, so you can see what you opened
    // and where it landed — and, onto an empty workspace, so the bar the
    // launcher lives on does not vanish along with the desktop.
    fullscreen: false,
  };
}

/**
 * Closing the focused column hands focus to the one that slides into its
 * place, falling back to the left at the right-hand end. Closing the last one
 * leaves the bare desktop.
 */
export function closeWindow(desktop: Desktop, id: WindowId): Desktop {
  const key = workspaceOf(desktop, id);
  if (key === null) return desktop;
  const workspace = getWorkspace(desktop, key);
  const index = workspace.windows.indexOf(id);
  const windows = workspace.windows.filter((other) => other !== id);
  const focus =
    workspace.focus === id ? (windows[index] ?? windows[index - 1] ?? null) : workspace.focus;

  // Closing the window that filled the viewport leaves the strip, rather than
  // handing its fullscreen to whichever window inherits focus — `openWindow`
  // has the mirror of this rule. `focusedId` is the *active* workspace's, so
  // closing a window elsewhere cannot restore a maximized one you can't see.
  const wasMaximized = desktop.fullscreen && id === focusedId(desktop);

  const rest = { ...desktop.windows };
  delete rest[id];
  return {
    ...putWorkspace(desktop, key, { windows, focus }),
    windows: rest,
    fullscreen: wasMaximized ? false : desktop.fullscreen,
  };
}

export function focusWindow(desktop: Desktop, id: WindowId): Desktop {
  const workspace = getWorkspace(desktop, desktop.workspace);
  // Returning the same object keeps a click inside the focused window, or a
  // pointer crossing it again, from re-rendering anything.
  if (workspace.focus === id || !workspace.windows.includes(id)) return desktop;
  return putWorkspace(desktop, desktop.workspace, { ...workspace, focus: id });
}

/** What "the editor opened another file" does: the window keeps its identity. */
export function setArg(desktop: Desktop, id: WindowId, arg: string | null): Desktop {
  const window = desktop.windows[id];
  if (!window || window.arg === arg) return desktop;
  return { ...desktop, windows: { ...desktop.windows, [id]: { ...window, arg } } };
}

/**
 * Maximizes or restores the focused window. Any window may be maximized at any
 * time, however many share its workspace: the strip is still there underneath,
 * and every app puts a restore button in its own title bar — which is the only
 * way back, since a maximized window covers the bar.
 */
export function setFullscreen(desktop: Desktop, fullscreen: boolean): Desktop {
  if (desktop.fullscreen === fullscreen) return desktop;
  if (fullscreen && focusedId(desktop) === null) return desktop;
  return { ...desktop, fullscreen };
}

export function switchWorkspace(desktop: Desktop, workspace: number): Desktop {
  if (workspace === desktop.workspace) return desktop;
  if (!Number.isInteger(workspace) || workspace < 1 || workspace > WORKSPACE_COUNT) {
    return desktop;
  }
  return { ...desktop, workspace };
}

/** The numerals are a property of the bar, so nothing else moves. */
export function setLanguage(desktop: Desktop, language: WorkspaceLanguage): Desktop {
  return desktop.language === language ? desktop : { ...desktop, language };
}

/**
 * Restores the three invariants that splitting windows out of their workspace
 * made breakable:
 *
 *   - every id in a workspace's list has a record in `windows`
 *   - every record in `windows` is listed by exactly one workspace
 *   - `focus` is `null`, or an id in that workspace's own list
 *
 * The reducers above maintain all three by construction, so this runs at the
 * one place they can arrive broken: a stored session, which may have been
 * hand-edited, half-written, or left behind by an older build. Repairing is
 * better than rejecting — one dangling id should cost you that window, not
 * your whole desktop.
 */
export function repairDesktop(desktop: Desktop): Desktop {
  const claimed = new Set<WindowId>();
  const workspaces: Record<number, WorkspaceRecord> = {};

  for (let key = 1; key <= WORKSPACE_COUNT; key++) {
    const entry = desktop.workspaces[key];
    if (!entry) continue;

    const windows: WindowId[] = [];
    for (const id of entry.windows) {
      // Dangling, duplicated, or already claimed by a workspace to the left.
      if (!desktop.windows[id] || claimed.has(id)) continue;
      if (windows.length >= MAX_WINDOWS) break;
      claimed.add(id);
      windows.push(id);
    }
    if (windows.length === 0) continue;

    workspaces[key] = {
      windows,
      focus:
        entry.focus !== null && windows.includes(entry.focus)
          ? entry.focus
          : windows[windows.length - 1],
    };
  }

  // Anything no workspace listed is unreachable, and would otherwise sit in
  // storage forever growing the payload.
  const windows: Record<WindowId, WindowRecord> = {};
  for (const id of claimed) windows[id] = desktop.windows[id];

  const workspace =
    Number.isInteger(desktop.workspace) &&
    desktop.workspace >= 1 &&
    desktop.workspace <= WORKSPACE_COUNT
      ? desktop.workspace
      : DEFAULT_WORKSPACE;

  return {
    workspace,
    language: desktop.language,
    fullscreen: desktop.fullscreen && workspaces[workspace] !== undefined,
    workspaces,
    windows,
  };
}

/** One window fills the viewport; two or more take half of it each. */
export function columnFraction(count: number): number {
  return count <= 1 ? 1 : 0.5;
}

/**
 * Where column `index` of `count` sits once the strip's layout has settled,
 * measured from the start of the strip's content box: `content` is that box's
 * width and `gap` the space between columns, as `.arch-column`'s flex-basis
 * works them out.
 *
 * Settled is the point. Opening a second window starts the first one's width
 * transition from the whole viewport down to half of it, so for a moment the
 * two overflow the strip, and a new column measured then looks off-screen to
 * the right. Scrolling to that dragged the first window left for a frame or
 * two, until its shrinking took the scroll range away and it snapped back.
 */
export function columnSpan(
  index: number,
  count: number,
  content: number,
  gap: number,
): { left: number; right: number } {
  const width = columnFraction(count) * (content + gap) - gap;
  const left = index * (width + gap);
  return { left, right: left + width };
}

/**
 * How far the strip must scroll to bring a column fully into view: negative to
 * the left, positive to the right, `0` when it is already there. The minimal
 * shift, so a column just off the edge slides in rather than being centred.
 *
 * `scrollIntoView({ inline: "nearest" })` would do much the same in one line,
 * but it decides the alignment itself and gives nothing to test. Six lines of
 * arithmetic here say exactly where the strip lands, let the caller choose the
 * animation, and can be checked without a browser.
 *
 * Both ranges are in the same coordinate space; the caller passes the
 * column's `columnSpan` and the part of the content box on screen, which
 * already leaves out the strip's gutter, so the gap around a scrolled-to
 * column survives.
 */
export function scrollShiftFor(
  column: { left: number; right: number },
  view: { left: number; right: number },
): number {
  if (column.left < view.left) return column.left - view.left;
  if (column.right > view.right) return column.right - view.right;
  return 0;
}
