import { describe, it, expect } from "vitest";
import { type Desktop } from "./desktop";
import { allNodes, buildProcessTree, flattenTree, pidFor } from "./processTree";
import { brailleGraph } from "./brailleGraph";

const desktop: Desktop = {
  workspace: 2,
  language: "en",
  fullscreen: false,
  workspaces: {
    1: { windows: ["editor-a3f9c1", "browser-00000f"], focus: "browser-00000f" },
    2: { windows: ["terminal-bbbbbb"], focus: "terminal-bbbbbb" },
    3: { windows: [], focus: null },
  },
  windows: {
    "editor-a3f9c1": { id: "editor-a3f9c1", app: "editor", arg: "README.md" },
    "browser-00000f": { id: "browser-00000f", app: "browser", arg: null },
    "terminal-bbbbbb": { id: "terminal-bbbbbb", app: "terminal", arg: "projects" },
  },
};

const tree = buildProcessTree(desktop, (w) => ({
  name: w.app,
  args: w.arg ?? undefined,
  threads: 4,
  memBytes: 1,
  cpu: 0,
}));

describe("pidFor", () => {
  it("is stable for a window and differs between windows", () => {
    expect(pidFor("editor-a3f9c1")).toBe(pidFor("editor-a3f9c1"));
    expect(pidFor("editor-a3f9c1")).not.toBe(pidFor("editor-a3f9c2"));
  });

  it("stays clear of the system pids", () => {
    for (const id of ["x-000000", "x-ffffff", "x-0001f4"]) {
      expect(pidFor(id)).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("buildProcessTree", () => {
  it("roots the tree at systemd, with Hyprland beneath", () => {
    expect(tree.name).toBe("systemd");
    expect(tree.pid).toBe(1);
    expect(tree.children.map((c) => c.name)).toEqual(["Hyprland"]);
  });

  it("lists the workspaces that hold windows, and the one on screen", () => {
    const workspaces = tree.children[0].children;
    expect(workspaces.map((w) => w.name)).toEqual(["workspace 1", "workspace 2"]);
    expect(workspaces.map((w) => w.current)).toEqual([false, true]);
  });

  it("keeps an empty workspace when it is the one on screen", () => {
    const onEmpty = buildProcessTree({ ...desktop, workspace: 3 }, () => ({
      name: "x",
      threads: 1,
      memBytes: 1,
      cpu: 0,
    }));
    expect(onEmpty.children[0].children.map((w) => w.name)).toContain("workspace 3");
  });

  it("puts each window under its workspace, in strip order, named by the caller", () => {
    const ws1 = tree.children[0].children[0];
    expect(ws1.children.map((c) => [c.name, c.args, c.windowId])).toEqual([
      ["editor", "README.md", "editor-a3f9c1"],
      ["browser", undefined, "browser-00000f"],
    ]);
  });

  it("marks only the focused window on the workspace on screen as current", () => {
    const current = allNodes(tree).filter((n) => n.windowId && n.current);
    expect(current.map((n) => n.windowId)).toEqual(["terminal-bbbbbb"]);
  });
});

describe("terminal programs", () => {
  const nested = buildProcessTree(desktop, (w) => ({
    name: w.app === "terminal" ? "jizi" : w.app,
    threads: 1,
    memBytes: 1,
    cpu: 0,
    host: w.app === "terminal" ? { name: "kitty", threads: 10, memBytes: 2 } : undefined,
  }));
  const ws2 = nested.children[0].children[1];

  it("puts the program under a kitty process, one pid along", () => {
    const [kitty] = ws2.children;
    expect(kitty.name).toBe("kitty");
    expect(kitty.pid).toBe(pidFor("terminal-bbbbbb"));
    expect(kitty.children.map((c) => [c.name, c.pid])).toEqual([["jizi", pidFor("terminal-bbbbbb") + 1]]);
  });

  it("keeps the window's id, and the focus mark, on the program", () => {
    const [kitty] = ws2.children;
    expect(kitty.key).not.toBe("terminal-bbbbbb");
    expect(kitty.current).toBeFalsy();
    expect(kitty.children[0]).toMatchObject({ key: "terminal-bbbbbb", windowId: "terminal-bbbbbb", current: true });
  });

  it("leaves apps that are not terminal programs where they were", () => {
    expect(nested.children[0].children[0].children.map((c) => c.name)).toEqual(["editor", "browser"]);
  });
});

describe("flattenTree", () => {
  it("draws btop's guides and branches", () => {
    const lines = flattenTree(tree, new Set()).map((r) => `${r.prefix}${r.node.name}`);
    expect(lines).toEqual([
      "[-]─systemd",
      "   └─[-]─Hyprland",
      "      ├─[-]─workspace 1",
      "      │  ├─editor",
      "      │  └─browser",
      "      └─[-]─workspace 2",
      "         └─terminal",
    ]);
  });

  it("folds a collapsed node's descendants away and marks it [+]", () => {
    const rows = flattenTree(tree, new Set(["ws-1"]));
    expect(rows.map((r) => r.node.name)).toEqual([
      "systemd",
      "Hyprland",
      "workspace 1",
      "workspace 2",
      "terminal",
    ]);
    expect(rows[2].prefix.endsWith("[+]─")).toBe(true);
  });
});

describe("brailleGraph", () => {
  it("is height lines of width braille characters", () => {
    const lines = brailleGraph([0.5, 1], 3, 2);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect([...line]).toHaveLength(3);
      for (const ch of line) expect(ch.charCodeAt(0) & 0xff00).toBe(0x2800);
    }
  });

  it("puts the newest readings on the right, and leaves the left blank", () => {
    const [top, bottom] = brailleGraph([1, 1], 3, 2);
    expect(top.slice(0, 2)).toBe("⠀⠀");
    expect(bottom.slice(0, 2)).toBe("⠀⠀");
    // A full reading in both columns fills every dot of the last character.
    expect(top[2]).toBe("⣿");
    expect(bottom[2]).toBe("⣿");
  });

  it("fills from the bottom: half height lights the bottom row only", () => {
    const [top, bottom] = brailleGraph([0.5, 0.5], 1, 2);
    expect(top).toBe("⠀");
    expect(bottom).toBe("⣿");
  });

  it("lights the floor dot for every reading, zero too, and nothing where there is none", () => {
    const floor = 0x40 | 0x80;
    expect(brailleGraph([0.001, 0], 1, 1)[0]).toBe(String.fromCharCode(0x2800 | floor));
    expect(brailleGraph([], 1, 1)[0]).toBe("\u2800");
  });
});
