/**
 * Minimal model2vec (potion) inference.
 *
 * A model2vec model is a plain token -> vector lookup table: no transformer,
 * no ONNX runtime. Encoding a string is tokenize -> gather rows -> mean-pool
 * -> L2-normalize, which is why this fits in one dependency-free file and runs
 * in microseconds.
 *
 * The tokenizer is a faithful port of the HuggingFace `BertNormalizer` +
 * `BertPreTokenizer` + `WordPiece` stack as configured by
 * `minishlab/potion-base-4M` (lowercase, strip accents, `##` continuations).
 * Token ids must match the Python reference exactly, or the shipped vectors
 * and the query vectors would live in different spaces.
 */

export interface ModelMeta {
  /** Embedding width (128 for potion-base-4M). */
  dim: number;
  /** Row count; also `tokens.length`. */
  rows: number;
  /** Row index of `[UNK]`, used for words WordPiece cannot cover. */
  unkId: number;
  /** Prefix marking a non-initial word piece. */
  continuingPrefix: string;
  /** Words longer than this become a single `[UNK]` without being split. */
  maxInputCharsPerWord: number;
  /** Vocabulary in row order. */
  tokens: string[];
}

/** Everything needed to turn text into token ids — no weights required. */
export interface Tokenizer {
  vocab: Map<string, number>;
  unkId: number;
  continuingPrefix: string;
  maxInputCharsPerWord: number;
}

export interface StaticModel extends ModelMeta, Tokenizer {
  /** int8 weights, row-major, length `rows * dim` */
  quant: Int8Array;
  /** per-row dequantisation factor, length `rows` */
  scales: Float32Array;
}

// ── normalizer ──────────────────────────────────────────────────────────────

// Ranges BERT treats as CJK and pads with spaces so every glyph is its own word.
const CJK_RANGES: [number, number][] = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0xf900, 0xfaff],
  [0x2f800, 0x2fa1f],
];

function isCjk(cp: number): boolean {
  return CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

const CONTROL = /\p{Cc}|\p{Cf}|\p{Co}|\p{Cs}/u;
const COMBINING_MARK = /\p{Mn}/gu;
// BERT counts every ASCII punctuation character as punctuation, even the ones
// Unicode files under Symbol (`$`, `+`, `<`, `^`, `` ` ``, `|`, `~`).
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const UNICODE_PUNCT = /\p{P}/u;

function isPunctuation(ch: string): boolean {
  return ASCII_PUNCT.test(ch) || UNICODE_PUNCT.test(ch);
}

/**
 * `BertNormalizer`: drop control characters, collapse whitespace, isolate CJK,
 * strip accents, lowercase. Accents are stripped before lowercasing, matching
 * the Rust implementation's ordering.
 */
export function normalizeText(text: string): string {
  let cleaned = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0 || cp === 0xfffd) continue;
    if (ch === "\t" || ch === "\n" || ch === "\r") {
      cleaned += " ";
      continue;
    }
    if (CONTROL.test(ch)) continue;
    if (/\s/u.test(ch)) {
      cleaned += " ";
      continue;
    }
    cleaned += isCjk(cp) ? ` ${ch} ` : ch;
  }
  return cleaned.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
}

/**
 * `BertPreTokenizer`: split on whitespace, then break every punctuation
 * character out into a word of its own.
 */
export function preTokenize(normalized: string): string[] {
  const words: string[] = [];
  for (const chunk of normalized.split(/\s+/)) {
    if (chunk === "") continue;
    let current = "";
    for (const ch of chunk) {
      if (isPunctuation(ch)) {
        if (current !== "") words.push(current);
        words.push(ch);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current !== "") words.push(current);
  }
  return words;
}

// ── wordpiece ───────────────────────────────────────────────────────────────

/** Greedy longest-match-first WordPiece over a single pre-tokenized word. */
function encodeWord(model: Tokenizer, word: string, out: number[]): void {
  const chars = [...word];
  if (chars.length > model.maxInputCharsPerWord) {
    out.push(model.unkId);
    return;
  }

  const pieces: number[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found = -1;
    while (start < end) {
      const piece =
        (start > 0 ? model.continuingPrefix : "") +
        chars.slice(start, end).join("");
      const id = model.vocab.get(piece);
      if (id !== undefined) {
        found = id;
        break;
      }
      end--;
    }
    // No prefix of the remainder is in the vocabulary: the whole word is [UNK].
    if (found === -1) {
      out.push(model.unkId);
      return;
    }
    pieces.push(found);
    start = end;
  }
  out.push(...pieces);
}

/** Full text -> token ids. */
export function tokenize(model: Tokenizer, text: string): number[] {
  const ids: number[] = [];
  for (const word of preTokenize(normalizeText(text))) {
    encodeWord(model, word, ids);
  }
  return ids;
}

// ── embedding ───────────────────────────────────────────────────────────────

/**
 * Mean-pool the rows for `ids` and L2-normalize.
 *
 * Returns `null` for an empty id list — the Python reference yields an
 * all-zero vector there, which has no direction and must not be compared.
 */
export function embedIds(model: StaticModel, ids: number[]): Float32Array | null {
  if (ids.length === 0) return null;

  const { dim, quant, scales } = model;
  const sum = new Float32Array(dim);
  for (const id of ids) {
    const scale = scales[id];
    const offset = id * dim;
    for (let d = 0; d < dim; d++) sum[d] += quant[offset + d] * scale;
  }

  let norm = 0;
  for (let d = 0; d < dim; d++) {
    sum[d] /= ids.length;
    norm += sum[d] * sum[d];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return null;
  for (let d = 0; d < dim; d++) sum[d] /= norm;
  return sum;
}

/** Tokenize and embed in one step. `null` when the text holds no known tokens. */
export function embed(model: StaticModel, text: string): Float32Array | null {
  return embedIds(model, tokenize(model, text));
}

/**
 * Subtract `mean` from `vector` and renormalize.
 *
 * Mean-pooled static embeddings all share a large common component — every
 * passage points roughly "the same way", which compresses cosines into a
 * narrow band and lets a generic passage outrank a relevant one. Removing the
 * corpus mean takes that shared direction out and leaves what actually
 * distinguishes one passage from another.
 */
export function centerVector(
  vector: Float32Array,
  mean: Float32Array,
): Float32Array | null {
  const out = new Float32Array(vector.length);
  let norm = 0;
  for (let d = 0; d < vector.length; d++) {
    out[d] = vector[d] - mean[d];
    norm += out[d] * out[d];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return null;
  for (let d = 0; d < out.length; d++) out[d] /= norm;
  return out;
}

/**
 * Dot product, which equals cosine similarity because every vector this module
 * produces is already L2-normalized.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

// ── binary format ───────────────────────────────────────────────────────────

/** `M2V1` — guards against serving a stale or truncated weights file. */
export const MODEL_MAGIC = 0x3156324d;
const HEADER_BYTES = 16;

export function encodeWeights(
  dim: number,
  rows: number,
  scales: Float32Array,
  quant: Int8Array,
): Uint8Array {
  const buffer = new ArrayBuffer(HEADER_BYTES + rows * 4 + rows * dim);
  const view = new DataView(buffer);
  view.setUint32(0, MODEL_MAGIC, true);
  view.setUint32(4, dim, true);
  view.setUint32(8, rows, true);
  view.setUint32(12, 0, true);
  new Float32Array(buffer, HEADER_BYTES, rows).set(scales);
  new Int8Array(buffer, HEADER_BYTES + rows * 4, rows * dim).set(quant);
  return new Uint8Array(buffer);
}

export function decodeWeights(buffer: ArrayBuffer): {
  dim: number;
  rows: number;
  scales: Float32Array;
  quant: Int8Array;
} {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MODEL_MAGIC) {
    throw new Error("semantic model: bad magic (not an M2V1 weights file)");
  }
  const dim = view.getUint32(4, true);
  const rows = view.getUint32(8, true);
  const expected = HEADER_BYTES + rows * 4 + rows * dim;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `semantic model: expected ${expected} bytes, got ${buffer.byteLength}`,
    );
  }
  return {
    dim,
    rows,
    // `slice` copies out of the fetched buffer so the Float32Array is aligned.
    scales: new Float32Array(buffer.slice(HEADER_BYTES, HEADER_BYTES + rows * 4)),
    quant: new Int8Array(buffer, HEADER_BYTES + rows * 4, rows * dim),
  };
}

export function createModel(
  meta: ModelMeta,
  scales: Float32Array,
  quant: Int8Array,
): StaticModel {
  const vocab = new Map<string, number>();
  meta.tokens.forEach((token, index) => vocab.set(token, index));
  return { ...meta, vocab, scales, quant };
}
