/**
 * Browser-side semantic search.
 *
 * Document vectors are baked in at build time by the open-folder plugin and
 * cost nothing to ship. The embedding table needed to vectorize the *query* is
 * ~2 MB, so it is fetched lazily and search stays lexical until it lands —
 * results upgrade in place rather than waiting.
 */

import { dim, chunks, mean, vectors } from "virtual:open-folder-embeddings";
import {
  type ModelMeta,
  type StaticModel,
  centerVector,
  cosine,
  createModel,
  decodeWeights,
  embed,
} from "../utils/model2vec";
import { type SemanticHit } from "../utils/search";
import { type FileNode } from "./types";

export type SemanticStatus = "unavailable" | "idle" | "loading" | "ready" | "error";

/**
 * These scores rank well but do not separate an on-topic query from an
 * off-topic one: on a corpus this small something is always the nearest
 * neighbour, and measured on this content an unrelated query still reaches
 * ~0.38 while a fair question can sit at ~0.24. So the floor below only
 * suppresses the degenerate cases, the relative cutoff trims the long tail,
 * and relevance gating is left to the caller — `QuickOpen` asks for these
 * suggestions only when lexical search came up short.
 */
const MIN_SCORE = 0.2;
const RELATIVE_CUTOFF = 0.7;
const MAX_HITS = 6;

/** Document vectors, dequantized and renormalized, one row per chunk. */
let documents: Float32Array[] | null = null;
let model: StaticModel | null = null;
let pending: Promise<StaticModel | null> | null = null;

export function isSemanticAvailable(): boolean {
  return dim > 0 && chunks.length > 0;
}

function decodeDocuments(): Float32Array[] {
  const rows: Float32Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const row = new Float32Array(dim);
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      const value = vectors[i * dim + d] / 127;
      row[d] = value;
      norm += value * value;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) for (let d = 0; d < dim; d++) row[d] /= norm;
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch and decode the embedding table. Safe to call repeatedly: concurrent
 * callers share one request, and a successful load is cached for the session.
 */
export function loadSemanticModel(): Promise<StaticModel | null> {
  if (model) return Promise.resolve(model);
  if (pending) return pending;
  if (!isSemanticAvailable()) return Promise.resolve(null);

  const base = import.meta.env.BASE_URL;
  pending = (async () => {
    const [metaResponse, binResponse] = await Promise.all([
      fetch(`${base}semantic/model.json`),
      fetch(`${base}semantic/model.bin`),
    ]);
    if (!metaResponse.ok || !binResponse.ok) {
      throw new Error(
        `semantic model: HTTP ${metaResponse.status}/${binResponse.status}`,
      );
    }
    const meta: ModelMeta = await metaResponse.json();
    const { scales, quant } = decodeWeights(await binResponse.arrayBuffer());
    if (meta.dim !== dim) {
      throw new Error(
        `semantic model: table is ${meta.dim}-dimensional but documents are ${dim}`,
      );
    }
    model = createModel(meta, scales, quant);
    documents = decodeDocuments();
    return model;
  })();

  // Let a failed load be retried rather than poisoning the cache forever.
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/**
 * Rank passages against `query`.
 *
 * Returns `[]` until the model is loaded, and for queries that embed to
 * nothing. `files` supplies the `FileNode` a hit points at; passages whose
 * file is gone (content edited between build and query) are skipped.
 */
export function semanticSearch(
  query: string,
  files: FileNode[],
  exclude: ReadonlySet<string> = new Set(),
): SemanticHit[] {
  if (!model || !documents) return [];
  const raw = embed(model, query);
  if (!raw) return [];
  const vector = centerVector(raw, mean);
  if (!vector) return [];

  const scores = documents.map((document) => cosine(vector, document));
  const best = Math.max(...scores);
  if (best < MIN_SCORE) return [];
  const cutoff = best * RELATIVE_CUTOFF;

  const byPath = new Map(files.map((file) => [file.path, file]));
  const hits: SemanticHit[] = [];
  const bestPerFile = new Map<string, number>();

  for (let i = 0; i < documents.length; i++) {
    const score = scores[i];
    if (score < cutoff) continue;
    const chunk = chunks[i];
    if (exclude.has(chunk.path)) continue;
    const file = byPath.get(chunk.path);
    if (!file) continue;

    // One passage per file: six near-identical hits from one document crowd
    // out every other document.
    const previous = bestPerFile.get(chunk.path);
    if (previous !== undefined && hits[previous].score >= score) continue;
    const hit: SemanticHit = {
      kind: "semantic",
      file,
      line: chunk.line,
      text: chunk.text,
      score,
    };
    if (previous !== undefined) hits[previous] = hit;
    else {
      bestPerFile.set(chunk.path, hits.length);
      hits.push(hit);
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
}
