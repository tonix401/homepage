/**
 * Obsidian, as a window: the open folder as a vault.
 *
 * What it adds over Codium is the graph view — every note and folder, tied
 * together by the links between them and the folders they sit in — and a file
 * tree that names notes the way Obsidian does, without their `.md`. A note
 * itself reads exactly as Codium's markdown preview shows it.
 *
 * It keeps Obsidian's own dark look rather than the desktop theme's, the way
 * Codium and Chromium keep theirs. The payload is the open note's path; which
 * view is showing, the sidebar and the expanded folders are the window's own.
 */

import { useMemo, useState } from "react";
import "./Notes.css";
import folderFiles from "virtual:open-folder-files";
import { defaultFile, rootFolderName } from "virtual:open-folder-config";
import { type FileNode, type TreeNode } from "../../services/types";
import { findFileByPath, findDefaultFile, resolvePath } from "../../utils/files";
import { buildGraph, noteName } from "../../utils/graph";
import { isPhone } from "../../utils/phone";
import { FileView } from "../../components/FileView";
import { Icon } from "../../components/Icon";
import { WindowButtons } from "../../components/WindowButtons";
import { GraphView } from "./GraphView";
import { type AppRenderProps } from "../types";

const icons = {
  files: "M4 4h6l2 2h8v13H4zM4 9h16",
  // Three nodes and the edges between them, each edge stopping at the rims.
  graph: "M8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0M13 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 6.8l8-.6M6.8 8.9l3.4 7.2M17 7.7l-5 8.6",
  chevron: "M9 6l6 6-6 6",
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

/** `projects/demos/a.md` -> `["projects", "projects/demos"]`. */
function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function NotesApp({ arg, maximized, handle }: AppRenderProps) {
  const note = arg ? findFileByPath(folderFiles, arg) : findDefaultFile(folderFiles, defaultFile);
  const graph = useMemo(() => buildGraph(folderFiles), []);

  // Opens on the graph: it is the one view the other apps cannot show, so it
  // is what the window leads with. Picking a node or a file reads the note.
  const [view, setView] = useState<"note" | "graph">("graph");
  // A drawer over the graph on a phone (Notes.css), so it starts put away
  // there: the graph is what the window leads with.
  const [sidebar, setSidebar] = useState(() => !isPhone());
  const [openFolders, setOpenFolders] = useState(() => defaultOpenFolders(folderFiles));

  // A note opened from anywhere — the graph, a link, a restored session —
  // reveals itself in the tree, once. Adjusted during the render that notices
  // it, as the browser does its trail, so the tree never lags a frame behind;
  // a folder collapsed by hand afterwards stays collapsed.
  const [revealed, setRevealed] = useState<string | null>(null);
  if (note && note.path !== revealed) {
    setRevealed(note.path);
    const missing = ancestorsOf(note.path).filter((p) => !openFolders.has(p));
    if (missing.length) setOpenFolders(new Set([...openFolders, ...missing]));
  }

  // Plain functions, left to the React Compiler to memoize: a manual
  // `useCallback` here cannot be kept alongside the reveal adjustment above.
  const open = (file: FileNode) => {
    handle.setArg(file.path);
    setView("note");
    // The note is behind the drawer on a phone, so picking one puts it away.
    if (isPhone()) setSidebar(false);
  };

  const followLink = (href: string) => {
    if (!note) return;
    const target = findFileByPath(folderFiles, resolvePath(note.path, href));
    if (target) open(target);
  };

  const resolveFile = (fromPath: string, href: string) =>
    findFileByPath(folderFiles, resolvePath(fromPath, href));

  const toggleFolder = (path: string) => {
    const next = new Set(openFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setOpenFolders(next);
  };

  const tabTitle = view === "graph" ? "Graph view" : note ? noteName(note.name) : "No file";

  return (
    <div className={`obs${maximized ? "" : " obs--windowed"}`}>
      <div className="obs-titlebar">
        <div className="obs-tab">
          <Icon className="obs-tab-icon" path={view === "graph" ? icons.graph : icons.files} />
          <span className="obs-tab-title">{tabTitle}</span>
        </div>
        <WindowButtons handle={handle} maximized={maximized} />
      </div>

      <div className="obs-body">
        <nav className="obs-ribbon" aria-label="Ribbon">
          <button
            className={`obs-ribbon-btn${sidebar ? " obs-ribbon-btn--on" : ""}`}
            onClick={() => setSidebar(!sidebar)}
            aria-label={sidebar ? "Hide files" : "Show files"}
            title="Files"
          >
            <Icon className="obs-ribbon-icon" path={icons.files} />
          </button>
          <button
            className={`obs-ribbon-btn${view === "graph" ? " obs-ribbon-btn--on" : ""}`}
            onClick={() => setView(view === "graph" ? "note" : "graph")}
            aria-label={view === "graph" ? "Back to the note" : "Open graph view"}
            title="Graph view"
          >
            <Icon className="obs-ribbon-icon" path={icons.graph} />
          </button>
        </nav>

        {sidebar && <div className="obs-scrim" aria-hidden="true" onClick={() => setSidebar(false)} />}
        {sidebar && (
          <aside className="obs-sidebar">
            <div className="obs-tree" role="tree" aria-label="Files">
              <Tree
                nodes={folderFiles}
                prefix=""
                current={view === "note" ? (note?.path ?? null) : null}
                openFolders={openFolders}
                onToggle={toggleFolder}
                onOpen={open}
              />
            </div>
            <div className="obs-vault">{rootFolderName.toLowerCase()}</div>
          </aside>
        )}

        <main className="obs-main">
          {view === "graph" ? (
            <GraphView graph={graph} current={note?.path ?? null} onOpen={open} />
          ) : note ? (
            <div className="obs-reading">
              <div className="obs-crumbs">
                {ancestorsOf(note.path).map((p) => (
                  <span key={p} className="obs-crumb">
                    {p.split("/").pop()}
                  </span>
                ))}
                <span className="obs-crumb obs-crumb--note">{noteName(note.name)}</span>
              </div>
              <FileView
                key={note.path}
                file={note}
                mode="preview"
                onNavigate={followLink}
                resolveFile={resolveFile}
              />
            </div>
          ) : (
            <div className="obs-empty">No file is open</div>
          )}
        </main>
      </div>
    </div>
  );
}

interface TreeProps {
  nodes: TreeNode[];
  prefix: string;
  current: string | null;
  openFolders: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (file: FileNode) => void;
}

/**
 * One level of the tree. Each folder's children sit in a container indented
 * from it and drawn with a left border, so nesting is the containers nesting —
 * the indent guides Obsidian draws — and every row, at any depth, is styled the
 * same, its hover and selection inset with it rather than spanning the sidebar.
 */
function Tree({ nodes, prefix, current, openFolders, onToggle, onOpen }: TreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          const isMd = node.type === "md";
          return (
            <div
              key={node.path}
              role="treeitem"
              aria-selected={node.path === current}
              className={`obs-file${node.path === current ? " obs-file--current" : ""}`}
              onClick={() => onOpen(node)}
            >
              <span className="obs-file-name">
                {isMd ? noteName(node.name) : node.name.replace(/\.[^.]+$/, "")}
              </span>
              {/* Obsidian tags anything that is not a note with its extension. */}
              {!isMd && <span className="obs-file-ext">{node.name.split(".").pop()}</span>}
            </div>
          );
        }
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        const isOpen = openFolders.has(path);
        return (
          <div key={path} role="treeitem" aria-expanded={isOpen}>
            <div className="obs-folder" onClick={() => onToggle(path)}>
              <Icon
                className={`obs-folder-chevron${isOpen ? " obs-folder-chevron--open" : ""}`}
                path={icons.chevron}
              />
              <span>{node.name}</span>
            </div>
            {isOpen && (
              <div className="obs-folder-children" role="group">
                <Tree
                  nodes={node.children}
                  prefix={path}
                  current={current}
                  openFolders={openFolders}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
