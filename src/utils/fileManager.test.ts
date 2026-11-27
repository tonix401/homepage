import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import { cursorAt, enterFolder, findEntry, listDir, mergeTree, moveCursor, parentOf, writeError } from "./fileManager";

function file(path: string): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content: "" };
}

const tree: TreeNode[] = [
  file("README.md"),
  {
    kind: "folder",
    name: "work experience",
    children: [file("work experience/eschbach.md"), file("work experience/Edeka.md")],
  },
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/Homelab.md"),
      { kind: "folder", name: "demos", children: [file("projects/demos/one.md")] },
      { kind: "folder", name: "empty", children: [] },
    ],
  },
];

describe("parentOf", () => {
  it("drops the last segment, and a root entry's parent is the root", () => {
    expect(parentOf("projects/demos/one.md")).toBe("projects/demos");
    expect(parentOf("projects")).toBe("");
  });
});

describe("listDir", () => {
  it("lists the root in tree order", () => {
    expect(listDir(tree, "")?.map((e) => e.path)).toEqual([
      "README.md",
      "work experience",
      "projects",
    ]);
  });

  it("threads folder paths down, spaces and all", () => {
    expect(listDir(tree, "projects/demos")?.map((e) => e.path)).toEqual(["projects/demos/one.md"]);
    expect(listDir(tree, "work experience")?.[0].path).toBe("work experience/eschbach.md");
  });

  it("is null for a directory that does not exist, or is a file", () => {
    expect(listDir(tree, "nope")).toBeNull();
    expect(listDir(tree, "README.md")).toBeNull();
  });
});

describe("findEntry", () => {
  it("finds files and folders alike", () => {
    expect(findEntry(tree, "projects/Homelab.md")?.node.kind).toBe("file");
    expect(findEntry(tree, "projects/demos")?.node.kind).toBe("folder");
    expect(findEntry(tree, "projects/missing.md")).toBeNull();
  });
});

describe("cursorAt", () => {
  it("lists the cursor's parent and finds its row", () => {
    const { dir, index } = cursorAt(tree, "projects/demos");
    expect(dir).toBe("projects");
    expect(index).toBe(1);
  });

  it("falls back to the first row of the root for a stale or missing payload", () => {
    for (const path of [null, "gone.md", "gone/away.md"]) {
      expect(cursorAt(tree, path)).toMatchObject({ dir: "", index: 0 });
    }
  });
});

describe("moveCursor", () => {
  it("steps along the listing", () => {
    expect(moveCursor(tree, "README.md", 1)).toBe("work experience");
    expect(moveCursor(tree, "projects", -1)).toBe("work experience");
  });

  it("stops at either end rather than wrapping", () => {
    expect(moveCursor(tree, "projects", 1)).toBe("projects");
    expect(moveCursor(tree, "README.md", -1)).toBe("README.md");
    expect(moveCursor(tree, "README.md", -Infinity)).toBe("README.md");
    expect(moveCursor(tree, "README.md", Infinity)).toBe("projects");
  });

  it("moves from the fallback row when the payload is stale", () => {
    expect(moveCursor(tree, null, 1)).toBe("work experience");
  });
});

describe("enterFolder", () => {
  it("lands on the first row of a folder not visited before", () => {
    expect(enterFolder(tree, "projects", undefined)).toBe("projects/Homelab.md");
  });

  it("returns to the remembered row, if it still exists", () => {
    expect(enterFolder(tree, "projects", "projects/demos")).toBe("projects/demos");
    expect(enterFolder(tree, "projects", "projects/deleted.md")).toBe("projects/Homelab.md");
  });

  it("is null for an empty folder, which has nowhere to put the cursor", () => {
    expect(enterFolder(tree, "projects/empty", undefined)).toBeNull();
  });
});

describe("mergeTree", () => {
  const added = (path: string): FileNode => ({ ...file(path), added: true });

  it("appends added files after a folder's own entries, in name order", () => {
    const merged = mergeTree(tree, [], [added("projects/b.png"), added("projects/a.md"), added("z.txt")]);
    expect(listDir(merged, "")?.map((e) => e.path)).toEqual(["README.md", "work experience", "projects", "z.txt"]);
    expect(listDir(merged, "projects")?.map((e) => e.name)).toEqual(["Homelab.md", "demos", "empty", "a.md", "b.png"]);
  });

  it("leaves out a file whose folder is missing, and never changes the base", () => {
    const merged = mergeTree(tree, ["gone/deeper"], [added("gone/x.md")]);
    expect(merged).toEqual(tree);
    expect(listDir(tree, "projects")).toHaveLength(3);
  });

  it("returns the base itself when nothing was added", () => {
    expect(mergeTree(tree, [], [])).toBe(tree);
  });

  it("puts added folders, and what is in them, before the added files", () => {
    const merged = mergeTree(tree, ["pics", "pics/old", "projects/new"], [added("pics/old/a.png"), added("b.md")]);
    expect(listDir(merged, "")?.map((e) => e.name)).toEqual(["README.md", "work experience", "projects", "pics", "b.md"]);
    expect(listDir(merged, "pics/old")?.map((e) => e.path)).toEqual(["pics/old/a.png"]);
    expect(findEntry(merged, "projects/new")?.node).toMatchObject({ kind: "folder", added: true, children: [] });
  });
});

describe("writeError", () => {
  it("allows a new name in an existing folder, and an added file to be replaced", () => {
    expect(writeError(tree, "new.png")).toBeNull();
    expect(writeError(tree, "projects/demos/new.png")).toBeNull();
    expect(writeError(mergeTree(tree, [], [{ ...file("x.md"), added: true }]), "x.md")).toBeNull();
  });

  it("refuses the site's own files, folders and missing folders", () => {
    expect(writeError(tree, "README.md")).toBe("Permission denied");
    expect(writeError(tree, "projects")).toBe("Is a directory");
    expect(writeError(tree, "nope/x.png")).toBe("No such file or directory");
    expect(writeError(tree, "README.md/x.png")).toBe("No such file or directory");
  });
});
