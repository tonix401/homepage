import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import { findDefaultFile, pageName } from "./files";

function file(path: string): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content: "" };
}

const tree: TreeNode[] = [
  { kind: "folder", name: "projects", children: [file("projects/Homelab.md")] },
  file("README.md"),
];

describe("pageName", () => {
  it("names the file a path points at", () => {
    expect(pageName(tree, "projects/Homelab.md", "README.md")).toBe("Homelab.md");
  });

  it("names the default file for no path, since that is what gets shown", () => {
    expect(pageName(tree, null, "README.md")).toBe("README.md");
    expect(pageName(tree, null, null)).toBe("Homelab.md");
  });

  it("keeps a missing path's own name, as the browser's error page does", () => {
    expect(pageName(tree, "projects/gone.md", "README.md")).toBe("gone.md");
  });

  it("is null only when there is nothing to show at all", () => {
    expect(pageName([], null, "README.md")).toBeNull();
  });
});

describe("findDefaultFile", () => {
  it("opens the configured file, even when the tree lists it last", () => {
    expect(findDefaultFile(tree, "README.md")?.path).toBe("README.md");
  });

  it("falls back to the first file with nothing configured", () => {
    expect(findDefaultFile(tree, null)?.path).toBe("projects/Homelab.md");
  });

  it("falls back to the first file when the configured one is missing", () => {
    expect(findDefaultFile(tree, "gone.md")?.path).toBe("projects/Homelab.md");
  });

  it("is null for an empty tree", () => {
    expect(findDefaultFile([], "README.md")).toBeNull();
  });
});
