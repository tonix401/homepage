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

declare module "virtual:open-folder-embeddings" {
  /** Embedding width, or 0 when the model has not been prepared. */
  export const dim: number;
  /** One entry per embedded passage, parallel to the rows of `vectors`. */
  export const chunks: {
    path: string;
    line: number;
    endLine: number;
    text: string;
  }[];
  /** Corpus mean vector, subtracted from the query before comparing. */
  export const mean: Float32Array;
  /** int8 document vectors, row-major, `chunks.length * dim` values. */
  export const vectors: Int8Array;
}

declare module "virtual:open-folder-config" {
  import { type CustomActivity, type MenuItem } from "./services/types";
  export const searchBarText: string;
  export const rootFolderName: string;
  export const activities: CustomActivity[];
  export const menuItems: MenuItem[];
  export const windowsDesktop: boolean;
  export const foldersFirst: boolean;
}
