import { describe, it, expect } from "vitest";
import { collectMdCodeFenceLangs } from "./FilesConverterService";

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
