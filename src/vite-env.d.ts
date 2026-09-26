/// <reference types="vite/client" />

declare module "virtual:open-folder-files" {
  import { type TreeNode } from "./services/types";
  const tree: TreeNode[];
  export default tree;
}

declare module "virtual:open-folder-langs" {
  import type { LanguageInput } from "@shikijs/types";
  const langs: LanguageInput[];
  export default langs;
}

declare module "virtual:git-log" {
  import { type Commit } from "./services/gitLog";
  /** Every commit, newest first. */
  export const commits: Commit[];
  /** The checked-out branch, or null on a detached HEAD. */
  export const branch: string | null;
  /** The repository on GitHub, from the `origin` remote, or null. */
  export const repoUrl: string | null;
}

declare module "virtual:open-folder-config" {
  import { type CustomActivity, type MenuItem } from "./services/types";
  export const searchBarText: string;
  export const rootFolderName: string;
  export const activities: CustomActivity[];
  export const menuItems: MenuItem[];
  export const foldersFirst: boolean;
  /** The path windows open on when given none, or null for the first file. */
  export const defaultFile: string | null;
}
