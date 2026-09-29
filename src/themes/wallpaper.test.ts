import { describe, it, expect } from "vitest";
import { THEME_IDS, themeTokens } from "./theme";
import { SUBJECT_IDS } from "./subjects";
import { subjectIconSvg, subjectIconUrl, wallpaperSvg, wallpaperUrl } from "./wallpaper";

const DRAWINGS: readonly string[] = ["cat"];

describe("wallpaperSvg", () => {
  it("paints every subject in every theme's colours, with nothing left over", () => {
    for (const theme of THEME_IDS) {
      for (const subject of SUBJECT_IDS) {
        const svg = wallpaperSvg(theme, subject);
        const { wallLogo, primary, wallInner, wallOuter } = themeTokens(theme);
        // Logos are filled with the logo colour; drawings are lines in primary.
        expect(svg).toContain(DRAWINGS.includes(subject) ? `color="${primary}"` : `fill="${wallLogo}"`);
        expect(svg).toContain(`stop-color="${wallInner}"`);
        expect(svg).toContain(`stop-color="${wallOuter}"`);
        expect(svg).not.toContain("undefined");
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("${");
      }
    }
  });

  it("draws each subject as a glow under a crisp copy, with one glow filter", () => {
    for (const subject of SUBJECT_IDS) {
      const svg = wallpaperSvg("blue", subject);
      expect(svg.match(/<filter /g)).toHaveLength(1);
      expect(svg.match(/filter="url\(#glow\)"/g)).toHaveLength(1);
    }
    for (const subject of ["tux", "hyprland"] as const) {
      expect(wallpaperSvg("blue", subject).match(/<path /g)).toHaveLength(2);
    }
  });

  it("draws the cat twice, element for element, and fills only its eyes", () => {
    const cat = wallpaperSvg("blue", "cat");
    expect(cat.match(/<(path|ellipse) /g)).toHaveLength(36);
    expect(cat.match(/fill="currentColor"/g)).toHaveLength(4);
  });

  it("gives each subject a different picture", () => {
    const bodies = SUBJECT_IDS.map((s) => wallpaperSvg("blue", s).split("</defs>")[1]);
    expect(new Set(bodies).size).toBe(SUBJECT_IDS.length);
  });

  it("no longer carries the original blue in any other theme", () => {
    expect(wallpaperSvg("rose", "arch")).not.toContain("#0027a3");
  });
});

describe("wallpaperUrl", () => {
  it("is an SVG data URL, and the same string on every call", () => {
    const url = wallpaperUrl("teal", "tux");
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(wallpaperUrl("teal", "tux")).toBe(url);
    expect(decodeURIComponent(url.slice("data:image/svg+xml,".length))).toBe(
      wallpaperSvg("teal", "tux"),
    );
  });

  it("differs by theme and by subject", () => {
    expect(wallpaperUrl("teal", "tux")).not.toBe(wallpaperUrl("rose", "tux"));
    expect(wallpaperUrl("teal", "tux")).not.toBe(wallpaperUrl("teal", "hyprland"));
  });
});

describe("subjectIconSvg", () => {
  it("draws every subject in the theme's primary, with no background", () => {
    for (const theme of THEME_IDS) {
      const { primary, wallLogo, wallInner } = themeTokens(theme);
      for (const subject of SUBJECT_IDS) {
        const svg = subjectIconSvg(theme, subject);
        expect(svg).toContain(primary);
        expect(svg).not.toContain(wallLogo);
        expect(svg).not.toContain(wallInner);
      }
    }
  });

  it("crops to the box every subject is fitted into, so all four share a shape", () => {
    const boxes = SUBJECT_IDS.map((subject) =>
      /viewBox="([^"]+)"/.exec(subjectIconSvg("blue", subject))![1],
    );
    expect(new Set(boxes).size).toBe(1);
  });

  it("builds each icon's URL once", () => {
    expect(subjectIconUrl("teal", "tux")).toBe(subjectIconUrl("teal", "tux"));
  });
});
