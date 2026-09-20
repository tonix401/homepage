import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ModelMeta,
  type StaticModel,
  cosine,
  createModel,
  decodeWeights,
  embed,
  encodeWeights,
  normalizeText,
  preTokenize,
  tokenize,
} from "./model2vec";

/**
 * Expected tokenizations produced by the HuggingFace `tokenizers` library
 * configured exactly like the shipped model (BertNormalizer + BertPreTokenizer
 * + WordPiece over `public/semantic/model.json`'s vocabulary). Regenerate with
 * `scripts/generate_tokenizer_fixture.py`. Any drift here means query vectors
 * no longer match the document vectors baked in at build time.
 */
const fixture: { text: string; tokens: string[] }[] = JSON.parse(
  readFileSync(resolve(__dirname, "model2vec.fixture.json"), "utf-8"),
);

function loadModel(): StaticModel {
  const meta: ModelMeta = JSON.parse(
    readFileSync(resolve("public/semantic/model.json"), "utf-8"),
  );
  const file = readFileSync(resolve("public/semantic/model.bin"));
  const buffer = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  const { scales, quant } = decodeWeights(buffer);
  return createModel(meta, scales, quant);
}

const model = loadModel();
const tokenStrings = (text: string) =>
  tokenize(model, text).map((id) => model.tokens[id]);

// ── normalizer ──────────────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("lowercases", () => {
    expect(normalizeText("HeLLo")).toBe("hello");
  });

  it("strips accents", () => {
    expect(normalizeText("Dräger")).toBe("drager");
    expect(normalizeText("naïve café")).toBe("naive cafe");
  });

  it("turns tabs and newlines into spaces", () => {
    expect(normalizeText("a\tb\nc\r\nd")).toBe("a b c  d");
  });

  it("drops control characters", () => {
    expect(normalizeText("a\u0007b")).toBe("ab");
  });

  it("pads CJK characters with spaces", () => {
    expect(normalizeText("a日b")).toBe("a 日 b");
  });
});

describe("preTokenize", () => {
  it("splits on whitespace", () => {
    expect(preTokenize("a b  c")).toEqual(["a", "b", "c"]);
  });

  it("isolates punctuation", () => {
    expect(preTokenize("don't")).toEqual(["don", "'", "t"]);
    expect(preTokenize("a,b;c")).toEqual(["a", ",", "b", ";", "c"]);
  });

  it("returns nothing for blank input", () => {
    expect(preTokenize("")).toEqual([]);
    expect(preTokenize("   ")).toEqual([]);
  });
});

// ── wordpiece ───────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it.each(fixture)("matches HuggingFace for $text", ({ text, tokens }) => {
    expect(tokenStrings(text)).toEqual(tokens);
  });

  it("falls back to [UNK] for words no piece covers", () => {
    expect(tokenStrings("日本語ですよ")).toContain("[UNK]");
  });

  it("does not split a word longer than maxInputCharsPerWord", () => {
    const long = "a".repeat(model.maxInputCharsPerWord + 1);
    expect(tokenStrings(long)).toEqual(["[UNK]"]);
  });
});

// ── embedding ───────────────────────────────────────────────────────────────

describe("embed", () => {
  it("returns null when there is nothing to embed", () => {
    expect(embed(model, "")).toBeNull();
    expect(embed(model, "   ")).toBeNull();
  });

  it("returns a unit vector of the model's width", () => {
    const vector = embed(model, "hello world")!;
    expect(vector).toHaveLength(model.dim);
    expect(cosine(vector, vector)).toBeCloseTo(1, 5);
  });

  it("is case- and accent-insensitive", () => {
    const a = embed(model, "Dräger")!;
    const b = embed(model, "drager")!;
    expect(cosine(a, b)).toBeCloseTo(1, 5);
  });

  it("scores related text above unrelated text", () => {
    const query = embed(model, "dungeons and dragons game")!;
    const related = embed(model, "a command line tool for role playing campaigns")!;
    const unrelated = embed(model, "quarterly tax accounting spreadsheet")!;
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("matches a paraphrase more closely than a lexical near-miss", () => {
    const query = embed(model, "where has he been employed")!;
    const paraphrase = embed(model, "previous jobs and work experience")!;
    const decoy = embed(model, "the colour of the kitchen wall")!;
    expect(cosine(query, paraphrase)).toBeGreaterThan(cosine(query, decoy));
  });
});

describe("cosine", () => {
  it("is 1 for identical vectors and -1 for opposites", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosine(a, a)).toBe(1);
    expect(cosine(a, b)).toBe(-1);
  });
});

// ── binary format ───────────────────────────────────────────────────────────

describe("encodeWeights / decodeWeights", () => {
  it("round-trips", () => {
    const scales = new Float32Array([0.5, 0.25]);
    const quant = new Int8Array([1, -2, 3, 127, -128, 0]);
    const encoded = encodeWeights(3, 2, scales, quant);
    const decoded = decodeWeights(
      encoded.buffer.slice(0, encoded.byteLength) as ArrayBuffer,
    );
    expect(decoded.dim).toBe(3);
    expect(decoded.rows).toBe(2);
    expect([...decoded.scales]).toEqual([...scales]);
    expect([...decoded.quant]).toEqual([...quant]);
  });

  it("rejects a file that is not a weights file", () => {
    expect(() => decodeWeights(new ArrayBuffer(32))).toThrow(/bad magic/);
  });

  it("rejects a truncated file", () => {
    const encoded = encodeWeights(3, 2, new Float32Array(2), new Int8Array(6));
    expect(() =>
      decodeWeights(encoded.buffer.slice(0, encoded.byteLength - 1) as ArrayBuffer),
    ).toThrow(/expected \d+ bytes/);
  });
});
