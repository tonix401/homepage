import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  THEME_IDS,
  THEME_KEY,
  applyTheme,
  isThemeId,
  loadTheme,
  saveTheme,
  themeVariables,
} from "./theme";
import { PALETTES } from "./palettes";

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

describe("palettes", () => {
  it("has five themes, blue first and the default", () => {
    expect(THEME_IDS).toEqual(["blue", "teal", "rose", "amber", "green"]);
    expect(DEFAULT_THEME).toBe("blue");
  });

  it("gives every theme the same tokens, all of them hex colours", () => {
    const keys = Object.keys(PALETTES[0].tokens).sort();
    for (const { tokens } of PALETTES) {
      expect(Object.keys(tokens).sort()).toEqual(keys);
      for (const value of Object.values(tokens)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps blue identical to the palette the site had before themes", () => {
    const blue = PALETTES[0].tokens;
    expect(blue.primary).toBe("#bac3ff");
    expect(blue.onPrimary).toBe("#222c61");
    expect(blue.wallLogo).toBe("#0027a3");
    expect(blue.wallInner).toBe("#001c36");
    expect(blue.wallOuter).toBe("#000913");
  });
});

describe("themeVariables", () => {
  it("names each token as a kebab-case --theme- property", () => {
    const vars = themeVariables("teal");
    expect(vars["--theme-primary"]).toBe(PALETTES[1].tokens.primary);
    expect(vars["--theme-surface-lowest"]).toBe(PALETTES[1].tokens.surfaceLowest);
    expect(vars["--theme-on-primary-container"]).toBe(PALETTES[1].tokens.onPrimaryContainer);
    expect(Object.keys(vars)).toHaveLength(Object.keys(PALETTES[1].tokens).length);
  });
});

describe("applyTheme", () => {
  it("sets every variable on the element it is given", () => {
    const set = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => void set.set(k, v) } };
    applyTheme("rose", root as unknown as HTMLElement);
    expect(Object.fromEntries(set)).toEqual(themeVariables("rose"));
  });
});

describe("loadTheme / saveTheme", () => {
  it("round-trips a choice", () => {
    const store = fakeStorage();
    saveTheme("amber", store);
    expect(store.getItem(THEME_KEY)).toBe("amber");
    expect(loadTheme(store)).toBe("amber");
  });

  it("falls back to the default for nothing stored, or anything unknown", () => {
    expect(loadTheme(fakeStorage())).toBe(DEFAULT_THEME);
    expect(loadTheme(fakeStorage({ [THEME_KEY]: "purple" }))).toBe(DEFAULT_THEME);
    expect(loadTheme(fakeStorage({ [THEME_KEY]: '{"id":"teal"}' }))).toBe(DEFAULT_THEME);
  });

  it("survives storage that is missing or throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    } as unknown as Storage;
    expect(loadTheme(broken)).toBe(DEFAULT_THEME);
    expect(() => saveTheme("green", broken)).not.toThrow();
    expect(loadTheme(null)).toBe(DEFAULT_THEME);
  });

  it("only accepts real theme ids", () => {
    expect(isThemeId("green")).toBe(true);
    expect(isThemeId("Green")).toBe(false);
    expect(isThemeId(3)).toBe(false);
  });
});
