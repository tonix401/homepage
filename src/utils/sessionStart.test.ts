import { describe, it, expect } from "vitest";
import { START_KEY, recordSessionStart, sessionStart } from "./sessionStart";

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

describe("recordSessionStart / sessionStart", () => {
  it("records the first load and reads it back", () => {
    const store = fakeStorage();
    recordSessionStart(store, 1_700_000_000_000);
    expect(store.getItem(START_KEY)).toBe("1700000000000");
    expect(sessionStart(store)).toBe(1_700_000_000_000);
  });

  it("keeps the first start across later loads, as a reload does", () => {
    const store = fakeStorage();
    recordSessionStart(store, 1_700_000_000_000);
    recordSessionStart(store, 1_700_000_999_000);
    expect(sessionStart(store)).toBe(1_700_000_000_000);
  });

  it("replaces a stored value that is not a start at all", () => {
    for (const bad of ["soon", "-5", "0", String(Date.now() + 86_400_000)]) {
      const store = fakeStorage({ [START_KEY]: bad });
      recordSessionStart(store, 1_700_000_000_000);
      expect(sessionStart(store)).toBe(1_700_000_000_000);
    }
  });

  it("falls back to this page load without storage, or with storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => recordSessionStart(broken)).not.toThrow();
    expect(sessionStart(broken)).toBe(performance.timeOrigin);
    expect(sessionStart(null)).toBe(performance.timeOrigin);
  });
});
