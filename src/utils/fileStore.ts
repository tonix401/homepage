/**
 * The open folder as the apps see it: the tree the build read, plus what the
 * visitor added in this tab — files fetched by kitty's `curl` or dropped on
 * kitty or jīzǐ, folders from `mkdir`, and whatever `cp` and `mv` made of them.
 *
 * Every app reads the tree from here — `useTree()` in a component, `getTree()`
 * anywhere else — and never from `virtual:open-folder-files` directly, so an
 * added file shows up in the explorer, the browser, `ls` and jīzǐ at once.
 *
 * Additions live as long as the desktop does (`session.ts`): a reload keeps
 * them, and a new tab starts without them. The bytes are too big for
 * `sessionStorage`, so they go to IndexedDB, under an id this tab keeps in
 * `sessionStorage`. `main.tsx` waits for `loadAddedFiles` before the first
 * render, so a window showing an added file survives `normalizeArg`.
 *
 * Anything can be added into a folder that exists, and nothing over what the
 * site was built with. The site's own files and folders are root's, and its
 * folders are sticky, as `/tmp` is: anyone may add to them, but only an
 * entry's owner may remove or rename it, so root's can be copied and nothing
 * more. The errors are Linux's: `Operation not permitted` from the sticky
 * bit, `Permission denied` for writing over root's file.
 */

import { useSyncExternalStore } from "react";
import folderFiles from "virtual:open-folder-files";
import { type FileNode, type FileType, type TreeNode } from "../services/types";
import { MAX_TAB_BYTES, classify } from "./fileFilter";
import { baseName, findEntry, mergeTree, parentOf, writeError } from "./fileManager";

/** An added folder as it is stored. */
interface StoredFolder {
  tab: string;
  path: string;
  folder: true;
  modified: string;
}

/** An added file as it is stored. */
interface StoredFile {
  tab: string;
  path: string;
  folder?: undefined;
  type: FileType;
  mime: string;
  modified: string;
  /** Bytes, for a file that was downloaded or dropped; none for a hotlink. */
  size?: number;
  /** An image's bytes. */
  blob?: Blob;
  /** A text file's content. */
  text?: string;
  /** A hotlinked image's address: one CORS kept `curl` from downloading. */
  url?: string;
}

type Stored = StoredFolder | StoredFile;

// ── The store ───────────────────────────────────────────────────────────────

const entries = new Map<string, Stored>();
/** One blob URL per added image, made once and revoked when it goes. */
const blobUrls = new Map<string, string>();
const listeners = new Set<() => void>();
let tree: TreeNode[] = folderFiles;

function toNode(file: StoredFile): FileNode {
  return {
    kind: "file",
    name: baseName(file.path),
    path: file.path,
    type: file.type,
    content: file.text ?? "",
    modified: file.modified,
    added: true,
    ...(file.type === "image" && { src: file.url ?? blobUrls.get(file.path) }),
    ...(file.size !== undefined && { size: file.size }),
  };
}

function put(entry: Stored) {
  drop(entry.path);
  entries.set(entry.path, entry);
  if (!entry.folder && entry.blob) blobUrls.set(entry.path, URL.createObjectURL(entry.blob));
}

function drop(path: string) {
  const url = blobUrls.get(path);
  if (url) URL.revokeObjectURL(url);
  blobUrls.delete(path);
  entries.delete(path);
}

function changed() {
  const all = [...entries.values()];
  tree = mergeTree(
    folderFiles,
    all.flatMap((e) => (e.folder ? [e.path] : [])),
    all.flatMap((e) => (e.folder ? [] : [toNode(e)])),
  );
  for (const listener of listeners) listener();
}

/** Removes `removed`, then adds `added`, in memory and in storage, and tells every app. */
function commit(removed: readonly string[], added: readonly Stored[]) {
  for (const path of removed) drop(path);
  for (const entry of added) put(entry);
  changed();
  void write((store) => {
    for (const path of removed) store.delete([tabId(), path]);
    for (const entry of added) store.put(entry);
  });
}

/** Every added path at `path` or inside it. */
function under(path: string): string[] {
  return [...entries.keys()].filter((p) => p === path || p.startsWith(`${path}/`));
}

/** The whole tree, additions included. A new array after every change. */
export function getTree(): TreeNode[] {
  return tree;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The tree, re-rendering whenever something is added, moved or removed. */
export function useTree(): TreeNode[] {
  return useSyncExternalStore(subscribe, getTree, getTree);
}

/** Bytes the tab already holds, but for the file at `except`, which is about to be replaced. */
function heldBytes(except: string): number {
  let total = 0;
  for (const entry of entries.values()) if (!entry.folder && entry.path !== except) total += entry.size ?? 0;
  return total;
}

const NO_SPACE = "No space left on device (50 MB per tab)";

/**
 * Adds a file from its bytes, replacing an added file at the same path.
 * `contentType` is the server's header, if it came from one.
 */
export function addFile(path: string, bytes: Uint8Array, contentType?: string): { file: FileNode } | { error: string } {
  const blocked = writeError(tree, path);
  if (blocked) return { error: blocked };
  const kind = classify(path, bytes, contentType);
  if ("error" in kind) return kind;
  if (heldBytes(path) + bytes.length > MAX_TAB_BYTES) return { error: NO_SPACE };
  const file: StoredFile = {
    tab: tabId(),
    path,
    type: kind.type,
    mime: kind.mime,
    modified: new Date().toISOString(),
    size: bytes.length,
    ...(kind.type === "image"
      ? { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: kind.mime }) }
      : { text: kind.text }),
  };
  commit([], [file]);
  return { file: toNode(file) };
}

/** Adds an image that stays on its own server, already shown to load. */
export function addLink(path: string, url: string): { file: FileNode } | { error: string } {
  const blocked = writeError(tree, path);
  if (blocked) return { error: blocked };
  const file: StoredFile = { tab: tabId(), path, type: "image", mime: "", modified: new Date().toISOString(), url };
  commit([], [file]);
  return { file: toNode(file) };
}

/** Why a folder cannot be put at `path`: its parent is missing, or something is already there. */
function folderError(path: string): string | null {
  const parent = parentOf(path);
  if (parent !== "" && findEntry(tree, parent)?.node.kind !== "folder") return "No such file or directory";
  return path === "" || findEntry(tree, path) ? "File exists" : null;
}

/**
 * `mkdir`: makes a folder at `path`, and any missing above it — what the
 * real one needs `-p` for. Something already at `path` is an error.
 */
export function makeFolder(path: string): string | null {
  const missing: string[] = [];
  for (let at = path; at !== ""; at = parentOf(at)) {
    const node = findEntry(tree, at)?.node;
    if (node?.kind === "folder") break;
    if (node) return at === path ? "File exists" : "Not a directory";
    missing.unshift(at);
  }
  if (missing.length === 0) return "File exists";
  const modified = new Date().toISOString();
  commit([], missing.map((p): StoredFolder => ({ tab: tabId(), path: p, folder: true, modified })));
  return null;
}

/** What the sticky bit answers anyone removing or renaming an entry they do not own. */
const NOT_OWNER = "Operation not permitted";

/** `rm`: removes an added file, or an added folder with everything in it. */
export function removeEntry(path: string): string | null {
  // Home is in /home, which is root's and not sticky.
  if (path === "") return "Permission denied";
  const node = findEntry(tree, path)?.node;
  if (!node) return "No such file or directory";
  if (!node.added) return NOT_OWNER;
  commit(under(path), []);
  return null;
}

/**
 * `cp`: copies the file or folder at `from`, the site's own included, to
 * `to`. A file replaces an added file there; a folder needs the place empty.
 */
export function copyEntry(from: string, to: string): string | null {
  const node = findEntry(tree, from)?.node;
  if (!node) return "No such file or directory";
  const blocked = node.kind === "folder" ? folderError(to) : writeError(tree, to);
  if (blocked) return blocked;

  const modified = new Date().toISOString();
  const copies: Stored[] = [];
  const collect = (n: TreeNode, src: string, dst: string) => {
    if (n.kind === "folder") {
      copies.push({ tab: tabId(), path: dst, folder: true, modified });
      for (const child of n.children) collect(child, `${src}/${child.name}`, `${dst}/${child.name}`);
      return;
    }
    const own = entries.get(src);
    copies.push(
      own && !own.folder
        ? { ...own, path: dst, modified }
        : // One of the site's files: its text, which is all the build gave it.
          { tab: tabId(), path: dst, type: n.type, mime: "text/plain", modified, text: n.content, size: new TextEncoder().encode(n.content).length },
    );
  };
  collect(node, from, to);
  const bytes = copies.reduce((sum, c) => sum + (c.folder ? 0 : (c.size ?? 0)), 0);
  if (heldBytes(to) + bytes > MAX_TAB_BYTES) return NO_SPACE;
  commit([], copies);
  return null;
}

/** `mv`: moves or renames an added file or folder, replacing an added file at `to`. */
export function moveEntry(from: string, to: string): string | null {
  const node = findEntry(tree, from)?.node;
  if (!node) return "No such file or directory";
  // Replacing root's entry would remove it, which the sticky bit forbids too.
  const there = findEntry(tree, to)?.node;
  if (!node.added || (there && !there.added)) return NOT_OWNER;
  const blocked = node.kind === "folder" ? folderError(to) : writeError(tree, to);
  if (blocked) return blocked;
  const moving = under(from);
  commit(
    moving,
    moving.map((path) => ({ ...entries.get(path)!, path: to + path.slice(from.length) })),
  );
  return null;
}

// ── Persistence ─────────────────────────────────────────────────────────────

const DB_NAME = "homepage-files";
const TAB_KEY = "homepage.tab";
/** A tab not seen for this long is gone, and its files with it. */
const TAB_LIFETIME = 7 * 24 * 60 * 60 * 1000;

let tab: string | null = null;

/** This tab's id, kept in `sessionStorage` so a reload finds its files again. */
function tabId(): string {
  if (tab) return tab;
  try {
    tab = window.sessionStorage.getItem(TAB_KEY);
    if (!tab) {
      tab = crypto.randomUUID();
      window.sessionStorage.setItem(TAB_KEY, tab);
    }
  } catch {
    // Without storage the files last until the page does.
    tab ??= crypto.randomUUID();
  }
  return tab;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("files", { keyPath: ["tab", "path"] });
      req.result.createObjectStore("tabs", { keyPath: "tab" });
    };
    req.onsuccess = () => resolve(req.result);
    // Blocked or private browsing: the files simply do not outlive the page.
    req.onerror = () => resolve(null);
  });
  return db;
}

/** Every key of one tab's files: `[tab, path]` for any path sorts below `[tab, []]`. */
const tabRange = (id: string) => IDBKeyRange.bound([id], [id, []]);

async function write(change: (files: IDBObjectStore) => void) {
  try {
    const conn = await openDb();
    if (!conn) return;
    const tx = conn.transaction(["files", "tabs"], "readwrite");
    change(tx.objectStore("files"));
    tx.objectStore("tabs").put({ tab: tabId(), lastSeen: Date.now() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Could not store an added file:", error);
  }
}

/** Forgets tabs that have not been seen for a week. */
async function prune(conn: IDBDatabase) {
  const tx = conn.transaction(["files", "tabs"], "readwrite");
  const tabs = (await request(tx.objectStore("tabs").getAll())) as { tab: string; lastSeen: number }[];
  for (const old of tabs) {
    if (old.tab === tabId() || Date.now() - old.lastSeen < TAB_LIFETIME) continue;
    tx.objectStore("tabs").delete(old.tab);
    tx.objectStore("files").delete(tabRange(old.tab));
  }
}

/**
 * Brings back the files this tab added before a reload. Resolves — with
 * nothing loaded — rather than rejects when IndexedDB is unavailable.
 */
export async function loadAddedFiles(): Promise<void> {
  try {
    const conn = await openDb();
    if (!conn) return;
    const tx = conn.transaction(["files", "tabs"], "readwrite");
    const stored = (await request(tx.objectStore("files").getAll(tabRange(tabId())))) as Stored[];
    tx.objectStore("tabs").put({ tab: tabId(), lastSeen: Date.now() });
    // A deploy may since have built something of the same name, which wins;
    // one that removed a folder leaves what was in it out of the tree.
    for (const entry of stored) if (!findEntry(folderFiles, entry.path)) put(entry);
    if (stored.length) changed();
    void prune(conn).catch(() => {});
  } catch (error) {
    console.warn("Could not load the added files:", error);
  }
}
