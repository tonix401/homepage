import { describe, it, expect } from "vitest";
import {
  DEFAULT_SUBJECT,
  SUBJECT_IDS,
  SUBJECT_KEY,
  isSubjectId,
  loadSubject,
  saveSubject,
  subjectName,
} from "./subjects";

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

describe("subjects", () => {
  it("offers the three logos and Tom's cat, Arch first and the default", () => {
    expect(SUBJECT_IDS).toEqual(["arch", "tux", "hyprland", "cat"]);
    expect(DEFAULT_SUBJECT).toBe("arch");
    expect(subjectName("hyprland")).toBe("Hyprland");
  });

  it("only accepts real subject ids", () => {
    expect(isSubjectId("tux")).toBe(true);
    expect(isSubjectId("Tux")).toBe(false);
    expect(isSubjectId(null)).toBe(false);
  });
});

describe("loadSubject / saveSubject", () => {
  it("round-trips a choice, under a key of its own", () => {
    const store = fakeStorage();
    saveSubject("tux", store);
    expect(store.getItem(SUBJECT_KEY)).toBe("tux");
    expect(loadSubject(store)).toBe("tux");
  });

  it("falls back to Arch for nothing stored, anything unknown, or no storage", () => {
    expect(loadSubject(fakeStorage())).toBe(DEFAULT_SUBJECT);
    expect(loadSubject(fakeStorage({ [SUBJECT_KEY]: "gentoo" }))).toBe(DEFAULT_SUBJECT);
    // Once offered and since removed: a visitor who had it gets the default.
    expect(loadSubject(fakeStorage({ [SUBJECT_KEY]: "penguin" }))).toBe(DEFAULT_SUBJECT);
    expect(loadSubject(null)).toBe(DEFAULT_SUBJECT);
  });
});
