/**
 * imv, as data: which images a window steps through, how big one is drawn,
 * and the overlay line that describes it.
 *
 * Kept free of React and of the virtual modules, like `fileManager.ts`: every
 * function takes the tree it should read, so the tests can hand it one.
 */

import { type FileNode, type TreeNode } from "../services/types";
import { listDir, parentOf } from "./fileManager";

/** imv's `scaling_mode`, in the order `s` cycles through them; `full` is its default. */
export const SCALING_MODES = ["none", "shrink", "full", "crop"] as const;
export type ScalingMode = (typeof SCALING_MODES)[number];

/** What imv's overlay and title call each mode. */
const SCALING_LABELS: Record<ScalingMode, string> = {
  none: "actual size",
  shrink: "shrink to fit",
  full: "scale to fit",
  crop: "crop",
};

/**
 * The images imv steps through when opened on `path`: every image in its
 * folder, in tree order — what `imv` is handed by a file manager's "open with".
 */
export function imagesBeside(tree: TreeNode[], path: string): FileNode[] {
  return (listDir(tree, parentOf(path)) ?? [])
    .map((e) => e.node)
    .filter((n): n is FileNode => n.kind === "file" && n.type === "image");
}

/** The scale that `mode` draws an image of `image` pixels at in a window of `view` pixels. */
export function fitScale(
  mode: ScalingMode,
  image: { width: number; height: number },
  view: { width: number; height: number },
): number {
  if (mode === "none" || !image.width || !image.height) return 1;
  const across = view.width / image.width;
  const down = view.height / image.height;
  if (mode === "crop") return Math.max(across, down);
  const fit = Math.min(across, down);
  return mode === "shrink" ? Math.min(1, fit) : fit;
}

/**
 * imv's default overlay text: `[1/3] [800x600] [100%] name [scale to fit]`.
 * The title is the same, after `imv - `.
 */
export function overlayText(
  index: number,
  count: number,
  name: string,
  size: { width: number; height: number } | null,
  scale: number,
  mode: ScalingMode,
): string {
  const dims = size ? `${size.width}x${size.height}` : "0x0";
  return `[${index + 1}/${count}] [${dims}] [${Math.round(scale * 100)}%] ${name} [${SCALING_LABELS[mode]}]`;
}
