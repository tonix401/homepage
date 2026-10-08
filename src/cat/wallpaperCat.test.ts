import { describe, it, expect } from "vitest";
import { LOOK_EASE, LOOK_EVERY, LOOK_HOLD, RIG, catEyes, catLayout, coverFit, lookAmount, lookPose, scalePose } from "./wallpaperCat";
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

describe("lookPose", () => {
  const cat = { x: 960, y: 540 };

  it("turns the head and eyes up and left towards a launcher at the top left", () => {
    const pose = lookPose(cat, { x: 400, y: 20 });
    expect(pose.yaw).toBeLessThan(0);
    expect(pose.pitch).toBeLessThan(0);
    expect(pose.gazeX).toBeLessThan(0);
    expect(pose.gazeY).toBeLessThan(0);
    expect(pose.x).toBeLessThan(0);
    expect(pose.y).toBeLessThan(0);
  });

  it("perks the ears and leaves the mouth and eyelids to the drawing", () => {
    const pose = lookPose(cat, { x: 400, y: 20 });
    expect(pose.brow).toBeGreaterThan(0);
    for (const key of ["open", "wide", "round", "smile", "blinkL", "blinkR"] as const) expect(pose[key]).toBe(0);
  });

  it("depends on the direction alone, and stays inside the engine's ranges", () => {
    const near = lookPose(cat, { x: 950, y: 530 });
    const far = lookPose(cat, { x: -40, y: -460 });
    for (const key of Object.keys(near) as (keyof typeof near)[]) expect(near[key]).toBeCloseTo(far[key]);
    for (const v of [near.yaw, near.pitch, near.gazeX, near.gazeY]) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it("gives every field the engine reads, and no NaN when looking at itself", () => {
    const pose = lookPose(cat, cat);
    expect(Object.keys(pose).sort()).toEqual(
      ["blinkL", "blinkR", "brow", "gazeX", "gazeY", "open", "pitch", "roll", "round", "smile", "wide", "x", "y", "yaw"],
    );
    for (const v of Object.values(pose)) expect(Number.isFinite(v)).toBe(true);
  });

  it("looks for a moment, every so often", () => {
    expect(LOOK_HOLD[0]).toBeGreaterThan(0.5);
    expect(LOOK_HOLD[1]).toBeLessThan(LOOK_EVERY[0]);
  });
});

describe("catEyes", () => {
  it("sits in the cat's head, between its eyes", () => {
    const { matrix } = catLayout(1920, 1080);
    const eyes = catEyes(matrix);
    const [cx, cy, cw, ch] = RIG.canvas;
    const k = matrix[0];
    expect(eyes.x).toBeGreaterThan(matrix[4] + k * cx);
    expect(eyes.x).toBeLessThan(matrix[4] + k * (cx + cw));
    // In the top half of the drawing: the head, not the feet.
    expect(eyes.y).toBeLessThan(matrix[5] + k * (cy + ch / 2));
  });
});

describe("lookAmount", () => {
  const hold = 2;

  it("eases in, holds, and eases back out to rest", () => {
    expect(lookAmount(0, hold)).toBe(0);
    expect(lookAmount(LOOK_EASE / 2, hold)).toBeCloseTo(0.5);
    expect(lookAmount(LOOK_EASE, hold)).toBe(1);
    expect(lookAmount(LOOK_EASE + hold, hold)).toBe(1);
    expect(lookAmount(LOOK_EASE * 1.5 + hold, hold)).toBeCloseTo(0.5);
    expect(lookAmount(2 * LOOK_EASE + hold, hold)).toBe(0);
  });

  it("never jumps: neighbouring moments are close", () => {
    let prev = lookAmount(0, hold);
    for (let t = 0.01; t < 2 * LOOK_EASE + hold + 0.5; t += 0.01) {
      const v = lookAmount(t, hold);
      expect(Math.abs(v - prev)).toBeLessThan(0.03);
      prev = v;
    }
  });

  it("turns more slowly than the engine's quarter-second fade", () => {
    expect(LOOK_EASE).toBeGreaterThan(0.25);
  });
});

describe("scalePose", () => {
  it("scales every field, and is the rest pose at 0", () => {
    const pose = lookPose({ x: 960, y: 540 }, { x: 400, y: 20 });
    const half = scalePose(pose, 0.5);
    for (const key of Object.keys(pose) as (keyof typeof pose)[]) expect(half[key]).toBeCloseTo(pose[key] / 2);
    // -0 for the negative fields, which the engine treats as 0.
    for (const v of Object.values(scalePose(pose, 0))) expect(v === 0).toBe(true);
  });
});
