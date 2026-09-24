/**
 * The desktop as btop's process tree: `systemd (init)` at the root, Hyprland
 * under it, and under Hyprland the actual window model — every workspace that
 * holds anything, and every window on it, in strip order. A window whose
 * program runs in a terminal is that terminal's process, the program under it.
 *
 * Kept free of React and of the app registry: what a window's process is
 * called and what it claims to use is passed in, so this only knows the shape
 * of the `Desktop` and the tests can hand it one.
 */

import { type Desktop, type WindowRecord } from "./desktop";

export interface ProcNode {
  /** Stable across refreshes, so selection and collapsing survive them. */
  key: string;
  /** `null` for a workspace, which is part of the model rather than a process. */
  pid: number | null;
  name: string;
  /** The rest of the command line, drawn fainter than the name. */
  args?: string;
  threads: number | null;
  user: string | null;
  memBytes: number | null;
  /** Share of a core, 0..1. */
  cpu: number | null;
  /** The window this process is, for a window. */
  windowId?: string;
  /** The window with focus, or the workspace on screen. */
  current?: boolean;
  children: ProcNode[];
}

/** What a window's process is called and what it reports using. */
export interface WindowProcess {
  name: string;
  args?: string;
  threads: number;
  memBytes: number;
  cpu: number;
  /**
   * The terminal a program runs in — kitty, for jīzǐ, btop and fastfetch. The
   * window is then the terminal's process, and the program its child.
   */
  host?: { name: string; threads: number; memBytes: number };
}

export const SYSTEMD_PID = 1;
export const HYPRLAND_PID = 842;

const MB = 1024 * 1024;

/**
 * A window's pid, from the six random hex digits of its id: a real window id
 * is `editor-a3f9c1`, so it gets a pid that is stable for as long as the
 * window is open and different for the next one. Kept clear of the system
 * pids above, and of the low range a real system fills at boot.
 */
export function pidFor(windowId: string): number {
  const hex = windowId.split("-").pop() ?? "";
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? 1000 : 1000 + (n % 90000);
}

export function buildProcessTree(
  desktop: Desktop,
  describe: (window: WindowRecord) => WindowProcess,
): ProcNode {
  const workspaces: ProcNode[] = [];
  const numbers = Object.keys(desktop.workspaces)
    .map(Number)
    .sort((a, b) => a - b);

  for (const n of numbers) {
    const record = desktop.workspaces[n];
    const windows = record.windows
      .map((id) => desktop.windows[id])
      .filter((w): w is WindowRecord => w !== undefined);
    // An empty workspace is not worth a row — unless it is the one on screen,
    // which would otherwise vanish from the tree while you are looking at it.
    if (windows.length === 0 && n !== desktop.workspace) continue;

    workspaces.push({
      key: `ws-${n}`,
      pid: null,
      name: `workspace ${n}`,
      threads: null,
      user: null,
      memBytes: null,
      cpu: null,
      current: n === desktop.workspace,
      children: windows.map((window) => {
        const proc = describe(window);
        const pid = pidFor(window.id);
        // The program keeps the window's id as its key, so a selection made
        // by window id lands on the program, and is marked as the window is.
        const program: ProcNode = {
          key: window.id,
          pid: proc.host ? pid + 1 : pid,
          name: proc.name,
          args: proc.args,
          threads: proc.threads,
          user: "tom",
          memBytes: proc.memBytes,
          cpu: proc.cpu,
          windowId: window.id,
          current: n === desktop.workspace && record.focus === window.id,
          children: [],
        };
        if (!proc.host) return program;
        // A terminal program: the window is its terminal's process, started
        // first, so the program is the next pid along.
        return {
          key: `${window.id}:host`,
          pid,
          name: proc.host.name,
          threads: proc.host.threads,
          user: "tom",
          memBytes: proc.host.memBytes,
          cpu: 0,
          children: [program],
        };
      }),
    });
  }
  if (!numbers.includes(desktop.workspace)) {
    workspaces.push({
      key: `ws-${desktop.workspace}`,
      pid: null,
      name: `workspace ${desktop.workspace}`,
      threads: null,
      user: null,
      memBytes: null,
      cpu: null,
      current: true,
      children: [],
    });
  }

  const hyprland: ProcNode = {
    key: "hyprland",
    pid: HYPRLAND_PID,
    name: "Hyprland",
    threads: 12,
    user: "tom",
    memBytes: 92 * MB,
    cpu: 0.004,
    children: workspaces,
  };

  return {
    key: "systemd",
    pid: SYSTEMD_PID,
    name: "systemd",
    args: "(init)",
    threads: 1,
    user: "root",
    memBytes: 14 * MB,
    cpu: 0,
    children: [hyprland],
  };
}

/** One line of the tree as btop draws it. */
export interface ProcRow {
  node: ProcNode;
  /** The guides and branch in front of the pid: `│  ├─[-]─`. */
  prefix: string;
  collapsed: boolean;
}

/**
 * The tree flattened into the rows on screen, with btop's guides drawn in
 * front of each: `│` for an ancestor with more to come, `├─` or `└─` for the
 * branch, and `[-]` / `[+]` on anything that has children, open or folded.
 * A collapsed node's descendants are not rows at all.
 */
export function flattenTree(root: ProcNode, collapsed: ReadonlySet<string>): ProcRow[] {
  const rows: ProcRow[] = [];
  const visit = (node: ProcNode, guides: string, isLast: boolean, isRoot: boolean) => {
    const folded = collapsed.has(node.key);
    const toggle = node.children.length > 0 ? (folded ? "[+]─" : "[-]─") : "";
    const branch = isRoot ? "" : isLast ? "└─" : "├─";
    rows.push({ node, prefix: guides + branch + toggle, collapsed: folded });
    if (folded) return;
    const childGuides = isRoot ? guides + "   " : guides + (isLast ? "   " : "│  ");
    node.children.forEach((child, i) => {
      visit(child, childGuides, i === node.children.length - 1, false);
    });
  };
  visit(root, "", true, true);
  return rows;
}

/** Every node in the tree, depth first — for counting, and finding by key. */
export function allNodes(root: ProcNode): ProcNode[] {
  return [root, ...root.children.flatMap(allNodes)];
}
