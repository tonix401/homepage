import { describe, it, expect } from "vitest";
import { type FileNode, type FileType, type TreeNode } from "../services/types";
import { type Bookmark, bookmarksFromMenu, bookmarksFromTree } from "./bookmarks";

function file(path: string, type: FileType = "md"): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type, content: "" };
}

const tree: TreeNode[] = [
  file("README.md"),
  {
    kind: "folder",
    name: "work experience",
    children: [file("work experience/eschbach.md")],
  },
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/Homelab.md"),
      { kind: "folder", name: "demos", children: [file("projects/demos/one.md")] },
    ],
  },
  {
    kind: "folder",
    name: "legal",
    children: [file("legal/imprint.html", "html")],
  },
];

/** The union is a discriminated one, so narrowing beats a cast in every test. */
function folder(bookmark: Bookmark) {
  if (bookmark.kind !== "folder") throw new Error(`expected a folder, got ${bookmark.kind}`);
  return bookmark;
}

// ── bookmarksFromTree ───────────────────────────────────────────────────────

describe("bookmarksFromTree", () => {
  it("keeps tree order, with files as pages and folders as folders", () => {
    expect(bookmarksFromTree(tree).map((b) => [b.kind, b.label])).toEqual([
      ["page", "README"],
      ["folder", "work experience"],
      ["folder", "projects"],
      ["folder", "legal"],
    ]);
  });

  it("drops the extension from a label but never from the path", () => {
    const [readme] = bookmarksFromTree(tree);
    expect(readme).toEqual({ kind: "page", label: "README", path: "README.md", type: "md" });
  });

  it("drops .html too", () => {
    const [imprint] = folder(bookmarksFromTree(tree)[3]).children;
    expect(imprint).toEqual({
      kind: "page",
      label: "imprint",
      path: "legal/imprint.html",
      type: "html",
    });
  });

  it("threads the prefix through nested folders", () => {
    const projects = folder(bookmarksFromTree(tree)[2]);
    expect(projects.path).toBe("projects");
    const demos = folder(projects.children[1]);
    expect(demos.path).toBe("projects/demos");
    expect(demos.children).toEqual([
      { kind: "page", label: "one", path: "projects/demos/one.md", type: "md" },
    ]);
  });

  it("keeps an empty folder, as an empty dropdown", () => {
    const empty: TreeNode[] = [{ kind: "folder", name: "drafts", children: [] }];
    expect(bookmarksFromTree(empty)).toEqual([
      { kind: "folder", label: "drafts", path: "drafts", children: [] },
    ]);
  });
});

// ── bookmarksFromMenu ───────────────────────────────────────────────────────

describe("bookmarksFromMenu", () => {
  it("turns a url into a link and a file into a page", () => {
    expect(
      bookmarksFromMenu(
        [
          { label: "Github", url: "https://github.com/tonix401" },
          { label: "Resume", file: "work experience/eschbach.md" },
        ],
        tree,
      ),
    ).toEqual([
      { kind: "link", label: "Github", url: "https://github.com/tonix401" },
      { kind: "page", label: "Resume", path: "work experience/eschbach.md", type: "md" },
    ]);
  });

  it("resolves a null file — the home page — to the first file", () => {
    expect(bookmarksFromMenu([{ label: "Home", file: null }], tree)).toEqual([
      { kind: "page", label: "Home", path: null, type: "md" },
    ]);
  });

  it("keeps a file that has left the tree, so the browser can say so", () => {
    expect(bookmarksFromMenu([{ label: "Gone", file: "nowhere.md" }], tree)).toEqual([
      { kind: "page", label: "Gone", path: "nowhere.md", type: "unsupported" },
    ]);
  });

  it("skips an item with neither a file nor a url", () => {
    expect(bookmarksFromMenu([{ label: "File" }, { label: "Home", file: null }], tree)).toEqual([
      { kind: "page", label: "Home", path: null, type: "md" },
    ]);
  });
});
