/**
 * The open folder as a Kdenlive project: every file a clip as long as it takes
 * to read, every folder a track, and the clips laid end to end in the order
 * the Explorer lists them — so the timeline is a Gantt chart of reading the
 * whole folder, and the playhead is how far through it you are.
 *
 * Kept free of React and of the virtual modules, like `graph.ts`: every
 * function takes the tree or timeline it should read, so the tests can hand
 * it one.
 */

import { type FileNode, type TreeNode } from "../services/types";

/** Reading speed, in words a minute: an adult reading prose on a screen. */
export const WPM = 230;

/** The shortest clip, in seconds, so a near-empty file is still clickable. */
export const MIN_CLIP = 5;

/** Kdenlive's default project profile runs at 25 frames a second. */
export const FPS = 25;

export interface Track {
  /** The folder's display path, or `""` for the files at the root. */
  id: string;
  label: string;
  clips: Clip[];
}

export interface Clip {
  file: FileNode;
  /** The `id` of the track it sits on. */
  track: string;
  /** Seconds from the start of the project. */
  start: number;
  duration: number;
}

export interface Timeline {
  /** In the order the tree first reaches each folder. */
  tracks: Track[];
  /** Every clip, in reading order: each starts where the last one ends. */
  clips: Clip[];
  total: number;
}

/**
 * The words a reader would actually read. An HTML page's markup and its style
 * and script bodies are not prose; markdown's own syntax is too little to
 * matter, and a tag inside a note is stripped the same way.
 */
function readableText(file: FileNode): string {
  return file.content
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function readingSeconds(file: FileNode): number {
  const words = readableText(file).split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_CLIP, (words / WPM) * 60);
}

export function buildTimeline(tree: TreeNode[], rootName: string): Timeline {
  const tracks: Track[] = [];
  const byId = new Map<string, Track>();
  const clips: Clip[] = [];
  let cursor = 0;

  const walk = (nodes: TreeNode[], prefix: string) => {
    for (const node of nodes) {
      if (node.kind === "folder") {
        walk(node.children, prefix ? `${prefix}/${node.name}` : node.name);
        continue;
      }
      let track = byId.get(prefix);
      if (!track) {
        track = { id: prefix, label: prefix || rootName, clips: [] };
        byId.set(prefix, track);
        tracks.push(track);
      }
      const clip: Clip = { file: node, track: prefix, start: cursor, duration: readingSeconds(node) };
      cursor += clip.duration;
      track.clips.push(clip);
      clips.push(clip);
    }
  };
  walk(tree, "");

  return { tracks, clips, total: cursor };
}

/**
 * The clip under a time, and how far into it the time is (0–1). A time on the
 * boundary belongs to the clip it starts; the very end of the project is the
 * end of the last clip rather than past it.
 */
export function clipAt(timeline: Timeline, t: number): { clip: Clip; fraction: number } | null {
  const { clips, total } = timeline;
  if (clips.length === 0) return null;
  const time = Math.min(Math.max(t, 0), total);
  const clip = clips.find((c) => time < c.start + c.duration) ?? clips[clips.length - 1];
  return { clip, fraction: Math.min(Math.max((time - clip.start) / clip.duration, 0), 1) };
}

/** The time a fraction of the way through a file is at, or `null` for a file with no clip. */
export function timeOf(timeline: Timeline, path: string, fraction: number): number | null {
  const clip = timeline.clips.find((c) => c.file.path === path);
  if (!clip) return null;
  return clip.start + Math.min(Math.max(fraction, 0), 1) * clip.duration;
}

/** Kdenlive's timecode, `HH:MM:SS:FF`, rounded down to the frame. */
export function formatTimecode(seconds: number, fps = FPS): string {
  const frames = Math.floor(Math.max(seconds, 0) * fps + 1e-6);
  const ff = frames % fps;
  const total = Math.floor(frames / fps);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(ff)}`;
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

/** The smallest round tick interval, in seconds, that keeps labels `minSpacing` px apart. */
export function rulerStep(pxPerSecond: number, minSpacing: number): number {
  return STEPS.find((s) => s * pxPerSecond >= minSpacing) ?? STEPS[STEPS.length - 1];
}
