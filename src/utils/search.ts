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

/** The three toggles beside the Search view's input, as in VSCode. */
export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

/** What the Search view has been asked: the text and its toggles. */
export interface FindQuery {
  query: string;
  options: FindOptions;
}

export const EMPTY_FIND: FindQuery = {
  query: "",
  options: { matchCase: false, wholeWord: false, regex: false },
};

/** One line of a file with every match on it. */
export interface LineMatch {
  /** 1-based line number, matching the editor gutter. */
  line: number;
  /** The line, trimmed to a window around the first match. */
  text: string;
  /** Ranges into `text`. */
  ranges: MatchRange[];
}

/** Every matching line in one file, in line order. */
export interface FileMatches {
  file: FileNode;
  lines: LineMatch[];
  /** Matches, not lines: a line matching twice counts twice. */
  count: number;
}

export type FindResult =
  | { ok: true; files: FileMatches[]; total: number; truncated: boolean }
  | { ok: false; error: string };

/** Enough for any real query over this corpus, and a bound on a stray `.`. */
const MAX_FIND_LINES = 2000;

/** Letters, digits and `_` in any script, so "Lörrach" is one word. */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;

/** Escapes what the `u` flag treats as syntax, and nothing else: under `u` a
 *  needless escape such as `\/` is itself a syntax error. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The Search view: every line in every file that matches `query`, grouped by
 * file in tree order.
 *
 * The query is always compiled to a regular expression with the `u` flag, so
 * case folding and whole-word boundaries work beyond ASCII. With `regex` off
 * it is escaped first; with it on, an invalid pattern is reported rather than
 * thrown. Matches of zero length (`^`, `a*`) are skipped, since there is
 * nothing to highlight.
 */
export function findInFiles(files: FileNode[], query: string, options: FindOptions): FindResult {
  if (query === "") return { ok: true, files: [], total: 0, truncated: false };

  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) source = `(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})`;
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, options.matchCase ? "gu" : "giu");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const results: FileMatches[] = [];
  let total = 0;
  let lineCount = 0;
  let truncated = false;

  for (const file of files) {
    if (truncated) break;
    const lines: LineMatch[] = [];
    let count = 0;
    const content = file.content.split("\n");
    for (let i = 0; i < content.length; i++) {
      const ranges: MatchRange[] = [];
      for (const match of content[i].matchAll(pattern)) {
        if (match[0] === "") continue;
        ranges.push({ start: match.index, end: match.index + match[0].length });
      }
      if (ranges.length === 0) continue;
      if (lineCount === MAX_FIND_LINES) {
        truncated = true;
        break;
      }
      lines.push({ line: i + 1, ...windowLine(content[i], ranges) });
      count += ranges.length;
      lineCount++;
    }
    if (lines.length > 0) {
      results.push({ file, lines, count });
      total += count;
    }
  }

  return { ok: true, files: results, total, truncated };
}
