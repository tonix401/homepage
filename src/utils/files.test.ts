import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import { pageName } from "./files";

function file(path: string): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content: "" };
}

const tree: TreeNode[] = [
  { kind: "folder", name: "projects", children: [file("projects/Homelab.md")] },
  file("README.md"),
];

describe("pageName", () => {
  it("names the file a path points at", () => {
    expect(pageName(tree, "projects/Homelab.md")).toBe("Homelab.md");
  });

  it("names the first file for no path, since that is what gets shown", () => {
    expect(pageName(tree, null)).toBe("Homelab.md");
  });

  it("keeps a missing path's own name, as the browser's error page does", () => {
    expect(pageName(tree, "projects/gone.md")).toBe("gone.md");
  });

  it("is null only when there is nothing to show at all", () => {
    expect(pageName([], null)).toBeNull();
  });
});
