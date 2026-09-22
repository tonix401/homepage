import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  collectFolderPaths,
  collectMdCodeFenceLangs,
  normalizeFolderPath,
} from "./FilesConverterService";

describe("collectMdCodeFenceLangs", () => {
  it("returns empty array for empty string", () => {
    expect(collectMdCodeFenceLangs("")).toEqual([]);
  });

  it("returns empty array when no fences are present", () => {
    expect(collectMdCodeFenceLangs("# Heading\n\nSome text.")).toEqual([]);
  });

  it("returns empty array for a fence with no language hint", () => {
    expect(collectMdCodeFenceLangs("```\ncode\n```")).toEqual([]);
  });

  it("detects a language by short extension", () => {
    expect(collectMdCodeFenceLangs("```ts\nconst x = 1;\n```")).toEqual(["ts"]);
  });

  it("detects typescript by full name", () => {
    expect(collectMdCodeFenceLangs("```typescript\nconst x = 1;\n```")).toEqual(["ts"]);
  });

  it("detects python by full name", () => {
    expect(collectMdCodeFenceLangs("```python\nprint('hi')\n```")).toEqual(["py"]);
  });

  it("detects bash alias", () => {
    expect(collectMdCodeFenceLangs("```bash\necho hi\n```")).toEqual(["sh"]);
  });

  it("detects shell alias", () => {
    expect(collectMdCodeFenceLangs("```shell\necho hi\n```")).toEqual(["sh"]);
  });

  it("detects rust by full name", () => {
    expect(collectMdCodeFenceLangs("```rust\nfn main() {}\n```")).toEqual(["rs"]);
  });

  it("detects yaml by yml alias", () => {
    expect(collectMdCodeFenceLangs("```yml\nkey: value\n```")).toEqual(["yaml"]);
  });

  it("deduplicates the same language appearing multiple times", () => {
    const md = "```ts\na\n```\n\n```typescript\nb\n```\n\n```ts\nc\n```";
    expect(collectMdCodeFenceLangs(md)).toEqual(["ts"]);
  });

  it("returns multiple distinct languages in order of first appearance", () => {
    const md = "```rs\na\n```\n\n```go\nb\n```\n\n```rs\nc\n```";
    expect(collectMdCodeFenceLangs(md)).toEqual(["rs", "go"]);
  });

  it("ignores unknown language hints", () => {
    expect(collectMdCodeFenceLangs("```unknownlang\ncode\n```")).toEqual([]);
  });

  it("ignores unknown hints mixed with known ones", () => {
    const md = "```ts\na\n```\n\n```unknownlang\nb\n```\n\n```py\nc\n```";
    expect(collectMdCodeFenceLangs(md)).toEqual(["ts", "py"]);
  });

  it("handles 4-backtick fences", () => {
    expect(collectMdCodeFenceLangs("````go\ncode\n````")).toEqual(["go"]);
  });

  it("handles multiple languages across a realistic markdown document", () => {
    const md = [
      "# My Doc",
      "",
      "Some prose.",
      "",
      "```typescript",
      "const x: number = 1;",
      "```",
      "",
      "More prose.",
      "",
      "```python",
      "x = 1",
      "```",
      "",
      "```bash",
      "echo hi",
      "```",
    ].join("\n");
    expect(collectMdCodeFenceLangs(md)).toEqual(["ts", "py", "sh"]);
  });
});

describe("normalizeFolderPath", () => {
  it("leaves a plain path untouched", () => {
    expect(normalizeFolderPath("work experience")).toBe("work experience");
    expect(normalizeFolderPath("projects/demos")).toBe("projects/demos");
  });

  it("strips leading and trailing slashes", () => {
    expect(normalizeFolderPath("/work experience/")).toBe("work experience");
    expect(normalizeFolderPath("//projects//")).toBe("projects");
  });
});

describe("collectFolderPaths", () => {
  const fixture = mkdtempSync(join(tmpdir(), "open-folder-"));

  mkdirSync(join(fixture, "2#work experience"), { recursive: true });
  mkdirSync(join(fixture, "3#projects", "co#demos"), { recursive: true });
  writeFileSync(join(fixture, "0#README.md"), "# hi");

  it("reports folder paths as the explorer shows them", () => {
    expect(collectFolderPaths(fixture).sort()).toEqual([
      "projects",
      "projects/demos",
      "work experience",
    ]);
  });

  it("returns nothing for a missing directory", () => {
    expect(collectFolderPaths(join(fixture, "nope"))).toEqual([]);
  });
});
