/**
 * Walking and resolving paths in the `virtual:open-folder-files` tree.
 *
 * Kept free of React and of the virtual module itself: every function takes
 * the tree it should look in, so the build step, the apps and the tests can
 * all share them.
 */

import { type FileNode, type TreeNode } from "../services/types";

export function findFirstFile(nodes: TreeNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") return node;
    const found = findFirstFile(node.children);
    if (found) return found;
  }
  return null;
}

/**
 * The page a window opens on when it is given none: the `defaultFile` option,
 * wherever the folder's sort order puts it in the tree. Without the option,
 * or if it names a file that is not there, the first file.
 */
export function findDefaultFile(nodes: TreeNode[], defaultPath: string | null): FileNode | null {
  return (defaultPath ? findFileByPath(nodes, defaultPath) : null) ?? findFirstFile(nodes);
}

export function findFileByPath(nodes: TreeNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.path === path) return node;
    if (node.kind === "folder") {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The name of the page a window with this payload is showing, for its title.
 *
 * `null` is not "nothing": every file app shows the default file for it (see
 * `findDefaultFile`), so the title names that file too. A path that is not in the tree
 * keeps its own last segment — the browser shows its error page for exactly
 * that name, and the title should agree with the address bar.
 */
export function pageName(nodes: TreeNode[], path: string | null, defaultPath: string | null): string | null {
  const file = path === null ? findDefaultFile(nodes, defaultPath) : findFileByPath(nodes, path);
  return file?.name ?? path?.split("/").pop() ?? null;
}

/** Resolves a link written inside `fromPath` against the file it links from. */
export function resolvePath(fromPath: string, href: string): string {
  const dir = fromPath.split("/").slice(0, -1);
  for (const part of href.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  return dir.join("/");
}

/**
 * Accepts only relative paths — no scheme (javascript:, http:, etc.), no
 * absolute paths, no same-page anchors. Anything else is not a link into the
 * open folder and must not be followed in-app.
 */
export function isSafeRelativeHref(href: string): boolean {
  return href.length > 0 && !href.startsWith("#") && !href.includes(":") && !href.startsWith("/");
}
