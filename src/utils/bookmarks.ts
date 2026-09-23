/**
 * The browser's bookmarks bar, as data.
 *
 * Two sources feed one bar: the open folder itself — its folders become
 * dropdowns and its files become bookmarks inside them — and the configured
 * `menuItems`, which keep their place at the right-hand end. Both arrive here
 * as the same `Bookmark` union so `BookmarkBar` renders one kind of thing.
 *
 * Kept free of React and of the virtual modules, like `files.ts` beside it:
 * every function takes the tree it should read, so the tests can hand it one.
 */

import { type FileType, type MenuItem, type TreeNode } from "../services/types";
import { findFileByPath, findFirstFile } from "./files";

export type Bookmark =
  /** A file in the open folder. Opening it calls `setArg(path)`. */
  | { kind: "page"; label: string; path: string | null; type: FileType }
  /** Somewhere off the site. Opening it opens a real browser tab. */
  | { kind: "link"; label: string; url: string }
  /** A folder, which is a dropdown rather than a destination. */
  | { kind: "folder"; label: string; path: string; children: Bookmark[] };

/**
 * A bar is short and a file name is long, so the extension goes: `eschbach.md`
 * reads as `eschbach`. Only the label is trimmed — `path` is what `setArg`
 * needs and has to stay exactly what the tree calls it.
 */
function labelOf(name: string): string {
  return name.replace(/\.(md|html)$/i, "");
}

/**
 * The open folder as bookmarks, in tree order.
 *
 * `FolderNode` carries no path of its own, so the prefix is threaded down the
 * way `Explorer` does it. A folder's path is only ever a key — which dropdown
 * is open — and never somewhere the browser navigates to.
 */
export function bookmarksFromTree(nodes: TreeNode[], prefix = ""): Bookmark[] {
  return nodes.map((node) => {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    return node.kind === "file"
      ? { kind: "page", label: labelOf(node.name), path: node.path, type: node.type }
      : { kind: "folder", label: node.name, path, children: bookmarksFromTree(node.children, path) };
  });
}

/**
 * The configured menu items as bookmarks.
 *
 * A `file` needs its node looked up for the icon; `file: null` means the
 * window's default page, which is the first file. An item with neither a file
 * nor a url is a label with nothing behind it — the bar used to render those
 * greyed out, but it now carries the whole site as well, so they are dropped
 * rather than taking up room.
 */
export function bookmarksFromMenu(items: MenuItem[], nodes: TreeNode[]): Bookmark[] {
  const bookmarks: Bookmark[] = [];
  for (const { label, file, url } of items) {
    if (url !== undefined) {
      bookmarks.push({ kind: "link", label, url });
    } else if (file !== undefined) {
      const node = file === null ? findFirstFile(nodes) : findFileByPath(nodes, file);
      bookmarks.push({ kind: "page", label, path: file, type: node?.type ?? "unsupported" });
    }
  }
  return bookmarks;
}
