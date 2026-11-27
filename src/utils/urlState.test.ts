import { describe, it, expect } from "vitest";
import { decodeDesktop, encodeDesktop, historyMode } from "./urlState";
import { closeWindow, focusWindow, openWindow, setArg, setFullscreen, setLanguage, switchWorkspace, type Desktop } from "./desktop";

const desktop: Desktop = {
  workspace: 2,
  language: "roman",
  fullscreen: false,
  workspaces: { 2: { windows: ["editor-aaaaaa", "kitty-bbbbbb"], focus: "kitty-bbbbbb" } },
  windows: {
    "editor-aaaaaa": { id: "editor-aaaaaa", app: "editor", arg: "projects/Homelab.md" },
    "kitty-bbbbbb": { id: "kitty-bbbbbb", app: "kitty", arg: "jizi 'jīzǐ notes.md'" },
  },
};

const b64 = (text: string) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("encodeDesktop and decodeDesktop", () => {
  it("round-trips, non-ASCII paths included", () => {
    expect(decodeDesktop(encodeDesktop(desktop))).toEqual(desktop);
  });

  it("writes URL-safe text and takes a leading #", () => {
    const hash = encodeDesktop(desktop);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDesktop(`#${hash}`)).toEqual(desktop);
  });

  it("is about a third of the stored JSON, and short for a real layout", () => {
    const four: Desktop = {
      ...desktop,
      workspaces: { 2: { windows: ["editor-a3f9c1", "browser-b4e2d0", "kitty-c5d1e9", "notes-d6c0f8"], focus: "notes-d6c0f8" } },
      windows: {
        "editor-a3f9c1": { id: "editor-a3f9c1", app: "editor", arg: "projects/Homelab.md" },
        "browser-b4e2d0": { id: "browser-b4e2d0", app: "browser", arg: "skills/software.md" },
        "kitty-c5d1e9": { id: "kitty-c5d1e9", app: "kitty", arg: "jizi projects/Homelab.md" },
        "notes-d6c0f8": { id: "notes-d6c0f8", app: "notes", arg: null },
      },
    };
    expect(encodeDesktop(four).length).toBeLessThan(300);
    expect(decodeDesktop(encodeDesktop(four))).toEqual(four);
  });

  it("keeps an empty workspace out of the link and a window's place in its list", () => {
    const empty = { ...desktop, workspaces: { ...desktop.workspaces, 4: { windows: [], focus: null } } };
    const back = decodeDesktop(encodeDesktop(empty));
    expect(back?.workspaces[2].windows).toEqual(["editor-aaaaaa", "kitty-bbbbbb"]);
    expect(back?.workspaces[2].focus).toBe("kitty-bbbbbb");
  });

  it("names no desktop for an empty, garbled or foreign hash", () => {
    expect(decodeDesktop("")).toBeNull();
    expect(decodeDesktop("#")).toBeNull();
    expect(decodeDesktop("#!!!")).toBeNull();
    expect(decodeDesktop("#section-two")).toBeNull();
    expect(decodeDesktop(`#${b64("not json")}`)).toBeNull();
  });

  it("refuses another version and malformed arrays", () => {
    const link = (value: unknown) => `#${b64(JSON.stringify(value))}`;
    expect(decodeDesktop(link([2, "en", 0, 1, []]))).toBeNull();
    expect(decodeDesktop(link({ v: 2, workspace: 1 }))).toBeNull();
    expect(decodeDesktop(link([1, "en", 0, 1, "nope"]))).toBeNull();
    expect(decodeDesktop(link([1, "en", 0, 1, [[1, 0, [["editor-a", 7, null]]]]]))).toBeNull();
    expect(decodeDesktop(link([1, "en", 0, 1, [[1, 0, [["editor-a", "editor", 5]]]]]))).toBeNull();
  });

  it("repairs what was hand-edited", () => {
    const edited = [1, "en", 0, 2, [[2, 5, [["editor-aaaaaa", "editor", null], ["ghost-000000", "ghost", null]]]]];
    const repaired = decodeDesktop(`#${b64(JSON.stringify(edited))}`);
    expect(repaired?.workspaces[2].windows).toEqual(["editor-aaaaaa"]);
    expect(repaired?.workspaces[2].focus).toBe("editor-aaaaaa");
  });
});

describe("historyMode", () => {
  it("pushes for layout changes", () => {
    expect(historyMode(desktop, switchWorkspace(desktop, 3))).toBe("push");
    expect(historyMode(desktop, setLanguage(desktop, "en"))).toBe("push");
    expect(historyMode(desktop, setFullscreen(desktop, true))).toBe("push");
    expect(historyMode(desktop, openWindow(desktop, { app: "browser", arg: null }))).toBe("push");
    expect(historyMode(desktop, closeWindow(desktop, "kitty-bbbbbb"))).toBe("push");
  });

  it("pushes when a window shows something else", () => {
    expect(historyMode(desktop, setArg(desktop, "editor-aaaaaa", "skills/software.md"))).toBe("push");
  });

  it("replaces for a focus change and for no change", () => {
    expect(historyMode(desktop, focusWindow(desktop, "editor-aaaaaa"))).toBe("replace");
    expect(historyMode(desktop, desktop)).toBe("replace");
  });
});
