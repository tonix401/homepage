import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import {
  type ContentHit,
  type NameHit,
  flattenFiles,
  fuzzyMatch,
  searchFiles,
} from "./search";

function file(path: string, content = ""): FileNode {
  return {
    kind: "file",
    name: path.split("/").pop()!,
    path,
    type: "md",
    content,
  };
}

const tree: TreeNode[] = [
  file("README.md", "# Hello\nsome prose about React\nand more"),
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/DnD CLI.md", "a command line tool\nfor dungeons and dragons"),
      file("projects/Monster.md", "counting monsters\nreact app"),
    ],
  },
];

// ── flattenFiles ────────────────────────────────────────────────────────────

describe("flattenFiles", () => {
  it("returns every file in tree order", () => {
    expect(flattenFiles(tree).map((f) => f.path)).toEqual([
      "README.md",
      "projects/DnD CLI.md",
      "projects/Monster.md",
    ]);
  });

  it("handles an empty tree", () => {
    expect(flattenFiles([])).toEqual([]);
  });
});

// ── fuzzyMatch ──────────────────────────────────────────────────────────────

describe("fuzzyMatch", () => {
  it("matches characters in order", () => {
    expect(fuzzyMatch("README.md", "rdm")).not.toBeNull();
  });

  it("rejects characters that are out of order", () => {
    expect(fuzzyMatch("README.md", "mdr")).toBeNull();
  });

  it("rejects an empty query", () => {
    expect(fuzzyMatch("README.md", "")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("README.md", "READ")).not.toBeNull();
    expect(fuzzyMatch("README.md", "read")).not.toBeNull();
  });

  it("reports the matched ranges, merging adjacent characters", () => {
    expect(fuzzyMatch("abc", "abc")!.ranges).toEqual([{ start: 0, end: 3 }]);
  });

  it("scores a consecutive match above a scattered one", () => {
    const tight = fuzzyMatch("monster.md", "mon")!.score;
    const loose = fuzzyMatch("my own notes.md", "mon")!.score;
    expect(tight).toBeGreaterThan(loose);
  });

  it("scores a match in the file name above one in the directory", () => {
    const inName = fuzzyMatch("docs/report.md", "report")!.score;
    const inDir = fuzzyMatch("report/docs.md", "report")!.score;
    expect(inName).toBeGreaterThan(inDir);
  });
});

// ── searchFiles ─────────────────────────────────────────────────────────────

describe("searchFiles", () => {
  const files = flattenFiles(tree);

  it("returns nothing for a blank query", () => {
    expect(searchFiles(files, "")).toEqual([]);
    expect(searchFiles(files, "   ")).toEqual([]);
  });

  it("puts name hits before content hits", () => {
    const kinds = searchFiles(files, "monster").map((hit) => hit.kind);
    expect(kinds.indexOf("name")).toBeLessThan(kinds.indexOf("content"));
  });

  it("finds text inside files with the right line number", () => {
    const hits = searchFiles(files, "dungeons").filter(
      (hit): hit is ContentHit => hit.kind === "content",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].file.path).toBe("projects/DnD CLI.md");
    expect(hits[0].line).toBe(2);
    expect(hits[0].text).toBe("for dungeons and dragons");
  });

  it("reports ranges that line up with the snippet text", () => {
    const hit = searchFiles(files, "react").find(
      (h): h is ContentHit => h.kind === "content",
    )!;
    const { start, end } = hit.ranges[0];
    expect(hit.text.slice(start, end).toLowerCase()).toBe("react");
  });

  it("is case-insensitive in content", () => {
    expect(searchFiles(files, "HELLO").some((hit) => hit.kind === "content")).toBe(true);
  });

  it("finds every occurrence on a line", () => {
    const hits = searchFiles([file("a.md", "aa")], "a").filter(
      (hit): hit is ContentHit => hit.kind === "content",
    );
    expect(hits[0].ranges).toHaveLength(2);
  });

  it("caps content hits per file", () => {
    const many = file("many.md", Array(50).fill("needle").join("\n"));
    const hits = searchFiles([many], "needle").filter((h) => h.kind === "content");
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it("orders name hits by score", () => {
    const hits = searchFiles(files, "monster").filter(
      (hit): hit is NameHit => hit.kind === "name",
    );
    const scores = hits.map((hit) => hit.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("trims a long line around the match", () => {
    const long = file("long.md", `${"filler ".repeat(60)}needle`);
    const hit = searchFiles([long], "needle").find(
      (h): h is ContentHit => h.kind === "content",
    )!;
    expect(hit.text.length).toBeLessThan(140);
    expect(hit.text).toContain("needle");
    expect(hit.text.startsWith("…")).toBe(true);
    const { start, end } = hit.ranges[0];
    expect(hit.text.slice(start, end)).toBe("needle");
  });

  it("returns nothing when nothing matches", () => {
    expect(searchFiles(files, "zzzzqqq")).toEqual([]);
  });
});
