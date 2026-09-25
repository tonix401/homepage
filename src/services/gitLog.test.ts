import { describe, expect, it } from "vitest";
import { parseLog } from "./gitLog";

describe("parseLog", () => {
  it("splits records and fields on the separators, not on text", () => {
    const output =
      "abc\x1ffix: a | b\x1ftom\x1f2026-09-24T23:48:23+02:00\x1e\n" +
      "def\x1ffirst\x1ftom\x1f2026-09-23T20:36:46+02:00\x1e\n";
    expect(parseLog(output)).toEqual([
      { hash: "abc", subject: "fix: a | b", author: "tom", date: "2026-09-24T23:48:23+02:00" },
      { hash: "def", subject: "first", author: "tom", date: "2026-09-23T20:36:46+02:00" },
    ]);
  });

  it("reads an empty log as no commits", () => {
    expect(parseLog("")).toEqual([]);
  });
});
