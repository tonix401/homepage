/**
 * Finding links in the open folder's pages that lead nowhere.
 *
 * A link is resolved exactly as the viewer resolves it on click (`resolvePath`
 * against the file it sits in, then an exact match in the tree), so a link
 * this reports is one that would land on the not-found page. A link the viewer
 * does not follow in-app (`isSafeRelativeHref`: another site, `mailto:`, a
 * same-page anchor, an absolute path) is not in the open folder and is not
 * checked. Images are not links: they point into `public/`.
 *
 * Pure, so the build step and the tests share it.
 */

import { isSafeRelativeHref, resolvePath } from "../utils/files.ts";

export interface PageSource {
  /** The path as the explorer shows it, e.g. "projects/Homelab.md". */
  path: string;
  content: string;
}

export interface Link {
  href: string;
  /** 1-based line of the link in the page. */
  line: number;
}

export interface BrokenLink extends Link {
  from: string;
}

const HTML_HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]*))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const FENCE = /^ {0,3}(`{3,}|~{3,}).*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
const INLINE_CODE = /(`+)[^`]*?\1/g;

/** `text` with every match of `pattern` blanked out, so offsets and lines stay put. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, " "));
}

/** Every link written in a page, in the order they appear. */
export function findLinks(path: string, content: string): Link[] {
  const linksIn = (text: string, pattern: RegExp): Link[] =>
    [...text.matchAll(pattern)].map((m) => ({
      href: m[1] ?? m[2],
      line: text.slice(0, m.index).split("\n").length,
    }));
  if (path.endsWith(".html")) return linksIn(content, HTML_HREF);

  // Code shows links, it does not make them.
  const prose = blank(blank(content, FENCE), INLINE_CODE);
  const links = [
    ...linksIn(prose, HTML_HREF),
    ...linksIn(blank(prose, MARKDOWN_IMAGE), MARKDOWN_LINK),
  ];
  return links.sort((a, b) => a.line - b.line);
}

/** The links in `pages` that point at a file `known` does not contain. */
export function findBrokenLinks(pages: PageSource[], known: ReadonlySet<string>): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const page of pages) {
    if (!page.path.endsWith(".md") && !page.path.endsWith(".html")) continue;
    for (const link of findLinks(page.path, page.content)) {
      if (!isSafeRelativeHref(link.href)) continue;
      if (!known.has(resolvePath(page.path, link.href))) broken.push({ from: page.path, ...link });
    }
  }
  return broken;
}
