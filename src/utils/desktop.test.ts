import { describe, it, expect } from "vitest";
import {
  MAX_WINDOWS,
  WORKSPACE_COUNT,
  closeWindow,
  columnFraction,
  columnSpan,
  defaultDesktop,
  focusWindow,
  focusedId,
  focusedWindow,
  getWorkspace,
  makeWindow,
  openWindow,
  repairDesktop,
  scrollShiftFor,
  setArg,
  setFullscreen,
  setLanguage,
  switchWorkspace,
  windowsOf,
  type Desktop,
  type WindowRecord,
} from "./desktop";

/**
 * A desktop whose workspaces are given as editors named by their payload:
 * `build({ 1: ["a.md", "b.md"] })` is two columns on workspace 1, the last
 * focused. The records are returned too, so a case can name one by its arg.
 */
function build(
  layout: Record<number, (string | null)[]>,
  over: Partial<Desktop> = {},
): { desktop: Desktop; id: (arg: string | null) => string } {
  const windows: Record<string, WindowRecord> = {};
  const workspaces: Record<number, { windows: string[]; focus: string | null }> = {};

  for (const [key, args] of Object.entries(layout)) {
    const records = args.map((arg) => makeWindow({ app: "editor", arg }, windows));
    for (const record of records) windows[record.id] = record;
    workspaces[Number(key)] = {
      windows: records.map((r) => r.id),
      focus: records[records.length - 1]?.id ?? null,
    };
  }

  const desktop: Desktop = {
    workspace: 1,
    language: "cn",
    fullscreen: false,
    workspaces,
    windows,
    ...over,
  };

  const id = (arg: string | null) => {
    const found = Object.values(windows).find((w) => w.arg === arg);
    if (!found) throw new Error(`no window with arg ${arg}`);
    return found.id;
  };
  return { desktop, id };
}

/** The payloads on a workspace, in column order — what a strip looks like. */
const args = (d: Desktop, ws = d.workspace) => windowsOf(d, ws).map((w) => w.arg);

describe("makeWindow", () => {
  it("names the app in the id without making it the source of truth", () => {
    const window = makeWindow({ app: "browser", arg: "a.md" });
    expect(window.id).toMatch(/^browser-[0-9a-f]{6}$/);
    expect(window.app).toBe("browser");
  });

  it("never reuses an id that is already taken", () => {
    const taken: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      const window = makeWindow({ app: "editor", arg: null }, taken);
      expect(taken[window.id]).toBeUndefined();
      taken[window.id] = window;
    }
  });
});

describe("defaultDesktop", () => {
  it("opens one editor on the first file, tiled on the first workspace", () => {
    const desktop = defaultDesktop();
    expect(windowsOf(desktop)).toEqual([
      expect.objectContaining({ app: "editor", arg: null }),
    ]);
    expect(desktop.workspace).toBe(1);
    expect(desktop.fullscreen).toBe(false);
    expect(focusedId(desktop)).toBe(windowsOf(desktop)[0].id);
  });
});

describe("columnFraction", () => {
  it("gives one window the viewport and everything else half of it", () => {
    expect(columnFraction(0)).toBe(1);
    expect(columnFraction(1)).toBe(1);
    expect(columnFraction(2)).toBe(0.5);
    expect(columnFraction(5)).toBe(0.5);
  });
});

describe("columnSpan", () => {
  // A 1000px content box with 10px gaps: two columns of 495 fill it exactly.
  it("fills the content box with a lone column", () => {
    expect(columnSpan(0, 1, 1000, 10)).toEqual({ left: 0, right: 1000 });
  });

  it("fits a second window beside the first, so opening it needs no scroll", () => {
    expect(columnSpan(0, 2, 1000, 10)).toEqual({ left: 0, right: 495 });
    expect(columnSpan(1, 2, 1000, 10)).toEqual({ left: 505, right: 1000 });
  });

  it("puts a third window a whole column past the edge", () => {
    expect(columnSpan(2, 3, 1000, 10)).toEqual({ left: 1010, right: 1505 });
  });
});

describe("scrollShiftFor", () => {
  const view = { left: 10, right: 1010 };

  it("stays put when the column is already in view", () => {
    expect(scrollShiftFor({ left: 10, right: 1010 }, view)).toBe(0);
    expect(scrollShiftFor({ left: 200, right: 700 }, view)).toBe(0);
  });

  it("slides a column in from the left by the least it can", () => {
    expect(scrollShiftFor({ left: -90, right: 410 }, view)).toBe(-100);
  });

  it("slides a column in from the right by the least it can", () => {
    expect(scrollShiftFor({ left: 710, right: 1210 }, view)).toBe(200);
  });

  it("aligns the left edge of a column too wide to fit", () => {
    expect(scrollShiftFor({ left: -50, right: 2000 }, view)).toBe(-60);
  });
});

describe("openWindow", () => {
  it("appends at the right end of the current workspace and focuses it", () => {
    const { desktop } = build({ 1: ["a.md"] });
    const next = openWindow(desktop, { app: "browser", arg: "b.md" });
    expect(args(next)).toEqual(["a.md", "b.md"]);
    expect(focusedWindow(next)).toMatchObject({ app: "browser", arg: "b.md" });
  });

  it("always leaves the strip tiled, so you can see what you opened", () => {
    const { desktop } = build({ 1: ["a.md"] }, { fullscreen: true });
    expect(openWindow(desktop, { app: "editor", arg: "b.md" }).fullscreen).toBe(false);
    // …including onto an empty workspace, where maximizing would take the bar
    // the launcher lives on with it.
    const bare = build({}, { fullscreen: true }).desktop;
    expect(openWindow(bare, { app: "editor", arg: null }).fullscreen).toBe(false);
  });

  it("gives a second window for an app already on the strip", () => {
    const { desktop } = build({ 1: ["a.md"] });
    const next = openWindow(desktop, { app: "editor", arg: "a.md" });
    expect(args(next)).toEqual(["a.md", "a.md"]);
    expect(getWorkspace(next, 1).windows).toHaveLength(2);
  });

  it("opens onto the workspace on screen, leaving the others alone", () => {
    const { desktop } = build({ 1: ["a.md"], 3: ["c.md"] }, { workspace: 3 });
    const next = openWindow(desktop, { app: "editor", arg: "d.md" });
    expect(args(next, 3)).toEqual(["c.md", "d.md"]);
    expect(args(next, 1)).toEqual(["a.md"]);
  });

  it("refuses to grow past the cap, and focuses the last instead", () => {
    const full = build({ 1: Array.from({ length: MAX_WINDOWS }, (_, i) => `${i}.md`) });
    const next = openWindow(full.desktop, { app: "editor", arg: "extra.md" });
    expect(getWorkspace(next, 1).windows).toHaveLength(MAX_WINDOWS);
    expect(focusedWindow(next)).toMatchObject({ arg: `${MAX_WINDOWS - 1}.md` });
    expect(args(next)).not.toContain("extra.md");
  });
});

describe("closeWindow", () => {
  it("ignores an id no workspace holds", () => {
    const { desktop } = build({ 1: ["a.md"] });
    expect(closeWindow(desktop, "editor-nope")).toBe(desktop);
  });

  it("forgets the record as well as the column", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    const next = closeWindow(desktop, id("a.md"));
    expect(next.windows[id("a.md")]).toBeUndefined();
    expect(Object.keys(next.windows)).toHaveLength(1);
  });

  it("leaves focus alone when something else closes", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md", "c.md"] });
    const next = closeWindow(desktop, id("a.md"));
    expect(args(next)).toEqual(["b.md", "c.md"]);
    expect(focusedWindow(next)).toMatchObject({ arg: "c.md" });
  });

  it("hands focus to the column that slides into place", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md", "c.md"] }, {});
    const focused = focusWindow(desktop, id("b.md"));
    const next = closeWindow(focused, id("b.md"));
    expect(focusedWindow(next)).toMatchObject({ arg: "c.md" });
  });

  it("falls back to the left at the right-hand end", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    const next = closeWindow(desktop, id("b.md"));
    expect(focusedWindow(next)).toMatchObject({ arg: "a.md" });
  });

  it("leaves the bare desktop when the last column closes", () => {
    const { desktop, id } = build({ 1: ["a.md"] });
    const next = closeWindow(desktop, id("a.md"));
    expect(windowsOf(next)).toEqual([]);
    expect(focusedId(next)).toBeNull();
    expect(next.workspaces[1]).toBeUndefined();
  });

  it("leaves fullscreen when the maximized window closes", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] }, { fullscreen: true });
    const next = closeWindow(desktop, id("b.md"));
    // The survivor inherits focus, not the fullscreen of the window that went.
    expect(next.fullscreen).toBe(false);
    expect(focusedWindow(next)).toMatchObject({ arg: "a.md" });
  });

  it("leaves a bare, restored desktop when the last maximized window closes", () => {
    const { desktop, id } = build({ 1: ["a.md"] }, { fullscreen: true });
    const next = closeWindow(desktop, id("a.md"));
    expect(next.fullscreen).toBe(false);
    expect(windowsOf(next)).toEqual([]);
  });

  it("keeps a maximized window maximized when something else closes", () => {
    // Nothing on workspace 2 should restore the window filling workspace 1.
    const { desktop, id } = build({ 1: ["a.md"], 2: ["b.md", "c.md"] }, { fullscreen: true });
    expect(closeWindow(desktop, id("b.md")).fullscreen).toBe(true);
    // Nor should closing an unfocused column of the workspace on screen.
    const { desktop: two, id: id2 } = build({ 1: ["a.md", "b.md"] }, { fullscreen: true });
    expect(closeWindow(two, id2("a.md")).fullscreen).toBe(true);
  });

  it("closes a window sitting on another workspace", () => {
    const { desktop, id } = build({ 1: ["a.md"], 2: ["b.md", "c.md"] });
    const next = closeWindow(desktop, id("b.md"));
    expect(args(next, 2)).toEqual(["c.md"]);
    expect(args(next, 1)).toEqual(["a.md"]);
  });
});

describe("focusWindow", () => {
  it("moves focus along the strip", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    expect(focusedWindow(focusWindow(desktop, id("a.md")))).toMatchObject({ arg: "a.md" });
  });

  it("returns the very same desktop when nothing moves", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    expect(focusWindow(desktop, id("b.md"))).toBe(desktop);
  });

  it("ignores a window that is not on this workspace", () => {
    const { desktop, id } = build({ 1: ["a.md"], 2: ["b.md"] });
    expect(focusWindow(desktop, id("b.md"))).toBe(desktop);
  });
});

describe("setArg", () => {
  it("keeps the window's identity, so it is not remounted", () => {
    const { desktop, id } = build({ 1: ["a.md"] });
    const next = setArg(desktop, id("a.md"), "b.md");
    expect(windowsOf(next)[0].id).toBe(id("a.md"));
    expect(args(next)).toEqual(["b.md"]);
  });

  it("only touches the window it names", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    expect(args(setArg(desktop, id("a.md"), "z.md"))).toEqual(["z.md", "b.md"]);
  });

  it("does nothing for an unknown window or an unchanged payload", () => {
    const { desktop, id } = build({ 1: ["a.md"] });
    expect(setArg(desktop, "editor-nope", "z.md")).toBe(desktop);
    expect(setArg(desktop, id("a.md"), "a.md")).toBe(desktop);
  });
});

describe("setFullscreen", () => {
  it("maximizes a window however many share its workspace", () => {
    const { desktop } = build({ 1: ["a.md", "b.md", "c.md"] });
    expect(setFullscreen(desktop, true).fullscreen).toBe(true);
  });

  it("returns the same desktop when it is already that way", () => {
    const { desktop } = build({ 1: ["a.md"] }, { fullscreen: true });
    expect(setFullscreen(desktop, true)).toBe(desktop);
  });

  it("has nothing to maximize on an empty workspace", () => {
    const { desktop } = build({});
    expect(setFullscreen(desktop, true)).toBe(desktop);
  });
});

describe("switchWorkspace", () => {
  it("remembers each workspace's own focused column", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"], 2: ["c.md", "d.md"] });
    const onFirst = focusWindow(desktop, id("a.md"));
    const away = switchWorkspace(onFirst, 2);
    expect(focusedWindow(away)).toMatchObject({ arg: "d.md" });
    expect(focusedWindow(switchWorkspace(away, 1))).toMatchObject({ arg: "a.md" });
  });

  it("refuses a workspace that is not on the bar", () => {
    const { desktop } = build({ 1: ["a.md"] });
    for (const bad of [0, WORKSPACE_COUNT + 1, -1, 1.5, NaN]) {
      expect(switchWorkspace(desktop, bad)).toBe(desktop);
    }
  });

  it("returns the same desktop for the workspace already on screen", () => {
    const { desktop } = build({ 1: ["a.md"] });
    expect(switchWorkspace(desktop, 1)).toBe(desktop);
  });
});

describe("setLanguage", () => {
  it("changes the numerals and nothing else", () => {
    const { desktop } = build({ 1: ["a.md"] });
    const next = setLanguage(desktop, "roman");
    expect(next.language).toBe("roman");
    expect(next.workspaces).toBe(desktop.workspaces);
    expect(setLanguage(next, "roman")).toBe(next);
  });
});

describe("repairDesktop", () => {
  it("leaves a sound desktop's contents alone", () => {
    const { desktop } = build({ 1: ["a.md", "b.md"], 3: ["c.md"] });
    const repaired = repairDesktop(desktop);
    expect(args(repaired, 1)).toEqual(["a.md", "b.md"]);
    expect(args(repaired, 3)).toEqual(["c.md"]);
    expect(repaired.workspace).toBe(1);
  });

  it("drops an id no record backs", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: { 1: { windows: [id("a.md"), "editor-ghost", id("b.md")], focus: id("b.md") } },
    };
    expect(args(repairDesktop(broken))).toEqual(["a.md", "b.md"]);
  });

  it("drops a record no workspace lists", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: { 1: { windows: [id("a.md")], focus: id("a.md") } },
    };
    const repaired = repairDesktop(broken);
    expect(Object.keys(repaired.windows)).toEqual([id("a.md")]);
  });

  it("lets the leftmost workspace keep a window two of them claim", () => {
    const { desktop, id } = build({ 1: ["a.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: {
        1: { windows: [id("a.md")], focus: id("a.md") },
        2: { windows: [id("a.md")], focus: id("a.md") },
      },
    };
    const repaired = repairDesktop(broken);
    expect(args(repaired, 1)).toEqual(["a.md"]);
    expect(repaired.workspaces[2]).toBeUndefined();
  });

  it("drops a repeated id within one workspace", () => {
    const { desktop, id } = build({ 1: ["a.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: { 1: { windows: [id("a.md"), id("a.md")], focus: id("a.md") } },
    };
    expect(repairDesktop(broken).workspaces[1].windows).toEqual([id("a.md")]);
  });

  it("repairs focus naming a window that is not on that workspace", () => {
    const { desktop, id } = build({ 1: ["a.md", "b.md"], 2: ["c.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: {
        ...desktop.workspaces,
        1: { windows: [id("a.md"), id("b.md")], focus: id("c.md") },
      },
    };
    expect(focusedWindow(repairDesktop(broken))).toMatchObject({ arg: "b.md" });
  });

  it("forgets a workspace left with nothing in it", () => {
    const { desktop } = build({ 1: ["a.md"] });
    const broken: Desktop = {
      ...desktop,
      workspaces: { 1: { windows: ["editor-ghost"], focus: "editor-ghost" } },
    };
    const repaired = repairDesktop(broken);
    expect(repaired.workspaces).toEqual({});
    expect(repaired.windows).toEqual({});
  });

  it("caps a workspace that lists more windows than one may hold", () => {
    const { desktop } = build({
      1: Array.from({ length: MAX_WINDOWS + 3 }, (_, i) => `${i}.md`),
    });
    expect(repairDesktop(desktop).workspaces[1].windows).toHaveLength(MAX_WINDOWS);
  });

  it("pulls an out-of-range active workspace back to the first", () => {
    const { desktop } = build({ 1: ["a.md"] }, { workspace: 99 });
    expect(repairDesktop(desktop).workspace).toBe(1);
  });

  it("cannot stay maximized with nothing on screen to maximize", () => {
    const { desktop } = build({ 2: ["a.md"] }, { workspace: 1, fullscreen: true });
    expect(repairDesktop(desktop).fullscreen).toBe(false);
    const held = build({ 1: ["a.md"] }, { fullscreen: true }).desktop;
    expect(repairDesktop(held).fullscreen).toBe(true);
  });
});
