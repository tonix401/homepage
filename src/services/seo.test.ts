import { describe, expect, it } from "vitest";
import { headTags, robotsTxt, siteUrlFromCname, sitemapXml, type SeoOptions } from "./seo";

const options: SeoOptions = {
  title: "Tom Weise",
  description: "A description with \"quotes\" & <brackets>",
  image: "og-image.png",
  imageAlt: "alt",
  locale: "en_US",
  contentDir: "./open_folder",
  person: { name: "Tom Weise", jobTitle: "</script><script>alert(1)" },
};

describe("siteUrlFromCname", () => {
  it("makes an https root URL of the domain", () => {
    expect(siteUrlFromCname("tomweise.dev\n")).toBe("https://tomweise.dev/");
  });

  it("refuses an empty file", () => {
    expect(() => siteUrlFromCname("  \n")).toThrow();
  });
});

describe("robots and sitemap", () => {
  it("allows everything and names the sitemap", () => {
    expect(robotsTxt("https://a.dev/")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://a.dev/sitemap.xml\n",
    );
  });

  it("lists the site, with lastmod only when there is one", () => {
    expect(sitemapXml("https://a.dev/", "2026-09-24")).toContain(
      "<loc>https://a.dev/</loc>\n    <lastmod>2026-09-24</lastmod>",
    );
    expect(sitemapXml("https://a.dev/", null)).not.toContain("lastmod");
  });
});

describe("headTags", () => {
  const tags = headTags(options, "https://a.dev/");
  const attr = (key: string, value: string) =>
    tags.find((t) => t.attrs?.[key] === value)?.attrs;

  it("points the canonical URL and the preview at the site", () => {
    expect(attr("rel", "canonical")?.href).toBe("https://a.dev/");
    expect(attr("property", "og:url")?.content).toBe("https://a.dev/");
    expect(attr("property", "og:image")?.content).toBe("https://a.dev/og-image.png");
  });

  it("describes the page with the configured text, unescaped for Vite to escape", () => {
    expect(attr("name", "description")?.content).toBe(options.description);
    expect(attr("property", "og:description")?.content).toBe(options.description);
  });

  it("writes JSON-LD that cannot close its own script element", () => {
    const script = tags.find((t) => t.tag === "script");
    const json = String(script?.children);
    expect(json).not.toContain("</script>");
    const data = JSON.parse(json);
    expect(data["@graph"][1]).toMatchObject({
      "@type": "Person",
      name: "Tom Weise",
      url: "https://a.dev/",
      image: "https://a.dev/og-image.png",
      jobTitle: "</script><script>alert(1)",
    });
  });
});
