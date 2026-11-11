#!/usr/bin/env node
/**
 * Lists the links in the open folder's pages, one page at a time:
 *
 *   <path/file>
 *     internal  | line  47 | ↗ projects/Arch Desktop.md
 *     external  | line  21 | ↗ https://github.com/tonix401
 *     not found | line   4 | ↗ skills/x.md
 *
 * An internal link is one the viewer follows in-app, shown as the file it
 * resolves to (the build's link check resolves it the same way); not found is
 * an internal link whose file is not in the folder; external leaves the site
 * (other sites, `mailto:`, absolute paths). `#` anchors and images are not
 * listed. On a terminal that supports it the line number opens the page (at that
 * line), an internal link opens the file it points to and an external one opens
 * its address. The count at the end covers every link, not just the ones listed.
 *
 * Flags go after `--` when run through npm (`npm run links -- -c`), because
 * npm takes any flag before it for itself (`--color`, `-a`, `-h` are all npm
 * options too). Run directly there is no such trap: `./scripts/show-links.ts -c`.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_FOLDER_PATH, collectFileEntries, readConfiguredTree } from "../src/services/FilesConverterService.ts";
import { findLinks } from "../src/services/linkCheck.ts";
import { type TreeNode } from "../src/services/types.ts";
import { isSafeRelativeHref, resolvePath } from "../src/utils/files.ts";
import { configuration } from "../vscode_website.config.ts";
import { glyphs, supportsColor, supportsHyperlinks, supportsUnicode } from "./terminal.ts";

type Status = "internal" | "external" | "not found";

/** `https:`, `mailto:`… an address a terminal can open; `/abs/path` is not one. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const STATUSES: Status[] = ["internal", "external", "not found"];
const COLORS: Record<Status, string> = { internal: "34", external: "32", "not found": "31" };

const HELP = `Lists the links in the open folder's pages, with where each one goes.

Usage: npm run links -- [options]   (or: ./scripts/show-links.ts [options])

  internal   a link to a page in the folder, shown as the file it resolves to
  not found  a link to a page that is not in the folder (the build fails on these)
  external   another site, mailto: or an absolute path

Options (the default is -i -b):
  -a, --all                 show internal, not found and external links
  -i, --internal            show internal links
  -b, --broken, --notfound  show not found links
  -e, --external            show external links
  -c, --color               color the status: internal blue, external green, not found red
  -h, --help                show this help

Options that pick a kind of link add up: \`-e -b\` shows external and not found.`;

const { arrow: ARROW } = glyphs(supportsUnicode(process.env));
let values;
try {
  ({ values } = parseArgs({
    options: {
      all: { type: "boolean", short: "a" },
      internal: { type: "boolean", short: "i" },
      broken: { type: "boolean", short: "b" },
      notfound: { type: "boolean" },
      external: { type: "boolean", short: "e" },
      color: { type: "boolean", short: "c" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (error) {
  console.error(`${error instanceof Error ? error.message : error}\n\n${HELP}`);
  process.exit(2);
}

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const picked = new Set<Status>();
if (values.all) STATUSES.forEach((status) => picked.add(status));
if (values.internal) picked.add("internal");
if (values.broken || values.notfound) picked.add("not found");
if (values.external) picked.add("external");
if (picked.size === 0) {
  picked.add("internal");
  picked.add("not found");
}

const tree = readConfiguredTree(configuration);
const pages: { path: string; content: string }[] = [];
const known = new Set<string>();
const walk = (nodes: TreeNode[]): void => {
  for (const node of nodes) {
    if (node.kind === "folder") walk(node.children);
    else {
      known.add(node.path);
      if (node.type === "md" || node.type === "html") pages.push(node);
    }
  }
};
walk(tree);

// Where each page is on disk, for the links the terminal can open.
const diskPath = new Map(
  collectFileEntries(resolve(configuration.folderPath ?? DEFAULT_FOLDER_PATH)).map((entry) => [entry.path, entry.absPath]),
);

/** The `file://` address of a file in the folder, at `line` if given. */
const fileUrl = (file: string | undefined, line?: number): string | undefined =>
  file === undefined ? undefined : pathToFileURL(file).href + (line === undefined ? "" : `#${line}`);

/**
 * `text` as a terminal hyperlink (OSC 8) to `url`. Only on a
 * terminal known to support it (`supportsHyperlinks`): piped, redirected or on a
 * simple terminal, the output stays plain text. Kitty and most other terminals
 * open it on click (a line fragment needs an open action, see kitty's
 * `open-actions.conf`).
 */
const hyperlink = (text: string, url: string | undefined): string => {
  if (!supportsHyperlinks(process.env, Boolean(process.stdout.isTTY)) || url === undefined) return text;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
};

const width = Math.max(...STATUSES.map((status) => status.length));
const paint = (status: Status): string => {
  const padded = status.padEnd(width);
  return values.color && supportsColor(process.env) ? `\x1b[${COLORS[status]}m${padded}\x1b[0m` : padded;
};

const counts: Record<Status, number> = { internal: 0, external: 0, "not found": 0 };
const sections: { path: string; rows: { line: number; status: Status; shown: string }[] }[] = [];
for (const page of pages) {
  const all = findLinks(page.path, page.content)
    // A same-page anchor goes nowhere else, so it is not worth listing.
    .filter((link) => !link.href.startsWith("#"))
    .map((link) => {
      if (!isSafeRelativeHref(link.href)) return { link, status: "external" as Status, shown: link.href };
      const target = resolvePath(page.path, link.href);
      return { link, status: (known.has(target) ? "internal" : "not found") as Status, shown: target };
    });
  for (const { status } of all) counts[status]++;
  const rows = all.filter((row) => picked.has(row.status));
  if (rows.length === 0) continue;

  sections.push({ path: page.path, rows: rows.map(({ link, status, shown }) => ({ line: link.line, status, shown })) });
}

// One width for every page, so the last column lines up from page to page too.
const lineWidth = Math.max(0, ...sections.flatMap((section) => section.rows.map((row) => String(row.line).length)));
for (const { path, rows } of sections) {
  console.log(path);
  for (const { line, status, shown } of rows) {
    const lineText = hyperlink(`line ${String(line).padStart(lineWidth)}`, fileUrl(diskPath.get(path), line));
    // A link that is not found has nothing to open, and an absolute path has no address of its own.
    const url = status === "internal" ? fileUrl(diskPath.get(shown)) : status === "external" && SCHEME.test(shown) ? shown : undefined;
    const target = hyperlink(`${ARROW} ${shown}`, url);
    console.log(`  ${paint(status)} | ${lineText} | ${target}`);
  }
}

// Every link, whatever was listed above, with a not-found one counted as internal too.
console.log(`\n${counts.internal + counts["not found"]} internal (of which ${counts["not found"]} not found), ${counts.external} external`);
