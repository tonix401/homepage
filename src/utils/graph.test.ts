import { describe, it, expect } from "vitest";
import { type FileNode, type FileType, type TreeNode } from "../services/types";
import { buildGraph, layoutGraph, linksOf, noteName } from "./graph";

function file(path: string, content = "", type: FileType = "md"): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type, content };
}

const readme = file(
  "README.md",
  [
    '<a href="work experience/eschbach.md">Experience</a>',
    "[Arch](projects/Arch%20Desktop.md) and again [Arch](projects/Arch%20Desktop.md#top)",
    "[site](https://example.com) [image](cat.gif) [dead](projects/gone.md) [me](README.md)",
    '<a href="legal/imprint.html">Imprint</a>',
  ].join("\n"),
);

const tree: TreeNode[] = [
  readme,
  { kind: "folder", name: "work experience", children: [file("work experience/eschbach.md")] },
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/Arch Desktop.md", "back [home](../README.md)"),
      { kind: "folder", name: "demos", children: [file("projects/demos/one.md")] },
    ],
  },
  { kind: "folder", name: "legal", children: [file("legal/imprint.html", "", "html")] },
];

describe("noteName", () => {
  it("drops a markdown extension, and only that", () => {
    expect(noteName("Homelab.md")).toBe("Homelab");
    expect(noteName("imprint.html")).toBe("imprint.html");
  });
});

describe("linksOf", () => {
  it("finds markdown links and HTML hrefs, resolved, decoded and each once", () => {
    expect(linksOf(readme, tree).map((f) => f.path)).toEqual([
      "projects/Arch Desktop.md",
      "work experience/eschbach.md",
      "legal/imprint.html",
    ]);
  });

  it("skips outside sites, files not in the tree, dead links and itself", () => {
    const paths = linksOf(readme, tree).map((f) => f.path);
    expect(paths).not.toContain("README.md");
    expect(paths).not.toContain("projects/gone.md");
  });

  it("resolves relative to the linking file", () => {
    const arch = tree[2].kind === "folder" ? (tree[2].children[0] as FileNode) : null;
    expect(linksOf(arch!, tree).map((f) => f.path)).toEqual(["README.md"]);
  });
});

describe("buildGraph", () => {
  const graph = buildGraph(tree);

  it("has a node for every file and every folder", () => {
    expect(graph.nodes.filter((n) => n.kind === "file")).toHaveLength(5);
    expect(graph.nodes.filter((n) => n.kind === "folder").map((n) => n.id)).toEqual([
      "folder:work experience",
      "folder:projects",
      "folder:projects/demos",
      "folder:legal",
    ]);
  });

  it("ties each folder to what it holds, nested folders included", () => {
    const folderEdges = graph.edges.filter((e) => e.kind === "folder");
    expect(folderEdges).toContainEqual({
      source: "folder:projects",
      target: "folder:projects/demos",
      kind: "folder",
    });
    expect(folderEdges).toContainEqual({
      source: "folder:projects/demos",
      target: "projects/demos/one.md",
      kind: "folder",
    });
    // Files at the root belong to no folder node.
    expect(folderEdges.some((e) => e.target === "README.md")).toBe(false);
  });

  it("draws every link as an edge from the linking file", () => {
    const links = graph.edges.filter((e) => e.kind === "link");
    expect(links).toHaveLength(4);
    expect(links).toContainEqual({ source: "projects/Arch Desktop.md", target: "README.md", kind: "link" });
  });
});

describe("layoutGraph", () => {
  const graph = buildGraph(tree);
  const layout = layoutGraph(graph);

  it("places every node inside [-1, 1], filling it", () => {
    expect(layout.size).toBe(graph.nodes.length);
    const coords = [...layout.values()].flatMap((p) => [p.x, p.y]);
    for (const c of coords) {
      expect(Number.isFinite(c)).toBe(true);
      expect(Math.abs(c)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(Math.max(...coords.map(Math.abs))).toBeCloseTo(1);
  });

  it("comes out the same every time", () => {
    expect([...layoutGraph(graph)]).toEqual([...layout]);
  });

  it("keeps a file closer to its own folder than to an unrelated one", () => {
    const d = (a: string, b: string) =>
      Math.hypot(layout.get(a)!.x - layout.get(b)!.x, layout.get(a)!.y - layout.get(b)!.y);
    expect(d("projects/demos/one.md", "folder:projects/demos")).toBeLessThan(
      d("projects/demos/one.md", "folder:legal"),
    );
  });

  it("copes with nothing, and with one node", () => {
    expect(layoutGraph({ nodes: [], edges: [] }).size).toBe(0);
    expect(layoutGraph({ nodes: [{ id: "a", kind: "file", label: "a" }], edges: [] }).get("a")).toEqual({ x: 0, y: 0 });
  });
});
