import { describe, expect, it } from "vitest";
import { parseLog, repoWebUrl } from "./gitLog";

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

describe("repoWebUrl", () => {
  it("reads the SSH and HTTPS forms of a GitHub remote", () => {
    for (const remote of [
      "git@github.com:tonix401/homepage.git",
      "ssh://git@github.com/tonix401/homepage.git",
      "https://github.com/tonix401/homepage",
      "https://github.com/tonix401/homepage.git\n",
      "https://x-access-token:secret@github.com/tonix401/homepage/",
    ]) {
      expect(repoWebUrl(remote)).toBe("https://github.com/tonix401/homepage");
    }
  });

  it("gives null for a remote that isn't on GitHub", () => {
    expect(repoWebUrl("git@gitlab.com:tonix401/homepage.git")).toBeNull();
    expect(repoWebUrl("/srv/git/homepage.git")).toBeNull();
    expect(repoWebUrl("")).toBeNull();
  });
});
