import { describe, it, expect } from "vitest";
import { SESSION_KEY, loadDesktop, parseDesktop, saveDesktop } from "./session";
import { MAX_WINDOWS, defaultDesktop, windowsOf, type Desktop } from "./desktop";

/** A Storage the node test environment can have, since it has no browser one. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

/** A stored desktop: two windows on workspace 2, the browser focused. */
const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 2,
    workspace: 2,
    language: "roman",
    fullscreen: false,
    workspaces: { "2": { windows: ["editor-aaaaaa", "browser-bbbbbb"], focus: "browser-bbbbbb" } },
    windows: {
      "editor-aaaaaa": { id: "editor-aaaaaa", app: "editor", arg: "a.md" },
      "browser-bbbbbb": { id: "browser-bbbbbb", app: "browser", arg: null },
    },
    ...over,
  });

describe("parseDesktop", () => {
  it("reads back what it stored", () => {
    expect(parseDesktop(stored())).toEqual({
      workspace: 2,
      language: "roman",
      fullscreen: false,
      workspaces: { 2: { windows: ["editor-aaaaaa", "browser-bbbbbb"], focus: "browser-bbbbbb" } },
      windows: {
        "editor-aaaaaa": { id: "editor-aaaaaa", app: "editor", arg: "a.md" },
        "browser-bbbbbb": { id: "browser-bbbbbb", app: "browser", arg: null },
      },
    });
  });

  it("round-trips a live desktop through save and load", () => {
    const store = fakeStorage();
    const desktop = defaultDesktop();
    saveDesktop(desktop, store);
    expect(loadDesktop(store)).toEqual(desktop);
  });

  it("refuses anything that is not a stored desktop", () => {
    expect(parseDesktop(null)).toBeNull();
    expect(parseDesktop("")).toBeNull();
    expect(parseDesktop("{not json")).toBeNull();
    expect(parseDesktop("[]")).toBeNull();
    expect(parseDesktop('"a string"')).toBeNull();
  });

  it("refuses a payload written by another version of the shape", () => {
    expect(parseDesktop(stored({ v: 1 }))).toBeNull();
    expect(parseDesktop(stored({ v: undefined }))).toBeNull();
  });

  it("takes the window's identity from the key, not from the record", () => {
    const parsed = parseDesktop(
      stored({
        workspaces: { "1": { windows: ["editor-aaaaaa"], focus: "editor-aaaaaa" } },
        windows: { "editor-aaaaaa": { id: "editor-lying", app: "editor", arg: "a.md" } },
        workspace: 1,
      }),
    );
    expect(parsed?.windows["editor-aaaaaa"].id).toBe("editor-aaaaaa");
  });

  it("drops a window whose app no longer exists", () => {
    const parsed = parseDesktop(
      stored({
        windows: {
          "editor-aaaaaa": { app: "editor", arg: "a.md" },
          "gone-bbbbbb": { app: "spreadsheet", arg: null },
        },
      }),
    );
    expect(Object.keys(parsed!.windows)).toEqual(["editor-aaaaaa"]);
    expect(parsed!.workspaces[2].windows).toEqual(["editor-aaaaaa"]);
  });

  it("drops a window whose payload is neither a string nor null", () => {
    const parsed = parseDesktop(
      stored({
        windows: {
          "editor-aaaaaa": { app: "editor", arg: "a.md" },
          "editor-cccccc": { app: "editor", arg: 42 },
        },
      }),
    );
    expect(Object.keys(parsed!.windows)).toEqual(["editor-aaaaaa"]);
  });

  it("ignores a workspace key that is not one the bar shows", () => {
    const parsed = parseDesktop(
      stored({
        workspaces: {
          "0": { windows: ["editor-aaaaaa"], focus: null },
          "9": { windows: ["browser-bbbbbb"], focus: null },
          "x": { windows: ["editor-aaaaaa"], focus: null },
        },
      }),
    );
    expect(parsed!.workspaces).toEqual({});
    expect(parsed!.windows).toEqual({});
  });

  it("hands a self-contradictory session to the repair rather than rejecting it", () => {
    const parsed = parseDesktop(
      stored({
        workspaces: {
          "2": { windows: ["editor-aaaaaa", "editor-ghost"], focus: "editor-ghost" },
        },
      }),
    );
    // The dangling id goes, the orphaned record goes, and focus is rebuilt.
    expect(parsed!.workspaces[2]).toEqual({ windows: ["editor-aaaaaa"], focus: "editor-aaaaaa" });
    expect(Object.keys(parsed!.windows)).toEqual(["editor-aaaaaa"]);
  });

  it("caps a workspace that lists more windows than one may hold", () => {
    const ids = Array.from({ length: MAX_WINDOWS + 3 }, (_, i) => `editor-${i}`);
    const parsed = parseDesktop(
      stored({
        workspaces: { "2": { windows: ids, focus: ids[0] } },
        windows: Object.fromEntries(ids.map((id) => [id, { app: "editor", arg: null }])),
      }),
    );
    expect(parsed!.workspaces[2].windows).toHaveLength(MAX_WINDOWS);
  });

  it("falls back on a workspace number or numerals it does not recognise", () => {
    expect(parseDesktop(stored({ workspace: 99 }))!.workspace).toBe(1);
    expect(parseDesktop(stored({ workspace: "two" }))!.workspace).toBe(1);
    expect(parseDesktop(stored({ language: "de" }))!.language).toBe("cn");
    expect(parseDesktop(stored({ language: undefined }))!.language).toBe("cn");
  });

  it("treats a missing or non-boolean fullscreen as not maximized", () => {
    expect(parseDesktop(stored({ fullscreen: "yes" }))!.fullscreen).toBe(false);
    expect(parseDesktop(stored({ fullscreen: undefined }))!.fullscreen).toBe(false);
  });

  it("keeps an empty desktop empty rather than conjuring a window back", () => {
    const parsed = parseDesktop(stored({ workspaces: {}, windows: {} }));
    expect(parsed).not.toBeNull();
    expect(windowsOf(parsed as Desktop)).toEqual([]);
  });
});

describe("loadDesktop / saveDesktop", () => {
  it("reads and writes under the versioned key", () => {
    const store = fakeStorage();
    saveDesktop(defaultDesktop(), store);
    expect(store.getItem(SESSION_KEY)).toContain('"v":2');
  });

  it("has nothing to restore when storage is empty or unavailable", () => {
    expect(loadDesktop(fakeStorage())).toBeNull();
    expect(loadDesktop(null)).toBeNull();
  });

  it("survives a storage that refuses to answer", () => {
    const throwing = {
      ...fakeStorage(),
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    expect(loadDesktop(throwing)).toBeNull();
    expect(() => saveDesktop(defaultDesktop(), throwing)).not.toThrow();
  });

  it("writes nothing when there is no storage at all", () => {
    expect(() => saveDesktop(defaultDesktop(), null)).not.toThrow();
  });
});
