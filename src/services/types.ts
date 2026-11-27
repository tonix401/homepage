export type FileType =
  | "html"
  | "css"
  | "js"
  | "ts"
  | "tsx"
  | "jsx"
  | "md"
  | "py"
  | "json"
  | "yaml"
  | "rs"
  | "go"
  | "sh"
  | "php"
  | "rb"
  | "c"
  | "cpp"
  | "java"
  | "sql"
  | "xml"
  | "toml"
  | "vue"
  | "svelte"
  /** Never from the build: only a visitor's added files are images. */
  | "image"
  | "unsupported";

export interface FileNode {
  kind: "file";
  name: string;
  path: string;
  type: FileType;
  /** The text; `""` for an image, whose pixels are at `src`. */
  content: string;
  /**
   * When it last changed, ISO 8601: its last commit, or its mtime when it has
   * none yet. Missing in trees built by hand, as the tests build them.
   */
  modified?: string;
  /**
   * Added by the visitor in this tab (`utils/fileStore.ts`), not built into
   * the site: `rm` may remove it, and its markdown renders without raw HTML.
   */
  added?: boolean;
  /** An image's address: a blob URL, or the remote one for a hotlinked image. */
  src?: string;
  /** Bytes, when known — not for a hotlinked image. */
  size?: number;
}

export interface FolderNode {
  kind: "folder";
  name: string;
  defaultOpen?: boolean;
  children: TreeNode[];
  /** Made by the visitor in this tab (`mkdir`, `cp`, `mv`), as `FileNode.added`. */
  added?: boolean;
}

export type TreeNode = FileNode | FolderNode;

/** A panel the app draws itself, in place of an activity's markdown. */
export type BuiltinPanel = "search" | "source-control" | "run-and-debug";

export interface CustomActivity {
  name: string;
  iconPath: string;
  title: string;
  text: string;
  panel?: BuiltinPanel;
}

export interface MenuItem {
  label: string;
  /**
   * A file in the open folder, opened **in the window the menu belongs to** —
   * these are not links and never load a page. `null` is the window's default
   * page, the `defaultFile` option.
   */
  file?: string | null;
  /** Somewhere off the site; opens a real browser tab. */
  url?: string;
}
