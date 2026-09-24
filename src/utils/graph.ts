/**
 * The open folder as a graph, for Obsidian's graph view: which files link to
 * which, where every file sits in the folder tree, and where to draw it all.
 *
 * Links alone would make a sparse picture — the README links to three pages
 * and nothing else links anywhere — so folders are nodes too, each tied to what
 * it holds. The tree shows as clusters and the links run across them.
 *
 * Kept free of React and of the virtual modules, like `files.ts`: every
 * function takes the tree it should read, so the tests can hand it one.
 */

import { type FileNode, type TreeNode } from "../services/types";
import { findFileByPath, isSafeRelativeHref, resolvePath } from "./files";

export interface GraphNode {
  /** A file's path, or `folder:` and the folder's path. */
  id: string;
  kind: "file" | "folder";
  label: string;
  /** The file itself, for opening it; absent on a folder. */
  file?: FileNode;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** A link written in the source file, or a folder holding the target. */
  kind: "link" | "folder";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** How Obsidian names a note: the file name, less a markdown extension. */
export function noteName(name: string): string {
  return name.replace(/\.md$/i, "");
}

/**
 * The files in the tree that `file` links to, in the order it links to them,
 * each once. Markdown links and HTML `href`s both count — the README writes
 * its links as anchors — but only relative ones that land on a file in the
 * tree: an image, an outside site or a dead link is not an edge.
 */
export function linksOf(file: FileNode, tree: TreeNode[]): FileNode[] {
  const hrefs = [
    ...[...file.content.matchAll(/\]\(\s*<?([^)\s>]+)>?\s*\)/g)].map((m) => m[1]),
    ...[...file.content.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  const found: FileNode[] = [];
  for (const raw of hrefs) {
    if (!isSafeRelativeHref(raw)) continue;
    let href = raw.split(/[#?]/)[0];
    try {
      href = decodeURI(href);
    } catch {
      continue;
    }
    const target = findFileByPath(tree, resolvePath(file.path, href));
    if (target && target !== file && !found.includes(target)) found.push(target);
  }
  return found;
}

/** Every file and folder in the tree as a node, with link and folder edges. */
export function buildGraph(tree: TreeNode[]): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const files: FileNode[] = [];

  const visit = (children: TreeNode[], folderId: string | null, prefix: string) => {
    for (const node of children) {
      if (node.kind === "file") {
        nodes.push({ id: node.path, kind: "file", label: noteName(node.name), file: node });
        files.push(node);
        if (folderId) edges.push({ source: folderId, target: node.path, kind: "folder" });
      } else {
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        const id = `folder:${path}`;
        nodes.push({ id, kind: "folder", label: node.name });
        if (folderId) edges.push({ source: folderId, target: id, kind: "folder" });
        visit(node.children, id, path);
      }
    }
  };
  visit(tree, null, "");

  for (const file of files) {
    for (const target of linksOf(file, tree)) {
      edges.push({ source: file.path, target: target.path, kind: "link" });
    }
  }
  return { nodes, edges };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Where to draw each node: a Fruchterman–Reingold force layout — every pair
 * pushes apart, every edge pulls its ends together, a little gravity keeps
 * the unlinked from drifting off — cooled over a fixed number of steps.
 *
 * Deterministic: nodes start evenly round a circle, in order, rather than at
 * random, so the graph comes out the same on every visit and in the tests.
 * The result is fitted into [-1, 1] on both axes, keeping its proportions.
 */
export function layoutGraph(graph: Graph, iterations = 400): Map<string, Point> {
  const n = graph.nodes.length;
  const positions = new Map<string, Point>();
  if (n === 0) return positions;
  if (n === 1) return positions.set(graph.nodes[0].id, { x: 0, y: 0 });

  const pos = graph.nodes.map((_, i) => ({
    x: Math.cos((2 * Math.PI * i) / n),
    y: Math.sin((2 * Math.PI * i) / n),
  }));
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const edges = graph.edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((e): e is readonly [number, number] => e[0] !== undefined && e[1] !== undefined);

  // The ideal edge length for n nodes spread over a 2×2 square.
  const k = 0.9 * Math.sqrt(4 / n);
  const gravity = 0.08;

  for (let step = 0; step < iterations; step++) {
    const temperature = 0.15 * (1 - step / iterations);
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          // Exactly on top of each other: nudge apart along a fixed axis.
          dx = 1e-3;
          dy = 0;
          d = 1e-3;
        }
        const push = (k * k) / d;
        disp[i].x += (dx / d) * push;
        disp[i].y += (dy / d) * push;
        disp[j].x -= (dx / d) * push;
        disp[j].y -= (dy / d) * push;
      }
    }

    for (const [a, b] of edges) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const d = Math.max(Math.hypot(dx, dy), 1e-6);
      const pull = (d * d) / k;
      disp[a].x -= (dx / d) * pull;
      disp[a].y -= (dy / d) * pull;
      disp[b].x += (dx / d) * pull;
      disp[b].y += (dy / d) * pull;
    }

    for (let i = 0; i < n; i++) {
      disp[i].x -= gravity * pos[i].x * n;
      disp[i].y -= gravity * pos[i].y * n;
      const d = Math.hypot(disp[i].x, disp[i].y);
      if (d > 0) {
        const move = Math.min(d, temperature);
        pos[i].x += (disp[i].x / d) * move;
        pos[i].y += (disp[i].y / d) * move;
      }
    }
  }

  // Fit into [-1, 1], centred, the same scale on both axes.
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy, 1e-6);
  graph.nodes.forEach((node, i) => {
    positions.set(node.id, { x: (pos[i].x - cx) / half, y: (pos[i].y - cy) / half });
  });
  return positions;
}
