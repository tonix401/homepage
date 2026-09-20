/**
 * Splits files into passages for semantic search.
 *
 * A whole file is too coarse to embed — one 128-dimensional vector cannot
 * represent a page of prose, and a hit would have nowhere to jump to. A single
 * line is too fine: most lines are fragments with no standalone meaning. So we
 * cut on the boundaries the author already wrote (blank lines and headings)
 * and cap the result at a paragraph's worth of words.
 */

export interface Chunk {
  /** Display path of the file this passage came from. */
  path: string;
  /** 1-based first line, matching the editor gutter. */
  line: number;
  /** 1-based last line, inclusive. */
  endLine: number;
  /** The passage as plain prose, for display in a result row. */
  text: string;
  /** What actually gets embedded: path and heading context plus plain prose. */
  embedText: string;
}

const MAX_WORDS = 80;
/** Shorter than this and a block is a stub — folded into the next one. */
const MIN_WORDS = 4;
/**
 * A passage with less prose than this is markup, a badge row or a lone link.
 * Embedding it would put a vector with almost no signal into the index, where
 * the path context alone could float it to the top of unrelated queries.
 */
const MIN_PROSE_WORDS = 3;

const HEADING = /^(#{1,6})\s+(.*)$/;

/** Elements whose contents are code or media, never prose. */
const NON_PROSE_BLOCK = /<(video|audio|script|style|iframe|svg|head)\b[\s\S]*?<\/\1>/gi;

/**
 * Blank out `<style>`, `<script>` and friends across the whole file.
 *
 * These have to go before the file is split into blocks: such a block
 * routinely contains blank lines, and once it has been cut at one, no fragment
 * holds a matching open and close tag any more, so per-block stripping leaves
 * the CSS behind and indexes it as prose. Each block is replaced by the same
 * number of newlines it occupied, so every later line keeps its number and
 * search hits still jump to the right place.
 */
function blankNonProseBlocks(content: string): string {
  return content.replace(NON_PROSE_BLOCK, (block) =>
    "\n".repeat((block.match(/\n/g) ?? []).length),
  );
}

/** Strip Markdown and HTML syntax so the embedder sees prose, not punctuation. */
export function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<(video|audio|script|style|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}\|/gm, " ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Turn `2#resume/eschbach.md` into `resume eschbach` for embedding context. */
function pathContext(path: string): string {
  return stripMarkup(path.replace(/\.[^./]+$/, "").replace(/[/\-_]+/g, " "));
}

interface Block {
  lines: string[];
  line: number;
  headings: string[];
}

/**
 * Turn one block into passages.
 *
 * Usually that is a single passage, but a Markdown paragraph is often written
 * as one very long line, so the prose is also split on the word budget. The
 * pieces then share a line range — the paragraph's — which is the right place
 * to jump to anyway.
 */
function toChunks(block: Block, path: string): Chunk[] {
  const body = stripMarkup(block.lines.join("\n"));
  if (wordCount(body) < MIN_PROSE_WORDS) return [];

  const context = [pathContext(path), ...block.headings].filter(Boolean).join(" · ");
  const words = body.split(" ");
  const chunks: Chunk[] = [];

  for (let start = 0; start < words.length; start += MAX_WORDS) {
    const text = words.slice(start, start + MAX_WORDS).join(" ");
    // A trailing sliver carries no meaning on its own; leave it with the
    // passage before it rather than making a passage of it.
    if (start > 0 && wordCount(text) < MIN_PROSE_WORDS) {
      chunks[chunks.length - 1].text += ` ${text}`;
      chunks[chunks.length - 1].embedText += ` ${text}`;
      break;
    }
    chunks.push({
      path,
      line: block.line,
      endLine: block.line + block.lines.length - 1,
      text,
      embedText: context === "" ? text : `${context}: ${text}`,
    });
  }
  return chunks;
}

/**
 * Cut one file into passages.
 *
 * Blocks break on blank lines and headings; a heading is carried forward as
 * context for everything under it, so "Experience" still colours the bullet
 * points that follow even once they are separate passages.
 */
export function chunkFile(path: string, content: string): Chunk[] {
  const lines = blankNonProseBlocks(content).split("\n");
  const chunks: Chunk[] = [];

  let headings: string[] = [];
  let buffer: string[] = [];
  let bufferStart = 1;
  let bufferHeadings: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push(
      ...toChunks(
        { lines: buffer, line: bufferStart, headings: bufferHeadings },
        path,
      ),
    );
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING.exec(line);

    if (heading) {
      flush();
      const depth = heading[1].length;
      headings = [...headings.slice(0, depth - 1), stripMarkup(heading[2])];
      buffer = [line];
      bufferStart = i + 1;
      bufferHeadings = headings.slice(0, -1);
      continue;
    }

    if (line.trim() === "") {
      // Only break here if what we have is substantial; otherwise let a stub
      // like a lone heading absorb the paragraph that follows it.
      if (wordCount(buffer.join(" ")) >= MIN_WORDS) flush();
      continue;
    }

    if (buffer.length === 0) {
      bufferStart = i + 1;
      bufferHeadings = headings;
    }
    buffer.push(line);

    if (wordCount(buffer.join(" ")) >= MAX_WORDS) flush();
  }

  flush();
  return chunks;
}
