#!/usr/bin/env node
/**
 * Prints the open folder's tree as the app receives it: what the plugin's
 * `virtual:open-folder-files` module exports, read with the same `readTree`
 * and the same `collapsedFolders` from `vscode_website.config.ts`.
 *
 *   npm run tree                  the tree, names as the explorer shows them; folders that start closed are marked
 *   npm run tree -- --json        (the `--` is needed: npm takes flags before it for itself)
 *                                 the exact JSON the app gets, file contents included
 *   npm run tree -- --json | jq   …for digging, e.g. `jq '.[].name'`
 */

import { DEFAULT_FOLDER_PATH, readConfiguredTree } from "../src/services/FilesConverterService.ts";
import { type TreeNode } from "../src/services/types.ts";
import { configuration } from "../vscode_website.config.ts";
import { glyphs, supportsUnicode } from "./terminal.ts";

const folderPath = configuration.folderPath ?? DEFAULT_FOLDER_PATH;
const tree = readConfiguredTree(configuration);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(tree, null, 2));
} else {
  const chars = glyphs(supportsUnicode(process.env));
  // Rows first, printed after, so the metadata can line up in one column.
  const rows: { label: string; meta: string }[] = [
    { label: `${configuration.rootFolderName ?? "."}/`, meta: `(${folderPath})` },
  ];
  const collect = (nodes: TreeNode[], indent: string): void => {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      const label = `${indent}${last ? chars.last : chars.branch}${node.name}`;
      if (node.kind === "folder") {
        rows.push({ label: `${label}/`, meta: node.defaultOpen ? "" : "(collapsed)" });
        collect(node.children, indent + (last ? chars.space : chars.pipe));
      } else {
        const bytes = Buffer.byteLength(node.content);
        rows.push({ label, meta: `(${node.type}, ${bytes} B, path "${node.path}")` });
      }
    });
  };
  collect(tree, "");

  const width = Math.max(...rows.map((row) => row.label.length));
  for (const { label, meta } of rows) console.log(`${label.padEnd(width)}  ${meta}`.trimEnd());
}
