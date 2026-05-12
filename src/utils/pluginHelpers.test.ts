import { describe, it, expect } from "vitest";
import {
  KNOWN_PLACEHOLDERS,
  resolveConfigSearchBarText,
  detectUnknownPlaceholders,
  transformHtml,
} from "./pluginHelpers";

// ── resolveConfigSearchBarText ──────────────────────────────────────────────

describe("resolveConfigSearchBarText", () => {
  it("replaces $root_folder_name", () => {
    expect(resolveConfigSearchBarText("$root_folder_name files", "SRC", undefined)).toBe("SRC files");
  });

  it("replaces all occurrences of $root_folder_name", () => {
    expect(resolveConfigSearchBarText("$root_folder_name / $root_folder_name", "A", undefined)).toBe("A / A");
  });

  it("replaces $website_title", () => {
    expect(resolveConfigSearchBarText("$website_title", "ROOT", "My Site")).toBe("My Site");
  });

  it("replaces $website_title with empty string when websiteTitle is undefined", () => {
    expect(resolveConfigSearchBarText("Title: $website_title", "ROOT", undefined)).toBe("Title: ");
  });

  it("replaces both placeholders in one pass", () => {
    expect(resolveConfigSearchBarText("$root_folder_name — $website_title", "SRC", "My Site")).toBe("SRC — My Site");
  });

  it("leaves text unchanged when no placeholders are present", () => {
    expect(resolveConfigSearchBarText("Search files (⌘P)", "ROOT", "My Site")).toBe("Search files (⌘P)");
  });

  it("handles empty searchBarText", () => {
    expect(resolveConfigSearchBarText("", "ROOT", "My Site")).toBe("");
  });
});

// ── detectUnknownPlaceholders ───────────────────────────────────────────────

describe("detectUnknownPlaceholders", () => {
  it("returns empty array when no placeholders are present", () => {
    expect(detectUnknownPlaceholders("Search files")).toEqual([]);
  });

  it("returns empty array for all known placeholders", () => {
    const all = KNOWN_PLACEHOLDERS.join(" ");
    expect(detectUnknownPlaceholders(all)).toEqual([]);
  });

  it("detects a single unknown placeholder", () => {
    expect(detectUnknownPlaceholders("Hello $unknown")).toEqual(["$unknown"]);
  });

  it("detects multiple unknown placeholders", () => {
    expect(detectUnknownPlaceholders("$foo and $bar")).toEqual(["$foo", "$bar"]);
  });

  it("ignores known placeholders mixed with unknown ones", () => {
    expect(detectUnknownPlaceholders("$open_file $typo")).toEqual(["$typo"]);
  });

  it.each(KNOWN_PLACEHOLDERS)("does not flag %s as unknown", (placeholder) => {
    expect(detectUnknownPlaceholders(placeholder)).toEqual([]);
  });
});

// ── transformHtml ───────────────────────────────────────────────────────────

const BASE_HTML = `<!DOCTYPE html><html><head><title>Old</title><link rel="icon" href="/old.svg" /></head></html>`;

describe("transformHtml", () => {
  it("replaces the <title> tag when websiteTitle is provided", () => {
    const result = transformHtml(BASE_HTML, "New Title", undefined);
    expect(result).toContain("<title>New Title</title>");
    expect(result).not.toContain("<title>Old</title>");
  });

  it("replaces the favicon href when faviconPath is provided", () => {
    const result = transformHtml(BASE_HTML, undefined, "/new.svg");
    expect(result).toContain(`href="/new.svg"`);
    expect(result).not.toContain(`href="/old.svg"`);
  });

  it("replaces both title and favicon when both are provided", () => {
    const result = transformHtml(BASE_HTML, "My App", "/favicon.ico");
    expect(result).toContain("<title>My App</title>");
    expect(result).toContain(`href="/favicon.ico"`);
  });

  it("leaves HTML unchanged when both options are undefined", () => {
    expect(transformHtml(BASE_HTML, undefined, undefined)).toBe(BASE_HTML);
  });

  it("does not modify the title when websiteTitle is undefined", () => {
    const result = transformHtml(BASE_HTML, undefined, "/new.svg");
    expect(result).toContain("<title>Old</title>");
  });

  it("does not modify the favicon when faviconPath is undefined", () => {
    const result = transformHtml(BASE_HTML, "New Title", undefined);
    expect(result).toContain(`href="/old.svg"`);
  });

  it("works with an external favicon URL", () => {
    const result = transformHtml(BASE_HTML, undefined, "https://example.com/icon.png");
    expect(result).toContain(`href="https://example.com/icon.png"`);
  });

  it("works with an empty title string", () => {
    const result = transformHtml(BASE_HTML, "", undefined);
    expect(result).toContain("<title></title>");
  });
});
