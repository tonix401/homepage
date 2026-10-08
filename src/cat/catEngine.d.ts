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
};
