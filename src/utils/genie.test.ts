import { describe, it, expect } from "vitest";
import { BANDS, genieKeyframes, genieOutline, type Rect } from "./genie";

const window: Rect = { left: 100, top: 60, width: 800, height: 600 };
const launcher: Rect = { left: 300, top: 4, width: 160, height: 28 };

/** The top and bottom rows' left and right ends. */
function edges(from: Rect, to: Rect, t: number) {
  const rows = genieOutline(from, to, t);
  const [first, last] = [rows[0], rows[rows.length - 1]];
  return { top: [first.left, first.right], bottom: [last.left, last.right] };
}

/** Where a band's matrix3d takes a point of the band, in the box's own pixels. */
function project(transform: string, offset: number, x: number, y: number) {
  const m = /matrix3d\((.+)\)/.exec(transform)![1].split(", ").map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return { x: (m[0] * x + m[4] * y + m[12]) / w, y: offset + (m[1] * x + m[5] * y + m[13]) / w };
}

describe("genieOutline", () => {
  it("starts as the whole window, untouched", () => {
    const rows = genieOutline(window, launcher, 0);
    expect(rows).toHaveLength(BANDS + 1);
    expect(edges(window, launcher, 0)).toEqual({ top: [0, 800], bottom: [0, 800] });
    expect(rows[0].y).toBe(0);
    expect(rows[BANDS].y).toBe(600);
  });

  it("starts pinching on the very first frame after the start", () => {
    const { top } = edges(window, launcher, 1 / 120);
    expect(top[0]).toBeGreaterThan(10);
    expect(top[1]).toBeLessThan(790);
  });

  it("pinches the top edge over the launcher before the bottom follows", () => {
    const { top, bottom } = edges(window, launcher, 0.45);
    // The launcher is x 300 to 460, the window's local 200 to 360. The top
    // row has not quite risen to the mouth yet, so it is not quite that narrow.
    expect(Math.abs(top[0] - 200)).toBeLessThan(2);
    expect(Math.abs(top[1] - 360)).toBeLessThan(2);
    expect(bottom[1] - bottom[0]).toBeGreaterThan(160);
  });

  it("ends exactly on the launcher", () => {
    const rows = genieOutline(window, launcher, 1);
    for (const row of rows) {
      expect(row.left).toBeCloseTo(200);
      expect(row.right).toBeCloseTo(360);
    }
    // The box's own left edge is at 100, so local 200 is the launcher's 300.
    expect(rows[0].y).toBeCloseTo(4 - 60);
    expect(rows[BANDS].y).toBeCloseTo(4 + 28 - 60);
  });

  it("bends a window beside the launcher straight into it, rather than floating it over", () => {
    const right: Rect = { left: 1000, top: 60, width: 800, height: 600 };
    // Early on, the top edge is already over the launcher (local -700 to
    // -540) while the bottom has barely moved from where it stood.
    const { top, bottom } = edges(right, launcher, 0.3);
    expect(top[0]).toBeLessThan(-600);
    expect(top[1]).toBeLessThan(-400);
    expect(bottom[0]).toBeGreaterThan(-20);
    expect(bottom[1]).toBeGreaterThan(780);
    // And it ends there.
    const [row] = genieOutline(right, launcher, 1);
    expect(row.left).toBeCloseTo(300 - 1000);
    expect(row.right).toBeCloseTo(460 - 1000);
  });

  it("narrows every row as it climbs, so each is at most as wide as the one below", () => {
    for (const t of [0.1, 0.3, 0.5, 0.7]) {
      const widths = genieOutline(window, launcher, t).map((row) => row.right - row.left);
      widths.slice(1).forEach((width, j) => expect(width).toBeGreaterThanOrEqual(widths[j] - 1e-9));
    }
  });
});

describe("genieKeyframes", () => {
  it("cuts the window into bands that tile it", () => {
    const { bands } = genieKeyframes(window, launcher);
    expect(bands).toHaveLength(BANDS);
    bands.forEach((band, j) => expect(band.top).toBeCloseTo((j * 600) / BANDS));
    const last = bands[bands.length - 1];
    expect(last.top + last.height).toBeCloseTo(600);
  });

  it("maps every band's corners onto the outline, so the bands meet and nothing is cut", () => {
    const { bands } = genieKeyframes(window, launcher);
    for (const i of [0, 30, 60, 120]) {
      const rows = genieOutline(window, launcher, i / 120);
      bands.forEach((band, j) => {
        const { transform } = band.keyframes[i];
        const corners = [
          [project(String(transform), band.top, 0, 0), rows[j].left, rows[j].y],
          [project(String(transform), band.top, 800, 0), rows[j].right, rows[j].y],
          [project(String(transform), band.top, 0, band.height), rows[j + 1].left, rows[j + 1].y],
          [project(String(transform), band.top, 800, band.height), rows[j + 1].right, rows[j + 1].y],
        ] as const;
        for (const [p, x, y] of corners) {
          expect(p.x).toBeCloseTo(x, 1);
          expect(p.y).toBeCloseTo(y, 1);
        }
      });
    }
  });

  it("holds each band's frames rather than blending them, which would tear the seams", () => {
    const { bands } = genieKeyframes(window, launcher);
    for (const band of bands) expect(band.keyframes.every((k) => k.easing === "step-end")).toBe(true);
  });

  it("starts as the identity and fades out as it lands", () => {
    const { bands, fade } = genieKeyframes(window, launcher);
    const start = project(String(bands[3].keyframes[0].transform), bands[3].top, 123, 45);
    expect(start.x).toBeCloseTo(123);
    expect(start.y).toBeCloseTo(bands[3].top + 45);
    expect(fade[0].opacity).toBe(1);
    expect(fade[fade.length - 1].opacity).toBe(0);
  });
});
