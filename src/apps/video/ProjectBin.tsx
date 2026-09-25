/**
 * Kdenlive's Project Bin: the open folder as the project's clips, in folders
 * of their own, each clip with its duration. The search box filters by name,
 * as the real one does, and picking a clip moves the playhead to its start.
 */

import { useState } from "react";
import { type TreeNode } from "../../services/types";
import { type Clip, type Timeline, formatTimecode } from "../../utils/timeline";
import { Icon } from "../../components/Icon";

const icons = {
  chevron: "M9 6l6 6-6 6",
  folder: "M3 6h6l2 2h10v11H3z",
  // A strip of film: the frame, and the sprocket holes down both edges.
  clip: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  audio: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5",
};

/** Every folder the tree marks as starting open, by path. */
function defaultOpenFolders(nodes: TreeNode[], prefix = ""): Set<string> {
  const open = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.defaultOpen !== false) open.add(path);
    for (const child of defaultOpenFolders(node.children, path)) open.add(child);
  }
  return open;
}

/** Does anything in this subtree match the filter? */
function hasMatch(node: TreeNode, filter: string): boolean {
  if (node.kind === "file") return node.name.toLowerCase().includes(filter);
  return node.children.some((child) => hasMatch(child, filter));
}

interface ProjectBinProps {
  tree: TreeNode[];
  timeline: Timeline;
  currentPath: string | null;
  onOpen: (clip: Clip) => void;
}

export function ProjectBin({ tree, timeline, currentPath, onOpen }: ProjectBinProps) {
  const [filter, setFilter] = useState("");
  const [openFolders, setOpenFolders] = useState(() => defaultOpenFolders(tree));

  const clipOf = new Map(timeline.clips.map((c) => [c.file.path, c]));
  const query = filter.trim().toLowerCase();

  const toggle = (path: string) => {
    const next = new Set(openFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setOpenFolders(next);
  };

  const rows = (nodes: TreeNode[], prefix: string, depth: number) =>
    nodes
      .filter((node) => !query || hasMatch(node, query))
      .map((node) => {
        const indent = { paddingLeft: 6 + depth * 14 };
        if (node.kind === "file") {
          const clip = clipOf.get(node.path);
          if (!clip) return null;
          const current = node.path === currentPath;
          return (
            <div
              key={node.path}
              role="treeitem"
              aria-selected={current}
              className={`kd-bin-clip${current ? " kd-bin-clip--current" : ""}`}
              style={indent}
              onClick={() => onOpen(clip)}
            >
              <span className="kd-bin-thumb">
                <Icon className="kd-bin-thumb-icon" path={icons.clip} />
              </span>
              <span className="kd-bin-text">
                <span className="kd-bin-name">{node.name}</span>
                <span className="kd-bin-duration">{formatTimecode(clip.duration)}</span>
              </span>
            </div>
          );
        }
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        // A search shows every match, whatever was folded before it.
        const open = query !== "" || openFolders.has(path);
        return (
          <div key={path} role="treeitem" aria-expanded={open}>
            <div className="kd-bin-folder" style={indent} onClick={() => toggle(path)}>
              <Icon className={`kd-bin-chevron${open ? " kd-bin-chevron--open" : ""}`} path={icons.chevron} />
              <Icon className="kd-bin-folder-icon" path={icons.folder} />
              <span className="kd-bin-name">{node.name}</span>
            </div>
            {open && <div role="group">{rows(node.children, path, depth + 1)}</div>}
          </div>
        );
      });

  return (
    <div className="kd-bin">
      <div className="kd-bin-toolbar" aria-hidden="true">
        <Icon className="kd-tool-icon kd-tool-icon--on" path={icons.list} />
        <Icon className="kd-tool-icon" path={icons.clip} />
        <Icon className="kd-tool-icon" path={icons.audio} />
        <Icon className="kd-tool-icon" path={icons.star} />
      </div>
      <label className="kd-bin-search">
        <Icon className="kd-bin-search-icon" path={icons.search} />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search…"
          aria-label="Search the project bin"
          spellCheck={false}
        />
      </label>
      <div className="kd-bin-tree" role="tree" aria-label="Project Bin">
        {rows(tree, "", 0)}
      </div>
    </div>
  );
}
