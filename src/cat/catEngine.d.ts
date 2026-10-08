/**
 * Types for `catEngine.js`, the cat's animation engine copied from
 * ~/.config/cat (see scripts/sync-cat.ts). Only what the wallpaper uses is
 * typed; the engine's own header comment documents the rest.
 */

/** One drawn shape of a part's variant, as `build.py` writes it into rig.json. */
export interface RigShape {
  /** The shape as an SVG path, in rig coordinates. */
  d: string;
  stroke: boolean;
  fill: boolean;
  /** Fill opacity (the blush is 0.35). */
  alpha: number;
  join: CanvasLineJoin;
  evenodd: boolean;
}

export interface RigPart {
  /** The point the part turns and scales about, in rig coordinates. */
  pivot: [number, number];
  variants: Record<string, RigShape[]>;
}

export interface RigExpression {
  variants: Record<string, string>;
  keys: Record<string, number>;
  transforms: Record<string, Record<string, number>>;
  show: string[];
  motion: string | null;
  breath: number;
  sing: boolean;
}

export interface Rig {
  /** The exports' frame: where the drawings this rig was made from sit. */
  viewBox: [number, number, number, number];
  /** The translate the exports apply to part coordinates. */
  origin: [number, number];
  /** Part coordinates covering every variant and key, plus a margin. */
  canvas: [number, number, number, number];
  stroke: { width: number; cap: CanvasLineCap };
  /** Paint order; parents before their children. */
  order: string[];
  parts: Record<string, RigPart>;
  expressions: Record<string, RigExpression>;
}

/** The engine's state for one cat. Opaque apart from what is listed. */
export interface CatState {
  /** Blinks, ear twitches, head tilts and breathing; on by default. */
  idle: boolean;
  /** While a pose is followed: keep the expression's own mouth unless the pose's lips move. */
  restMouth: boolean;
  /** While a pose is followed: let the pose blink (true), or keep the idle blinks (false). */
  trackBlink: boolean;
}

/**
 * A face for the cat to follow — made for Kitty Cam's face tracking, and used
 * here to look somewhere. Give every field: the engine reads them all, and a
 * missing one turns into NaN in the cat's matrices.
 */
export interface CatPose {
  /** Head turn, -1..1: positive turns the face to the right of the screen. */
  yaw: number;
  /** Head nod, -1..1: positive looks down. */
  pitch: number;
  /** Head roll in degrees, clockwise. */
  roll: number;
  /** How far the head leans, in rig units. */
  x: number;
  y: number;
  /** Where the eyes look, -1..1 each way. */
  gazeX: number;
  gazeY: number;
  /** -1 frowning .. 1 raised; the ears are the cat's eyebrows (raised perks them). */
  brow: number;
  blinkL: number;
  blinkR: number;
  smile: number;
  open: number;
  wide: number;
  round: number;
}

export interface CatFrame {
  /** Each part's world matrix [a, b, c, d, e, f] in rig coordinates. */
  worlds: Record<string, [number, number, number, number, number, number]>;
  /** Replacements for a shape's `d`, per part and variant, where keys or skinning moved it. */
  paths: Record<string, Record<string, string[]> | undefined>;
  /** "part/variant" → opacity. */
  variantOpacity: Record<string, number>;
  partOpacity: Record<string, number>;
  /** "part/shape index" → opacity, where a shape fades on its own (the z's). */
  shapeOpacity: Record<string, number | undefined>;
}

export declare const CatEngine: {
  create(rig: Rig, expression: string): CatState;
  step(state: CatState, dt: number): CatFrame;
  setExpression(state: CatState, expression: string): void;
  /** Follow `pose` (eased in over ~0.25 s), or let go of it with `null`. */
  track(state: CatState, pose: CatPose | null): void;
};
