import { describe, it, expect } from "vitest";
import { resolveSearchBarText } from "./searchBarText";
import { KNOWN_PLACEHOLDERS } from "./pluginHelpers";

// ── $open_file ──────────────────────────────────────────────────────────────

describe("$open_file placeholder", () => {
  it("replaces $open_file with the file name", () => {
    expect(resolveSearchBarText("Open: $open_file", "readme.md", "readme.md")).toBe("Open: readme.md");
  });

  it("replaces all occurrences of $open_file", () => {
    expect(resolveSearchBarText("$open_file — $open_file", "a.ts", "a.ts")).toBe("a.ts — a.ts");
  });

  it("trims the result after $open_file substitution", () => {
    expect(resolveSearchBarText("$open_file ", "a.ts", "a.ts")).toBe("a.ts");
  });

  it("replaces $open_file with empty string when no file is selected", () => {
    expect(resolveSearchBarText("Open: $open_file", undefined, undefined)).toBe("Open:");
  });
});

// ── $current_sub_folder ─────────────────────────────────────────────────────

describe("$current_sub_folder placeholder", () => {
  it("resolves to the parent directory of a nested file", () => {
    expect(resolveSearchBarText("[$current_sub_folder]", "readme.md", "docs/readme.md")).toBe("[docs]");
  });

  it("resolves to the full parent path for deeply nested files", () => {
    expect(resolveSearchBarText("$current_sub_folder", "file.ts", "a/b/c/file.ts")).toBe("a/b/c");
  });

  it("resolves to an empty string for a root-level file", () => {
    expect(resolveSearchBarText("[$current_sub_folder]", "file.ts", "file.ts")).toBe("[]");
  });

  it("resolves to an empty string when no file is selected", () => {
    expect(resolveSearchBarText("Folder: $current_sub_folder", undefined, undefined)).toBe("Folder: ");
  });

  it("replaces all occurrences of $current_sub_folder", () => {
    expect(resolveSearchBarText("$current_sub_folder/$current_sub_folder", "f.ts", "x/f.ts")).toBe("x/x");
  });
});

// ── both placeholders together ───────────────────────────────────────────────

describe("$open_file and $current_sub_folder combined", () => {
  it("resolves both placeholders in one template", () => {
    expect(resolveSearchBarText("$current_sub_folder/$open_file", "f.ts", "docs/f.ts")).toBe("docs/f.ts");
  });

  it("handles root-level file with both placeholders", () => {
    expect(resolveSearchBarText("[$current_sub_folder] $open_file", "f.ts", "f.ts")).toBe("[] f.ts");
  });
});

// ── all known placeholders — no raw token visible when a file is open ────────

describe("known placeholders — resolved or replaced when file is open", () => {
  it.each(KNOWN_PLACEHOLDERS)(
    "no raw %s visible when a file is selected",
    (placeholder) => {
      const result = resolveSearchBarText(placeholder, "readme.md", "docs/readme.md");
      expect(result).not.toContain(placeholder);
    },
  );
});

// ── no placeholder — fallback behaviour ─────────────────────────────────────

describe("fallback when no placeholder is used", () => {
  it("returns the file name when a file is selected", () => {
    expect(resolveSearchBarText("Search files (⌘P)", "readme.md", "readme.md")).toBe("readme.md");
  });

  it("returns the template text when no file is selected", () => {
    expect(resolveSearchBarText("Search files (⌘P)", undefined, undefined)).toBe("Search files (⌘P)");
  });
});
