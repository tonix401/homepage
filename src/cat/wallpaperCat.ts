/**
 * The wallpaper cat, alive: Tom's terminal-pet cat, run by the same engine and
 * rig as the cats on his kitty windows (copied in by scripts/sync-cat.ts), in
 * the pose of the drawing the static wallpaper shows. It idles: blinks, flicks
 * an ear, tilts its head and breathes.
 *
 * Everything here but `watchCat` and `drawCat` is pure, so the geometry is
 * tested without a browser.
 */

import { CatEngine, type CatFrame, type CatState, type Rig } from "./catEngine";
import rigJson from "./rig.json";
import { catPlacement } from "../themes/subjects";
import { WALLPAPER_SIZE } from "../themes/wallpaper";

/**
 * The rig with one expression of our own: the pose of the original drawing
 * (`exports.cat` in ~/.config/cat/poses.json), which is what the wallpaper has
 * always shown. Round eyes and a smile, where the kitty cats' `neutral` has
 * sparkly eyes and an ω mouth.
 */
export const RIG: Rig = {
  ...(rigJson as unknown as Rig),
  expressions: {
    ...(rigJson as unknown as Rig).expressions,
    wallpaper: {
      variants: { body: "slim", "eye-l": "open", "eye-r": "open", mouth: "smile" },
      keys: {},
      transforms: {},
      show: [],
      motion: null,
      breath: 4,
      sing: false,
    },
  },
};

/** An affine map [a, b, c, d, e, f] — x' = a x + c y + e, y' = b x + d y + f — as canvas takes it. */
export type Matrix = [number, number, number, number, number, number];

/**
 * How `object-fit: cover` puts the wallpaper into a `width`×`height` box: how
 * many pixels one wallpaper unit is, and where the wallpaper's origin lands.
 */
export function coverFit(width: number, height: number): { scale: number; x: number; y: number } {
  const scale = Math.max(width / WALLPAPER_SIZE.width, height / WALLPAPER_SIZE.height);
  return {
    scale,
    x: (width - WALLPAPER_SIZE.width * scale) / 2,
    y: (height - WALLPAPER_SIZE.height * scale) / 2,
  };
}

/**
 * Where to draw the cat in a `width`×`height` wallpaper: the map from rig
 * coordinates to its pixels, the box (in those pixels) that holds every pose
 * and the glow round it, and the glow's blur in pixels.
 */
export function catLayout(width: number, height: number, rig: Rig = RIG) {
  const cover = coverFit(width, height);
  const place = catPlacement();
  const k = cover.scale * place.scale;
  const matrix: Matrix = [
    k,
    0,
    0,
    k,
    cover.x + cover.scale * (place.x + place.scale * place.translate[0]),
    cover.y + cover.scale * (place.y + place.scale * place.translate[1]),
  ];
  const blur = place.glow * cover.scale;
  // Three standard deviations is where a Gaussian blur has all but faded out.
  const margin = Math.ceil(3 * blur);
  const [cx, cy, cw, ch] = rig.canvas;
  const left = Math.floor(matrix[4] + k * cx) - margin;
  const top = Math.floor(matrix[5] + k * cy) - margin;
  const box = {
    left,
    top,
    width: Math.ceil(matrix[4] + k * (cx + cw)) + margin - left,
    height: Math.ceil(matrix[5] + k * (cy + ch)) + margin - top,
  };
  return { matrix, box, blur };
}

// ── The one cat ────────────────────────────────────────────────────────────
//
// Every wallpaper layer that shows the cat draws the same frame: while a new
// theme is revealed over the old one, both layers are on screen at once, and
// two cats blinking at different moments would show the seam.

type Listener = (frame: CatFrame) => void;

const listeners = new Set<Listener>();
let state: CatState | null = null;
let frame: CatFrame | null = null;
let raf = 0;
let last = 0;

function tick(now: number) {
  // Capped, so a tab coming back from the background resumes rather than jumps.
  frame = CatEngine.step(state!, Math.min((now - last) / 1000, 0.1));
  last = now;
  for (const listener of listeners) listener(frame);
  raf = requestAnimationFrame(tick);
}

/**
 * Calls `listener` with every frame of the cat, starting with the current
 * one, until the returned function is called. The cat only runs while
 * something is watching it.
 */
export function watchCat(listener: Listener): () => void {
  if (!state) {
    state = CatEngine.create(RIG, "wallpaper");
    frame = CatEngine.step(state, 0);
  }
  listeners.add(listener);
  listener(frame!);
  if (listeners.size === 1) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) cancelAnimationFrame(raf);
  };
}

// ── Drawing ────────────────────────────────────────────────────────────────

const paths = new Map<string, Path2D>();

/** A Path2D per path string, kept: the idle loop reuses the same few shapes. */
function path2d(d: string): Path2D {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    if (paths.size < 4000) paths.set(d, p);
  }
  return p;
}

/**
 * Draws one frame of the cat in `color`, through `matrix` (rig coordinates to
 * the canvas's pixels), as kitty-cam.html in ~/.config/cat does.
 */
export function drawCat(
  ctx: CanvasRenderingContext2D,
  f: CatFrame,
  color: string,
  matrix: Matrix,
  rig: Rig = RIG,
): void {
  const [a, , , d, e, g] = matrix;
  ctx.lineCap = rig.stroke.cap;
  ctx.miterLimit = 4; // as SVG's, so the joins match the other renderers
  ctx.lineWidth = rig.stroke.width;
  ctx.strokeStyle = ctx.fillStyle = color;
  for (const name of rig.order) {
    const part = rig.parts[name];
    const po = f.partOpacity[name];
    if (po <= 0.01) continue;
    const m = f.worlds[name];
    ctx.setTransform(a * m[0], d * m[1], a * m[2], d * m[3], a * m[4] + e, d * m[5] + g);
    for (const v in part.variants) {
      const vo = f.variantOpacity[`${name}/${v}`];
      if (!(vo > 0.01)) continue;
      const moved = f.paths[name]?.[v];
      part.variants[v].forEach((s, i) => {
        const so = f.shapeOpacity[`${name}/${i}`];
        const alpha = po * vo * (so ?? 1);
        if (alpha <= 0.01) return;
        const p = path2d(moved ? moved[i] : s.d);
        if (s.fill) {
          ctx.globalAlpha = alpha * s.alpha;
          ctx.fill(p, s.evenodd ? "evenodd" : "nonzero");
        }
        if (s.stroke) {
          ctx.globalAlpha = alpha;
          ctx.lineJoin = s.join;
          ctx.stroke(p);
        }
      });
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
