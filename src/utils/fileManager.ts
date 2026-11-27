/**
 * The terminal's file manager, as data: which directory a cursor is in, what
 * that directory holds, and where each keystroke moves the cursor.
 *
 * The window's payload is the path under the cursor — a file or a folder, as
 * the explorer shows it (`projects/Homelab.md`, `work experience`) — and the
 * directory being listed is simply its parent. So a restored window comes back
 * with the same three panes it had, and there is no second piece of state that
 * could disagree with the first.
 *
 * Kept free of React and of the virtual modules, like `files.ts`: every
 * function takes the tree it should read, so the tests can hand it one.
 */

import { type FileNode, type TreeNode } from "../services/types";

/** One row of a listing. `path` is what the window stores as its payload. */
export interface Entry {
  name: string;
  path: string;
  node: TreeNode;
}

/** How the prompt shows a path: the open folder plays the home directory. */
export function homePath(path: string): string {
  return path ? `~/${path}` : "~";
}

/** `projects/Homelab.md` -> `projects`; a root entry -> `""`, the root. */
export function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/**
 * The entries of the directory at `dir`, in tree order, or `null` when there
 * is no such directory. `""` is the root.
 *
 * `FolderNode` carries no path of its own, so paths are built from the names
 * on the way down — the same threading `Explorer` and `bookmarksFromTree` do.
 */
export function listDir(tree: TreeNode[], dir: string): Entry[] | null {
  let nodes = tree;
  if (dir !== "") {
    for (const part of dir.split("/")) {
      const folder = nodes.find((n) => n.kind === "folder" && n.name === part);
      if (!folder || folder.kind !== "folder") return null;
      nodes = folder.children;
    }
  }
  return nodes.map((node) => ({
    name: node.name,
    path: dir ? `${dir}/${node.name}` : node.name,
    node,
  }));
}

/** The entry at `path`, file or folder, or `null` if the tree has none. */
export function findEntry(tree: TreeNode[], path: string): Entry | null {
  return listDir(tree, parentOf(path))?.find((e) => e.path === path) ?? null;
}

/**
 * Where the cursor is: the directory being listed, its entries, and the row
 * the cursor sits on. A payload that names nothing — `null`, or a path that has
 * left the tree — puts the cursor on the first entry of the root.
 */
export function cursorAt(
  tree: TreeNode[],
  path: string | null,
): { dir: string; entries: Entry[]; index: number } {
  if (path !== null) {
    const dir = parentOf(path);
    const entries = listDir(tree, dir);
    const index = entries?.findIndex((e) => e.path === path) ?? -1;
    if (entries && index !== -1) return { dir, entries, index };
  }
  return { dir: "", entries: listDir(tree, "") ?? [], index: 0 };
}

/**
 * The cursor one step `by` rows along its listing, stopping at either end
 * rather than wrapping — a file manager's `j` on the last row stays put.
 */
export function moveCursor(tree: TreeNode[], path: string | null, by: number): string | null {
  const { entries, index } = cursorAt(tree, path);
  if (entries.length === 0) return path;
  return entries[Math.min(Math.max(0, index + by), entries.length - 1)].path;
}

/**
 * Where entering a folder puts the cursor: back on the row it was on when the
 * folder was last left, if that row still exists, otherwise on the first row.
 * `null` for an empty folder, which has nowhere to put it.
 */
export function enterFolder(
  tree: TreeNode[],
  folder: string,
  remembered: string | undefined,
): string | null {
  const entries = listDir(tree, folder);
  if (!entries || entries.length === 0) return null;
  return entries.find((e) => e.path === remembered)?.path ?? entries[0].path;
}

/** The last part of a path: what a file or folder is called. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * `base` with the visitor's own folders and files added where their paths
 * say, after each folder's own entries: the folders first, then the files,
 * each in name order. An added folder may hold more of them; anything whose
 * folder is missing is left out, and `base` itself is never changed. How
 * `utils/fileStore.ts` puts a visitor's additions into the tree.
 */
export function mergeTree(base: readonly TreeNode[], folders: readonly string[], files: readonly FileNode[]): TreeNode[] {
  if (folders.length === 0 && files.length === 0) return base as TreeNode[];
  const inDir = new Map<string, { folders: string[]; files: FileNode[] }>();
  const at = (dir: string) => inDir.get(dir) ?? inDir.set(dir, { folders: [], files: [] }).get(dir)!;
  for (const path of folders) at(parentOf(path)).folders.push(path);
  for (const file of files) at(parentOf(file.path)).files.push(file);
  const walk = (nodes: readonly TreeNode[], dir: string): TreeNode[] => [
    ...nodes.map((node) =>
      node.kind === "folder" ? { ...node, children: walk(node.children, dir ? `${dir}/${node.name}` : node.name) } : node,
    ),
    ...(inDir.get(dir)?.folders ?? [])
      .sort((a, b) => a.localeCompare(b))
      .map((path): TreeNode => ({ kind: "folder", name: baseName(path), defaultOpen: true, added: true, children: walk([], path) })),
    ...(inDir.get(dir)?.files ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  return walk(base, "");
}

/**
 * Why nothing can be written at `path`, or `null` when it can: into a folder
 * that exists, over nothing or over a file the visitor added. The site's own
 * files are root's, `rw-r--r--`, so writing one is refused.
 */
export function writeError(tree: TreeNode[], path: string): string | null {
  const name = baseName(path);
  if (!name || name === "." || name === "..") return "Is a directory";
  const parent = parentOf(path);
  if (parent !== "" && findEntry(tree, parent)?.node.kind !== "folder") return "No such file or directory";
  const node = findEntry(tree, path)?.node;
  if (node?.kind === "folder") return "Is a directory";
  if (node && !node.added) return "Permission denied";
  return null;
}
