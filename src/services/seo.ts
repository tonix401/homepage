/**
 * Everything a search engine or a link preview reads, generated at build time
 * rather than kept by hand: the `<head>` tags, `robots.txt` and
 * `sitemap.xml`.
 *
 * The site's address comes from `public/CNAME` — the file GitHub Pages
 * already needs to serve the custom domain — so it is written down once. The
 * sitemap's `lastmod` is the date of the last commit to touch the open folder,
 * which is when the page's content last changed; CI checks out the full
 * history for exactly this.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";

export interface SeoOptions {
  /** The site's name: the preview title, and the schema.org `WebSite`. */
  title: string;
  /** The search result snippet, and the preview's description. */
  description: string;
  /** Under `publicDir`; its size is `OG_IMAGE_SIZE`. */
  image: string;
  imageAlt: string;
  locale: string;
  /** schema.org `Person` fields; `url` and `image` are filled in. */
  person: { name: string } & Record<string, unknown>;
  /** Whose last commit dates the sitemap — where the page's content lives. */
  contentDir: string;
}

/** What `scripts/generate-og-image.ts` captures, and what the tags declare. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** `tomweise.dev` → `https://tomweise.dev/` */
export function siteUrlFromCname(cname: string): string {
  const host = cname.trim().split(/\s+/)[0];
  if (!host) throw new Error("public/CNAME is empty");
  return `https://${host}/`;
}

export function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`;
}

export function sitemapXml(siteUrl: string, lastmod: string | null): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url>`,
    `    <loc>${siteUrl}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    `  </url>`,
    `</urlset>`,
    ``,
  ].join("\n");
}

/** JSON inside `<script>`: a `</script>` in any string would end the element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

export function headTags(options: SeoOptions, siteUrl: string): HtmlTagDescriptor[] {
  const image = new URL(options.image, siteUrl).href;
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
    tag: "meta",
    attrs,
    injectTo: "head",
  });
  const og = (property: string, content: string | number) =>
    meta({ property: `og:${property}`, content: String(content) });

  return [
    meta({ name: "description", content: options.description }),
    meta({ name: "author", content: options.person.name }),
    { tag: "link", attrs: { rel: "canonical", href: siteUrl }, injectTo: "head" },
    og("type", "website"),
    og("site_name", options.title),
    og("title", options.title),
    og("description", options.description),
    og("url", siteUrl),
    og("image", image),
    og("image:width", OG_IMAGE_SIZE.width),
    og("image:height", OG_IMAGE_SIZE.height),
    og("image:alt", options.imageAlt),
    og("locale", options.locale),
    meta({ name: "twitter:card", content: "summary_large_image" }),
    {
      tag: "script",
      attrs: { type: "application/ld+json" },
      children: scriptJson({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: options.title, url: siteUrl },
          { "@type": "Person", url: siteUrl, image, ...options.person },
        ],
      }),
      injectTo: "head",
    },
  ];
}

/** `YYYY-MM-DD` of the last commit touching `path`, or null outside git. */
function lastCommitDate(path: string): string | null {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", path], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return date || null;
  } catch {
    return null;
  }
}

export function seoPlugin(options: SeoOptions): Plugin {
  let siteUrl = "";
  return {
    name: "seo",
    configResolved(config) {
      const cname = resolve(config.publicDir, "CNAME");
      if (!existsSync(cname)) {
        throw new Error(
          `seo: ${cname} does not exist.\n` +
            `  Fix: add the site's domain there, as GitHub Pages expects it.`,
        );
      }
      siteUrl = siteUrlFromCname(readFileSync(cname, "utf-8"));
    },
    transformIndexHtml() {
      return headTags(options, siteUrl);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(siteUrl) });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemapXml(siteUrl, lastCommitDate(options.contentDir)),
      });
    },
  };
}
