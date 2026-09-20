/**
 * Builds the browser-side semantic search model.
 *
 * Downloads `minishlab/potion-base-4M`, prunes its 29,528-token vocabulary
 * down to what this site actually needs, quantizes the weights to int8 and
 * writes the result into `public/semantic/`.
 *
 *   node scripts/prepare-semantic-model.ts [contentFolder]
 *
 * The output is committed, so CI builds need no network and no HuggingFace
 * dependency. Re-run it after adding content that introduces a lot of new
 * vocabulary (a new project, a new language); ordinary edits do not need it,
 * because document vectors are recomputed on every build from the committed
 * table.
 *
 * Pruning works because the vocabulary is frequency-ordered after the first
 * ~1000 entries (id 1002 is "the"), so "keep the first N ids" keeps the N most
 * common word pieces. Every token appearing in the corpus is kept on top of
 * that, whatever its frequency, so content words like "dräger" stay whole.
 * A query word whose pieces were pruned still tokenizes — WordPiece just falls
 * back to shorter pieces — so coverage degrades smoothly instead of failing.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  type ModelMeta,
  type Tokenizer,
  createModel,
  embed,
  encodeWeights,
  tokenize,
} from "../src/utils/model2vec.ts";

const MODEL_ID = "minishlab/potion-base-4M";
const CACHE_DIR = resolve(".model-cache");
const OUT_DIR = resolve("public/semantic");

/**
 * How many of the most frequent word pieces to keep. 16k covers ordinary
 * English typing; at 128 dims that is ~2.1 MB of int8 weights.
 */
const VOCAB_LIMIT = Number(process.env.SEMANTIC_VOCAB_LIMIT ?? 16000);

/**
 * The content folder, mirroring `folderPath` in `vscode_website.config.ts`.
 * Kept as an argument rather than an import because that config file uses
 * extensionless imports, which Node's ESM resolver rejects.
 */
const CORPUS_DIR = process.argv[2] ?? "./open_folder";

// ── model download ──────────────────────────────────────────────────────────

const CACHE_FILES = ["tokenizer.json", "config.json", "model.safetensors"];

async function ensureCache(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const name of CACHE_FILES) {
    const target = join(CACHE_DIR, name);
    if (existsSync(target)) continue;
    const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${name}`;
    process.stdout.write(`downloading ${name} … `);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
    }
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    console.log("done");
  }
}

// ── safetensors ─────────────────────────────────────────────────────────────

function readEmbeddings(): { weights: Float32Array; rows: number; dim: number } {
  const raw = readFileSync(join(CACHE_DIR, "model.safetensors"));
  const headerLength = Number(raw.readBigUInt64LE(0));
  const header = JSON.parse(raw.subarray(8, 8 + headerLength).toString("utf-8"));
  const tensor = header.embeddings;
  if (!tensor || tensor.dtype !== "F32" || tensor.shape.length !== 2) {
    throw new Error(`unexpected safetensors layout: ${JSON.stringify(header)}`);
  }
  const [rows, dim] = tensor.shape as [number, number];
  const start = 8 + headerLength + tensor.data_offsets[0];
  const end = 8 + headerLength + tensor.data_offsets[1];
  // Copy: the file buffer's byte offset is not guaranteed 4-byte aligned.
  const bytes = Uint8Array.prototype.slice.call(raw, start, end);
  return { weights: new Float32Array(bytes.buffer), rows, dim };
}

function readTokenizer(): Tokenizer & { tokens: string[] } {
  const spec = JSON.parse(readFileSync(join(CACHE_DIR, "tokenizer.json"), "utf-8"));
  if (spec.model.type !== "WordPiece") {
    throw new Error(`expected a WordPiece tokenizer, got ${spec.model.type}`);
  }
  const vocabRecord: Record<string, number> = spec.model.vocab;
  const tokens: string[] = [];
  const vocab = new Map<string, number>();
  for (const [token, id] of Object.entries(vocabRecord)) {
    tokens[id] = token;
    vocab.set(token, id);
  }
  return {
    vocab,
    tokens,
    unkId: vocab.get(spec.model.unk_token)!,
    continuingPrefix: spec.model.continuing_subword_prefix,
    maxInputCharsPerWord: spec.model.max_input_chars_per_word,
  };
}

// ── corpus ──────────────────────────────────────────────────────────────────

/** Every file under the configured open folder, as `path -> contents`. */
function readCorpus(dir: string, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of readCorpus(full, rel)) files.set(k, v);
    } else {
      files.set(rel, readFileSync(full, "utf-8"));
    }
  }
  return files;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await ensureCache();

  const tokenizer = readTokenizer();
  const { weights, rows, dim } = readEmbeddings();
  if (rows !== tokenizer.tokens.length) {
    throw new Error(
      `vocab/weights mismatch: ${tokenizer.tokens.length} tokens vs ${rows} rows`,
    );
  }
  console.log(`${MODEL_ID}: ${rows} tokens x ${dim} dims`);

  const corpusDir = resolve(CORPUS_DIR);
  if (!existsSync(corpusDir)) {
    throw new Error(
      `corpus folder "${corpusDir}" does not exist.\n` +
        `  Pass it explicitly: node scripts/prepare-semantic-model.ts <folder>\n` +
        `  It should match folderPath in vscode_website.config.ts.`,
    );
  }
  const corpus = readCorpus(corpusDir);
  const corpusIds = new Set<number>();
  for (const [path, content] of corpus) {
    for (const id of tokenize(tokenizer, `${path}\n${content}`)) corpusIds.add(id);
  }
  console.log(
    `corpus: ${corpus.size} files, ${corpusIds.size} distinct tokens`,
  );

  const keep = new Set<number>(corpusIds);
  for (let id = 0; id < Math.min(VOCAB_LIMIT, rows); id++) keep.add(id);
  // Ascending order preserves the frequency ordering in the pruned table.
  const keptIds = [...keep].sort((a, b) => a - b);
  const beyondLimit = keptIds.filter((id) => id >= VOCAB_LIMIT).length;
  console.log(
    `keeping ${keptIds.length} tokens ` +
      `(top ${VOCAB_LIMIT} + ${beyondLimit} rarer corpus tokens)`,
  );

  // Per-row absmax quantisation: each token keeps its own scale, so both the
  // direction and the magnitude of a row survive, and magnitude matters here
  // because pooling is a plain mean over rows.
  const keptRows = keptIds.length;
  const quant = new Int8Array(keptRows * dim);
  const scales = new Float32Array(keptRows);
  const tokens: string[] = [];
  keptIds.forEach((oldId, newId) => {
    tokens.push(tokenizer.tokens[oldId]);
    const source = oldId * dim;
    let absMax = 0;
    for (let d = 0; d < dim; d++) {
      absMax = Math.max(absMax, Math.abs(weights[source + d]));
    }
    const scale = absMax / 127;
    scales[newId] = scale;
    if (scale === 0) return;
    const target = newId * dim;
    for (let d = 0; d < dim; d++) {
      quant[target + d] = Math.round(weights[source + d] / scale);
    }
  });

  const meta: ModelMeta = {
    dim,
    rows: keptRows,
    unkId: keptIds.indexOf(tokenizer.unkId),
    continuingPrefix: tokenizer.continuingPrefix,
    maxInputCharsPerWord: tokenizer.maxInputCharsPerWord,
    tokens,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const binary = encodeWeights(dim, keptRows, scales, quant);
  writeFileSync(join(OUT_DIR, "model.bin"), binary);
  writeFileSync(
    join(OUT_DIR, "model.json"),
    JSON.stringify({ ...meta, source: MODEL_ID, vocabLimit: VOCAB_LIMIT }),
  );

  reportFidelity(createModel(meta, scales, quant), weights, dim, tokenizer, corpus);
  const metaBytes = readFileSync(join(OUT_DIR, "model.json")).byteLength;
  console.log(
    `wrote public/semantic/model.bin (${(binary.byteLength / 1e6).toFixed(2)} MB) ` +
      `+ model.json (${(metaBytes / 1e6).toFixed(2)} MB)`,
  );
}

/**
 * Sanity check: how far the pruned int8 table drifts from the full fp32 model
 * on real sentences. Anything below ~0.999 cosine means the pipeline is wrong,
 * not merely lossy.
 */
function reportFidelity(
  pruned: ReturnType<typeof createModel>,
  weights: Float32Array,
  dim: number,
  tokenizer: Tokenizer,
  corpus: Map<string, string>,
): void {
  const samples = [
    "where did he work",
    "what programming languages does he know",
    "dungeons and dragons command line tool",
    ...[...corpus.values()].map((text) => text.slice(0, 400)),
  ];

  let worst = 1;
  for (const text of samples) {
    const ids = tokenize(tokenizer, text);
    if (ids.length === 0) continue;

    const exact = new Float32Array(dim);
    for (const id of ids) {
      for (let d = 0; d < dim; d++) exact[d] += weights[id * dim + d];
    }
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += exact[d] * exact[d];
    norm = Math.sqrt(norm);

    const approx = embed(pruned, text);
    if (!approx) continue;
    let similarity = 0;
    for (let d = 0; d < dim; d++) similarity += (exact[d] / norm) * approx[d];
    worst = Math.min(worst, similarity);
  }
  console.log(`fidelity vs full fp32 model: worst cosine ${worst.toFixed(6)}`);
}

await main();
