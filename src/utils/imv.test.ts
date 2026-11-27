import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import { fitScale, imagesBeside, overlayText } from "./imv";

function file(path: string, type: FileNode["type"]): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type, content: "" };
}

const tree: TreeNode[] = [
  file("a.png", "image"),
  file("README.md", "md"),
  {
    kind: "folder",
    name: "pics",
    children: [file("pics/b.png", "image"), file("pics/notes.md", "md"), file("pics/c.svg", "image")],
  },
];

describe("imagesBeside", () => {
  it("lists the images in the file's folder, in tree order", () => {
    expect(imagesBeside(tree, "pics/c.svg").map((f) => f.path)).toEqual(["pics/b.png", "pics/c.svg"]);
    expect(imagesBeside(tree, "a.png").map((f) => f.path)).toEqual(["a.png"]);
  });
});

describe("fitScale", () => {
  const image = { width: 400, height: 200 };
  const view = { width: 200, height: 200 };

  it("draws each mode as imv does", () => {
    expect(fitScale("none", image, view)).toBe(1);
    expect(fitScale("shrink", image, view)).toBe(0.5);
    expect(fitScale("full", image, view)).toBe(0.5);
    expect(fitScale("crop", image, view)).toBe(1);
  });

  it("only scales up when the mode allows it", () => {
    const small = { width: 50, height: 50 };
    expect(fitScale("shrink", small, view)).toBe(1);
    expect(fitScale("full", small, view)).toBe(4);
  });
});

describe("overlayText", () => {
  it("reads like imv's default overlay", () => {
    expect(overlayText(0, 3, "a.png", { width: 800, height: 600 }, 0.5, "full")).toBe(
      "[1/3] [800x600] [50%] a.png [scale to fit]",
    );
  });
});
