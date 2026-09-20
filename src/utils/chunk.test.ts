import { describe, it, expect } from "vitest";
import { chunkFile, stripMarkup } from "./chunk";

describe("stripMarkup", () => {
  it("unwraps links and keeps their text", () => {
    expect(stripMarkup("see [the repo](https://example.com)")).toBe("see the repo");
  });

  it("keeps image alt text, which carries the badge labels", () => {
    expect(stripMarkup("![React](https://img.shields.io/x.svg)")).toBe("React");
  });

  it("drops fenced code", () => {
    expect(stripMarkup("before\n```js\nconst x = 1;\n```\nafter")).toBe("before after");
  });

  it("drops embedded media blocks along with their fallback text", () => {
    const html = '<video controls>\n<source src="a.mp4">\nNo video tag support.\n</video>';
    expect(stripMarkup(`intro\n${html}`)).toBe("intro");
  });

  it("removes heading, list and quote markers", () => {
    expect(stripMarkup("## Title\n- one\n- two\n> quoted")).toBe("Title one two quoted");
  });

  it("removes emphasis", () => {
    expect(stripMarkup("**bold** and _italic_")).toBe("bold and italic");
  });

  it("collapses whitespace", () => {
    expect(stripMarkup("a   b\n\n\nc")).toBe("a b c");
  });
});

describe("chunkFile", () => {
  it("returns nothing for an empty file", () => {
    expect(chunkFile("a.md", "")).toEqual([]);
  });

  it("splits on blank lines", () => {
    const chunks = chunkFile(
      "a.md",
      "first paragraph here ok\n\nsecond paragraph here ok",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe("first paragraph here ok");
    expect(chunks[1].text).toBe("second paragraph here ok");
  });

  it("reports 1-based line ranges", () => {
    const chunks = chunkFile("a.md", "alpha beta gamma delta\n\nepsilon zeta eta theta");
    expect(chunks[0].line).toBe(1);
    expect(chunks[0].endLine).toBe(1);
    expect(chunks[1].line).toBe(3);
  });

  it("keeps a heading attached to the paragraph under it", () => {
    const chunks = chunkFile("a.md", "## Projects\n\nA tool for counting monsters.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Projects A tool for counting monsters.");
    expect(chunks[0].line).toBe(1);
  });

  it("starts a new chunk at the next heading", () => {
    const chunks = chunkFile(
      "a.md",
      "## One\n\nsome words about one\n\n## Two\n\nsome words about two",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[1].line).toBe(5);
  });

  it("carries parent headings into the embedded text", () => {
    const chunks = chunkFile(
      "a.md",
      "# Experience\n\nworked on things\n\n## Dräger\n\nindustrial software work",
    );
    const last = chunks[chunks.length - 1];
    expect(last.embedText).toContain("Experience");
    expect(last.embedText).toContain("industrial software work");
  });

  it("puts the file path into the embedded text as context", () => {
    const [chunk] = chunkFile("resume/eschbach.md", "did some work there ok");
    expect(chunk.embedText).toContain("resume eschbach");
  });

  it("drops passages with too little prose to carry meaning", () => {
    expect(chunkFile("a.md", "![React](x.svg) ![Vite](y.svg)")).toEqual([]);
    expect(chunkFile("a.md", "[link](https://example.com)")).toEqual([]);
  });

  it("breaks up a paragraph that runs past the word budget", () => {
    const chunks = chunkFile("a.md", `${"word ".repeat(200)}`.trim());
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.split(/\s+/).length).toBeLessThanOrEqual(90);
    }
  });

  it("ignores style and script blocks that contain blank lines", () => {
    const html = [
      "<html>",
      "<style>",
      "  p {",
      "",
      "    color: red;",
      "  }",
      "</style>",
      "<p>Contact us at the address below.</p>",
    ].join("\n");
    const chunks = chunkFile("a.html", html);
    expect(chunks.map((chunk) => chunk.text).join(" ")).not.toContain("color");
    expect(chunks.some((chunk) => chunk.text.includes("Contact us"))).toBe(true);
  });

  it("keeps line numbers accurate after removing a block", () => {
    const html = "<style>\na {\n\nb: c;\n}\n</style>\nthe real prose line here";
    const [chunk] = chunkFile("a.html", html);
    expect(chunk.text).toBe("the real prose line here");
    expect(chunk.line).toBe(7);
  });

  it("never reports a line range outside the file", () => {
    const content = "## Title\n\nbody text goes here\n\nmore body text here";
    const lineCount = content.split("\n").length;
    for (const chunk of chunkFile("a.md", content)) {
      expect(chunk.line).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeLessThanOrEqual(lineCount);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.line);
    }
  });
});
