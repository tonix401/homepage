import { describe, it, expect } from "vitest";
import { MAX_FILE_BYTES, classify, sniffImage } from "./fileFilter";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("knows each format by its magic number", () => {
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(bytes(0, 0, 0, 0x20, "ftypavif"))).toBe("image/avif");
  });

  it("does not take a name or a short file for an image", () => {
    expect(sniffImage(text("not.png"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("classify", () => {
  it("goes by the bytes, not the name", () => {
    expect(classify("photo.txt", bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ type: "image", mime: "image/jpeg" });
    expect(classify("notes.md", text("# hi"))).toEqual({ type: "md", mime: "text/plain", text: "# hi" });
  });

  it("types text by its extension, and plain text without one", () => {
    expect(classify("a.py", text("print(1)"))).toMatchObject({ type: "py" });
    expect(classify("README", text("hello"))).toMatchObject({ type: "unsupported", text: "hello" });
  });

  it("takes an SVG for an image, prolog and comments allowed", () => {
    const svg = '<?xml version="1.0"?>\n<!-- drawn -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(classify("logo", text(svg))).toEqual({ type: "image", mime: "image/svg+xml" });
  });

  it("refuses web pages by extension, header or content", () => {
    const refused = { error: "Web pages are not saved, only images and text" };
    expect(classify("index.html", text("hi"))).toEqual(refused);
    expect(classify("page", text("hi"), "text/html; charset=utf-8")).toEqual(refused);
    expect(classify("page.txt", text("  <!doctype html><p>hi"))).toEqual(refused);
  });

  it("refuses binary data and anything over the size limit", () => {
    expect(classify("a.bin", bytes(0x7f, "ELF", 0, 1))).toEqual({ error: "Not an image or a text file" });
    expect(classify("a.txt", bytes(0xc3, 0x28))).toEqual({ error: "Not an image or a text file" });
    expect(classify("big.txt", new Uint8Array(MAX_FILE_BYTES + 1))).toMatchObject({ error: expect.stringMatching(/too large/) });
  });
});
