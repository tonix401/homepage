/**
 * What a visitor may add to the open folder, by `curl` or by dropping a file
 * on kitty or jīzǐ: an image, or a text file that is not a web page.
 *
 * The bytes decide, not the name or the server's Content-Type: an image is
 * recognised by its magic number, text by decoding as UTF-8 without a NUL.
 * HTML is refused even though it is text, because the browser app would show
 * a stranger's page as one of the site's own. An SVG is allowed: every viewer
 * draws images with `<img>`, which runs no script inside one.
 *
 * Pure, so the tests can hand it bytes.
 */

import { type FileType } from "../services/types";
import { langHintToFileType } from "./fileTypes";

/** The largest file, and the most one tab may hold in all. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TAB_BYTES = 50 * 1024 * 1024;

export type Accepted = { type: FileType; mime: string; text?: string };
export type Refused = { error: string };

/** The image MIME type the bytes start with, or `null`. */
export function sniffImage(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

/** Text whose markup opens with an `<svg>` element, after any prolog and comments. */
const SVG = /^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;
const HTML = /^\uFEFF?\s*(<!--[\s\S]*?-->\s*)*<(!DOCTYPE html|html|head|body)[\s>]/i;

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The bytes as text, or `null` when they are not UTF-8 or hold a NUL. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Whether a file may be added, and as what. `contentType` is the server's
 * header, when there was one: it only marks a page as HTML.
 */
export function classify(name: string, bytes: Uint8Array, contentType = ""): Accepted | Refused {
  if (bytes.length > MAX_FILE_BYTES) return { error: "File too large (the limit is 10 MB)" };
  const image = sniffImage(bytes);
  if (image) return { type: "image", mime: image };
  const text = decodeText(bytes);
  if (text === null) return { error: "Not an image or a text file" };
  if (SVG.test(text)) return { type: "image", mime: "image/svg+xml" };
  const ext = extension(name);
  if (["html", "htm", "xhtml"].includes(ext) || /^\s*text\/html\b/i.test(contentType) || HTML.test(text)) {
    return { error: "Web pages are not saved, only images and text" };
  }
  return { type: langHintToFileType(ext), mime: "text/plain", text };
}
