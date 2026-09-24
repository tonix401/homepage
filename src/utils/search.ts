/**
 * Lexical search over the open folder.
 *
 * The whole corpus is a handful of files already in memory, so this is a plain
 * linear scan per keystroke — no index, no worker, no debounce. Keeping it
 * pure also keeps it testable.
 */

import { type FileNode, type TreeNode } from "../services/types";

/** Character span inside a string, for `<mark>` rendering. */
export interface MatchRange {
  start: number;
  end: number;
}

/** A file whose path matched the query. */
export interface NameHit {
  kind: "name";
  file: FileNode;
  score: number;
  /** Ranges into `file.path`. */
  ranges: MatchRange[];
}

/** A line inside a file that contains the query. */
export interface ContentHit {
  kind: "content";
  file: FileNode;
  /** 1-based line number, matching the editor gutter. */
  line: number;
  /** The line, trimmed to a window around the first match. */
  text: string;
  /** Ranges into `text`. */
  ranges: MatchRange[];
}

export type SearchHit = NameHit | ContentHit;

const MAX_CONTENT_HITS_PER_FILE = 5;
const MAX_CONTENT_HITS = 50;
const SNIPPET_WINDOW = 120;

/** Depth-first list of every file in the tree, in display order. */
export function flattenFiles(nodes: TreeNode[]): FileNode[] {
  const files: FileNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") files.push(node);
    else files.push(...flattenFiles(node.children));
  }
  return files;
}

/**
 * Subsequence fuzzy match of `query` against `text`, in the spirit of VSCode's
 * quick open: every query character must appear in order, and matches score
 * higher when they are consecutive, start a word, or fall in the file name
 * rather than the directory part.
 *
 * Returns `null` when the characters do not appear in order at all.
 */
export function fuzzyMatch(
  text: string,
  query: string,
): { score: number; ranges: MatchRange[] } | null {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (needle === "") return null;

  const nameStart = text.lastIndexOf("/") + 1;
  const ranges: MatchRange[] = [];
  let score = 0;
  let cursor = 0;
  let previousIndex = -2;

  for (const char of needle) {
    const index = haystack.indexOf(char, cursor);
    if (index === -1) return null;

    score += 1;
    if (index === previousIndex + 1) score += 4;
    const before = index > 0 ? text[index - 1] : "/";
    if (before === "/" || before === " " || before === "-" || before === "_") {
      score += 3;
    }
    if (index >= nameStart) score += 2;

    const last = ranges[ranges.length - 1];
    if (last && last.end === index) last.end = index + 1;
    else ranges.push({ start: index, end: index + 1 });

    previousIndex = index;
    cursor = index + 1;
  }

  // Prefer tight matches: the same characters spread across a long path are a
  // worse hit than the same characters bunched together.
  const span = ranges[ranges.length - 1].end - ranges[0].start;
  score += Math.max(0, 20 - span);
  return { score, ranges };
}

/** Every occurrence of `needle` in `line`, case-insensitively. */
function findAll(line: string, needle: string): MatchRange[] {
  const ranges: MatchRange[] = [];
  const haystack = line.toLowerCase();
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return ranges;
    ranges.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
}

/**
 * Trim a long line to a window around its first match, shifting the ranges to
 * match and marking either end with an ellipsis.
 */
function windowLine(
  line: string,
  ranges: MatchRange[],
): { text: string; ranges: MatchRange[] } {
  const leadingSpace = line.length - line.trimStart().length;
  let start = leadingSpace;
  if (ranges[0].start - leadingSpace > SNIPPET_WINDOW / 2) {
    start = ranges[0].start - Math.floor(SNIPPET_WINDOW / 4);
  }
  const end = Math.min(line.length, start + SNIPPET_WINDOW);
  const prefix = start > leadingSpace ? "…" : "";
  const suffix = end < line.trimEnd().length ? "…" : "";
  const shift = prefix.length - start;

  const text = prefix + line.slice(start, end).trimEnd() + suffix;
  const shifted: MatchRange[] = [];
  for (const range of ranges) {
    if (range.start < start || range.end > end) continue;
    shifted.push({ start: range.start + shift, end: range.end + shift });
  }
  return { text, ranges: shifted };
}

/**
 * Search file paths and file contents.
 *
 * Name hits come first, ordered by score; content hits follow, grouped by file
 * in tree order. Both are capped so a one-character query cannot produce a
 * thousand rows.
 */
export function searchFiles(files: FileNode[], query: string): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const nameHits: NameHit[] = [];
  const contentHits: ContentHit[] = [];
  const needle = trimmed.toLowerCase();
  let total = 0;

  for (const file of files) {
    const match = fuzzyMatch(file.path, trimmed);
    if (match) {
      nameHits.push({ kind: "name", file, score: match.score, ranges: match.ranges });
    }

    if (total >= MAX_CONTENT_HITS) continue;
    let perFile = 0;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (perFile >= MAX_CONTENT_HITS_PER_FILE || total >= MAX_CONTENT_HITS) break;
      const ranges = findAll(lines[i], needle);
      if (ranges.length === 0) continue;
      const windowed = windowLine(lines[i], ranges);
      contentHits.push({
        kind: "content",
        file,
        line: i + 1,
        text: windowed.text,
        ranges: windowed.ranges,
      });
      perFile++;
      total++;
    }
  }

  nameHits.sort((a, b) => b.score - a.score);
  return [...nameHits, ...contentHits];
}
