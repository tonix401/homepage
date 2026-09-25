import { describe, expect, it } from "vitest";
import { prerenderTree } from "./prerender";
import type { FileNode, FolderNode, TreeNode } from "./types";

function md(path: string, content: string): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content };
}

function folder(name: string, children: TreeNode[]): FolderNode {
  return { kind: "folder", name, children };
}

describe("prerenderTree", () => {
  it("puts the title first and the root README before the folders", () => {
    const html = prerenderTree(
      [folder("projects", [md("projects/a.md", "# Project A")]), md("README.md", "# Hello")],
      "Tom Weise",
    );
    expect(html.indexOf("Tom Weise")).toBeLessThan(html.indexOf("Hello"));
    expect(html.indexOf("Hello")).toBeLessThan(html.indexOf("Project A"));
    expect(html).toMatch(/^<main class="prerender">/);
  });

  it("names each folder by its path", () => {
    const html = prerenderTree(
      [folder("projects", [folder("demos", [md("projects/demos/a.md", "text")])])],
      "t",
    );
    expect(html).toContain("<h2>projects</h2>");
    expect(html).toContain("<h2>projects/demos</h2>");
  });

  it("renders only markdown, and skips folders that hold none", () => {
    const html = prerenderTree(
      [
        folder("legal", [
          { kind: "file", name: "imprint.html", path: "legal/imprint.html", type: "html", content: "<p>Impressum</p>" },
        ]),
        md("README.md", "readme"),
      ],
      "t",
    );
    expect(html).not.toContain("Impressum");
    expect(html).not.toContain("legal");
  });

  it("turns images into their alt text and drops what would load or run", () => {
    const html = prerenderTree(
      [
        md(
          "a.md",
          [
            "![React](https://img.shields.io/badge/React-555)",
            '<img src="logo.jpg" alt="Eschbach">',
            '<video controls><source src="demo.mp4">Your browser does not support the video tag.</video>',
            "<style>.x { color: red }</style>",
            "<script>alert(1)</script>",
          ].join("\n\n"),
        ),
      ],
      "t",
    );
    expect(html).toContain("React");
    expect(html).toContain("Eschbach");
    expect(html).not.toMatch(/<(img|video|source|style|script)\b/);
    expect(html).not.toContain("does not support");
    expect(html).not.toContain("color: red");
  });

  it("keeps links off the site and unlinks the ones between files", () => {
    const html = prerenderTree(
      [
        md(
          "a.md",
          '[GitHub](https://github.com/tonix401) <a href="projects/Arch Desktop.md">Cool Projects</a>',
        ),
      ],
      "t",
    );
    expect(html).toContain('<a href="https://github.com/tonix401">GitHub</a>');
    expect(html).toContain("Cool Projects");
    expect(html).not.toContain("Arch Desktop.md");
  });
});
