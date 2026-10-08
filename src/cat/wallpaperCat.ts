/**
 * The wallpaper cat, alive: Tom's terminal-pet cat, run by the same engine and
 * rig as the cats on his kitty windows (copied in by scripts/sync-cat.ts), in
 * the pose of the drawing the static wallpaper shows. It idles: blinks, flicks
 * an ear, tilts its head and breathes. Every so often it looks up at the bar's
 * launcher button, the way to open something.
 *
 * Everything here but `watchCat` and `drawCat` is pure, so the geometry and
 * the look are tested without a browser.
 */

import { CatEngine, type CatFrame, type CatPose, type CatState, type Rig } from "./catEngine";
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

// ── Looking at the launcher ────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Midway between the cat's eyes at rest, through `matrix` (see `catLayout`). */
export function catEyes(matrix: Matrix, rig: Rig = RIG): Point {
  const [lx, ly] = rig.parts["eye-l"].pivot;
  const [rx, ry] = rig.parts["eye-r"].pivot;
  const [a, b, c, d, e, f] = matrix;
  const x = (lx + rx) / 2;
  const y = (ly + ry) / 2;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/**
 * In seconds: how long the cat holds a look, the wait between looks, and how
 * long it takes to turn to the launcher and back again.
 */
export const LOOK_HOLD: readonly [number, number] = [1.4, 2.2];
export const LOOK_EVERY: readonly [number, number] = [10, 25];
export const LOOK_EASE = 0.7;

/**
 * How far into the look the cat is, 0..1, `t` seconds after it began: easing
 * in over `ease`, holding for `hold`, easing back out over `ease`. The
 * engine's own fade into a tracked face takes a quarter of a second, which is
 * right for a webcam and too quick for a cat glancing up at something, so the
 * look is eased here and the engine only ever follows it.
 */
export function lookAmount(t: number, hold: number, ease: number = LOOK_EASE): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t <= 0 || t >= 2 * ease + hold) return 0;
  if (t < ease) return smooth(t / ease);
  if (t <= ease + hold) return 1;
  return smooth((2 * ease + hold - t) / ease);
}

/** `pose` taken `amount` of the way from rest. */
export function scalePose(pose: CatPose, amount: number): CatPose {
  return Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, v * amount])) as unknown as CatPose;
}

/**
 * The face that looks from `from` (the cat's eyes) towards `to` (the
 * launcher), both in screen pixels. It goes through the engine's face
 * tracking — made for Kitty Cam, where a webcam steers the cat — so the head
 * turns and leans, the eyes follow, and the ears (the cat's eyebrows) perk up
 * a little, as interested cats' do. Only the direction counts, not the
 * distance: a launcher far away is no harder to look at.
 */
export function lookPose(from: Point, to: Point): CatPose {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const [ux, uy] = length > 0 ? [dx / length, dy / length] : [0, 0];
  return {
    yaw: 0.7 * ux,
    pitch: 0.7 * uy,
    roll: 0,
    x: 2 * ux,
    y: 2 * uy,
    gazeX: ux,
    gazeY: uy,
    brow: 0.5,
    blinkL: 0,
    blinkR: 0,
    smile: 0,
    open: 0,
    wide: 0,
    round: 0,
  };
}

// ── The one cat ────────────────────────────────────────────────────────────
//
// Every wallpaper layer that shows the cat draws the same frame: while a new
// theme is revealed over the old one, both layers are on screen at once, and
// two cats blinking at different moments would show the seam.

type Listener = (frame: CatFrame) => void;
/** Where the cat's eyes are and where the launcher is, on screen; null when either is not. */
export type LookTarget = () => { from: Point; to: Point } | null;

const listeners = new Map<Listener, LookTarget | undefined>();
let state: CatState | null = null;
let frame: CatFrame | null = null;
let raf = 0;
let last = 0;
/** The cat's own clock, in seconds; it stands still while nothing watches. */
let clock = 0;
let nextLook = 0;
/** The look under way: the full pose, when it began, and how long it holds. */
let looking: { pose: CatPose; start: number; hold: number } | null = null;

const between = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

/** The look target of the layer that mounted last: the one on top. */
function lookTarget(): ReturnType<LookTarget> {
  let target: LookTarget | undefined;
  for (const t of listeners.values()) if (t) target = t;
  return target?.() ?? null;
}

function look(dt: number) {
  clock += dt;
  if (!looking && clock >= nextLook) {
    const target = lookTarget();
    if (target) looking = { pose: lookPose(target.from, target.to), start: clock, hold: between(LOOK_HOLD) };
    else nextLook = clock + between(LOOK_EVERY);
  }
  if (!looking) return;
  const t = clock - looking.start;
  if (t >= 2 * LOOK_EASE + looking.hold) {
    // Back at rest already, so letting go of the face changes nothing on screen.
    CatEngine.track(state!, null);
    looking = null;
    nextLook = clock + between(LOOK_EVERY);
  } else {
    CatEngine.track(state!, scalePose(looking.pose, lookAmount(t, looking.hold)));
  }
}

function tick(now: number) {
  // Capped, so a tab coming back from the background resumes rather than jumps.
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  look(dt);
  frame = CatEngine.step(state!, dt);
  for (const listener of listeners.keys()) listener(frame);
  raf = requestAnimationFrame(tick);
}

/**
 * Calls `listener` with every frame of the cat, starting with the current
 * one, until the returned function is called. The cat only runs while
 * something is watching it. `target` says where the launcher is to look at.
 */
export function watchCat(listener: Listener, target?: LookTarget): () => void {
  if (!state) {
    state = CatEngine.create(RIG, "wallpaper");
    // Looking somewhere is not a face of its own: keep the drawing's smile and
    // its own blinks, and only turn the head and eyes.
    state.restMouth = true;
    state.trackBlink = false;
    frame = CatEngine.step(state, 0);
    nextLook = between(LOOK_EVERY) / 2;
  }
  listeners.set(listener, target);
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
