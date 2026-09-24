/**
 * Obsidian's graph view: every note, every folder, and what links them.
 *
 * The layout is computed once, in unit coordinates, and drawn in a viewBox
 * of the same units, so it scales to any window without being laid out again.
 * Hovering a node does what Obsidian's does — its neighbours and their edges
 * light up, everything else fades back — and clicking a note opens it.
 */

import { useMemo, useState } from "react";
import { type FileNode } from "../../services/types";
import { type Graph, layoutGraph } from "../../utils/graph";

interface GraphViewProps {
  graph: Graph;
  /** The note that is open, drawn in the accent. */
  current: string | null;
  onOpen: (file: FileNode) => void;
}

/** Room round the unit square for the labels under the outermost nodes. */
const VIEWBOX = "-1.18 -1.14 2.36 2.36";

export function GraphView({ graph, current, onOpen }: GraphViewProps) {
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const [hovered, setHovered] = useState<string | null>(null);

  // How many edges each node has: a node is drawn bigger the more it connects.
  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { source, target } of graph.edges) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    return counts;
  }, [graph]);

  // The hovered node and everything one edge away from it.
  const lit = useMemo(() => {
    if (!hovered) return null;
    const ids = new Set([hovered]);
    for (const { source, target } of graph.edges) {
      if (source === hovered) ids.add(target);
      if (target === hovered) ids.add(source);
    }
    return ids;
  }, [hovered, graph]);

  return (
    <svg
      className={`obs-graph${lit ? " obs-graph--focus" : ""}`}
      viewBox={VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Graph of notes and folders"
    >
      <g className="obs-graph-edges">
        {graph.edges.map((edge, i) => {
          const a = layout.get(edge.source);
          const b = layout.get(edge.target);
          if (!a || !b) return null;
          const on = lit !== null && (edge.source === hovered || edge.target === hovered);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={
                `obs-graph-edge obs-graph-edge--${edge.kind}` + (on ? " obs-graph-edge--lit" : "")
              }
            />
          );
        })}
      </g>

      {graph.nodes.map((node) => {
        const p = layout.get(node.id);
        if (!p) return null;
        // Small, as Obsidian draws them: a node is a point with a label, not a
        // disc, and grows only a little with how much it connects to.
        const r = 0.012 + 0.0035 * Math.min(degree.get(node.id) ?? 0, 6);
        const file = node.file;
        const classes =
          `obs-graph-node obs-graph-node--${node.kind}` +
          (node.id === current ? " obs-graph-node--current" : "") +
          (lit?.has(node.id) ? " obs-graph-node--lit" : "") +
          (node.id === hovered ? " obs-graph-node--hovered" : "");
        return (
          <g
            key={node.id}
            className={classes}
            transform={`translate(${p.x} ${p.y})`}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={file ? () => onOpen(file) : undefined}
            role={file ? "link" : undefined}
            tabIndex={file ? 0 : undefined}
            aria-label={file ? `Open ${node.label}` : undefined}
            onKeyDown={
              file
                ? (event) => {
                    if (event.key === "Enter") onOpen(file);
                  }
                : undefined
            }
          >
            {/* The dot is small, so an invisible disc round it takes the
                pointer, and hovering or clicking does not need a steady hand. */}
            <circle className="obs-graph-hit" r={Math.max(r, 0.035)} />
            <circle className="obs-graph-dot" r={r} />
            <text y={r + 0.042}>{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
