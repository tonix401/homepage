/**
 * The open folder as static HTML, written into `#root` at build time so a
 * crawler that runs no JavaScript still finds the site's text. React replaces
 * it on mount, and until then `.prerender` in `index.html` keeps it visually
 * hidden, so a visitor never sees it.
 *
 * Only markdown is rendered. Anything that would make the browser fetch
 * something while the page is still loading is dropped: images become their
 * alt text, and videos, styles and scripts go entirely. Links between files
 * lose their anchor, because a file has no URL of its own to point at.
 */
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { FileNode, FolderNode, TreeNode } from "./types.ts";

const dropped = () => null;

const components: Components = {
  img: ({ alt }) => alt ?? null,
  a: ({ href, children }) =>
    href && /^(https?:|mailto:)/i.test(href)
      ? createElement("a", { href }, children)
      : createElement(Fragment, null, children),
  video: dropped,
  audio: dropped,
  iframe: dropped,
  style: dropped,
  script: dropped,
};

function article(file: FileNode): ReactNode {
  return createElement(
    "article",
    { key: file.path },
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeRaw],
      components,
      children: file.content,
    }),
  );
}

function isMarkdown(node: TreeNode): boolean {
  return node.kind === "file" && node.type === "md";
}

/** A folder, and every folder inside it, with no markdown anywhere in it. */
function isEmpty(folder: FolderNode): boolean {
  return folder.children.every((child) =>
    child.kind === "folder" ? isEmpty(child) : !isMarkdown(child),
  );
}

function nodes(children: TreeNode[], prefix: string): ReactNode[] {
  return children.flatMap((child): ReactNode[] => {
    if (child.kind === "file") return isMarkdown(child) ? [article(child)] : [];
    if (isEmpty(child)) return [];
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    return [
      createElement(
        "section",
        { key: path },
        createElement("h2", null, path),
        ...nodes(child.children, path),
      ),
    ];
  });
}

/**
 * The tree as one `<main>`: the title, the root README first because it is
 * the landing page, then every folder as a section named by its path.
 */
export function prerenderTree(tree: TreeNode[], title: string): string {
  const readme = tree.filter(
    (node) => isMarkdown(node) && node.name.toLowerCase() === "readme.md",
  );
  const rest = tree.filter((node) => !readme.includes(node));
  return renderToStaticMarkup(
    createElement(
      "main",
      { className: "prerender" },
      createElement("h1", null, title),
      ...nodes(readme, ""),
      ...nodes(rest, ""),
    ),
  );
}
