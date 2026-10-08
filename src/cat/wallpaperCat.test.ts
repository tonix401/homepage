import { describe, it, expect } from "vitest";
import { RIG, catLayout, coverFit } from "./wallpaperCat";
import { WALLPAPER_SIZE, wallpaperSvg } from "../themes/wallpaper";

describe("coverFit", () => {
  it("fills a wide screen edge to edge and crops top and bottom", () => {
    const { scale, x, y } = coverFit(3440, 1440);
    expect(scale).toBeCloseTo(3440 / WALLPAPER_SIZE.width);
    expect(x).toBeCloseTo(0);
    expect(y).toBeLessThan(0);
    expect(y).toBeCloseTo((1440 - WALLPAPER_SIZE.height * scale) / 2);
  });

  it("fills a tall screen top to bottom and crops the sides", () => {
    const { scale, x, y } = coverFit(400, 800);
    expect(scale).toBeCloseTo(800 / WALLPAPER_SIZE.height);
    expect(y).toBeCloseTo(0);
    expect(x).toBeLessThan(0);
  });
});

describe("catLayout", () => {
  it("puts the cat exactly where the still wallpaper draws it", () => {
    // The still cat's group: translate(x y) scale(s) translate(tx ty).
    const svg = wallpaperSvg("blue", "cat");
    const m = /<g transform="translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\) translate\(([-\d.e]+) ([-\d.e]+)\)"/.exec(svg);
    expect(m).not.toBeNull();
    const [x, y, s, tx, ty] = m!.slice(1).map(Number);
    // At the wallpaper's own size one unit is one pixel, so the two must agree.
    const { matrix } = catLayout(WALLPAPER_SIZE.width, WALLPAPER_SIZE.height);
    expect(matrix[0]).toBeCloseTo(s);
    expect(matrix[3]).toBeCloseTo(s);
    expect(matrix[1]).toBe(0);
    expect(matrix[2]).toBe(0);
    expect(matrix[4]).toBeCloseTo(x + s * tx);
    expect(matrix[5]).toBeCloseTo(y + s * ty);
  });

  it("gives the canvas room for every pose and the glow round it", () => {
    const { matrix, box, blur } = catLayout(1920, 1080);
    const [cx, cy, cw, ch] = RIG.canvas;
    const k = matrix[0];
    expect(box.left).toBeLessThanOrEqual(matrix[4] + k * cx - 3 * blur);
    expect(box.top).toBeLessThanOrEqual(matrix[5] + k * cy - 3 * blur);
    expect(box.left + box.width).toBeGreaterThanOrEqual(matrix[4] + k * (cx + cw) + 3 * blur);
    expect(box.top + box.height).toBeGreaterThanOrEqual(matrix[5] + k * (cy + ch) + 3 * blur);
    for (const n of [box.left, box.top, box.width, box.height]) expect(Number.isInteger(n)).toBe(true);
  });

  it("blurs the glow as far as the still wallpaper does", () => {
    const { blur } = catLayout(WALLPAPER_SIZE.width * 2, WALLPAPER_SIZE.height * 2);
    expect(blur).toBeCloseTo(3.5 * 2);
  });
});

describe("RIG", () => {
  it("has the wallpaper pose, made only of variants the rig draws", () => {
    const pose = RIG.expressions.wallpaper;
    expect(pose).toBeDefined();
    for (const [part, variant] of Object.entries(pose.variants)) {
      expect(RIG.parts[part]?.variants[variant], `${part}/${variant}`).toBeDefined();
    }
  });

  it("keeps the rig's own expressions", () => {
    expect(RIG.expressions.neutral).toBeDefined();
  });
});
