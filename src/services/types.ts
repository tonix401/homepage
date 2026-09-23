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
  | "unsupported";

export interface FileNode {
  kind: "file";
  name: string;
  path: string;
  type: FileType;
  content: string;
}

export interface FolderNode {
  kind: "folder";
  name: string;
  defaultOpen?: boolean;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

export interface CustomActivity {
  name: string;
  iconPath: string;
  title: string;
  text: string;
}

export interface MenuItem {
  label: string;
  /**
   * A file in the open folder, opened **in the window the menu belongs to** —
   * these are not links and never load a page. `null` is the window's default
   * page, which is the first file.
   */
  file?: string | null;
  /** Somewhere off the site; opens a real browser tab. */
  url?: string;
}
