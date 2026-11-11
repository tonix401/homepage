import { describe, it, expect } from "vitest";
import { findBrokenLinks, findLinks } from "./linkCheck";

const known = new Set(["README.md", "projects/Homelab.md", "skills/software.md", "legal/imprint.html"]);

describe("findLinks", () => {
  it("finds html hrefs and markdown links, in order", () => {
    const md = 'See <a href="a.md">a</a> and [b](b.md "title") and [c](<c d.md>).';
    expect(findLinks("x.md", md).map((l) => l.href)).toEqual(["a.md", "b.md", "c d.md"]);
  });

  it("reads hrefs in an html page", () => {
    expect(findLinks("x.html", `<a href='a.md'>a</a><a HREF="b.md">b</a>`).map((l) => l.href)).toEqual(["a.md", "b.md"]);
  });

  it("skips images, including an image that is itself a link", () => {
    expect(findLinks("x.md", "![alt](badges/x.svg) [![alt](badges/y.svg)](z.md)").map((l) => l.href)).toEqual(["z.md"]);
  });

  it("skips what markdown does not render as a link, an unquoted space in the path", () => {
    expect(findLinks("x.md", "[a](work experience/a.md)")).toEqual([]);
  });

  it("skips links in code", () => {
    const md = "`[a](a.md)`\n\n```md\n[b](b.md)\n<a href=\"c.md\">\n```\n\n[d](d.md)";
    expect(findLinks("x.md", md).map((l) => l.href)).toEqual(["d.md"]);
  });

  it("reports the line each link is on, code and images included in the count", () => {
    const md = "# title\n\n```\ncode\n```\n![img](i.svg)\n[a](a.md) and\n<a href=\"b.md\">b</a>\n";
    expect(findLinks("x.md", md)).toEqual([
      { href: "a.md", line: 7 },
      { href: "b.md", line: 8 },
    ]);
  });
});

describe("findBrokenLinks", () => {
  const page = (path: string, content: string) => ({ path, content });

  it("resolves a link against the folder of the file it is in", () => {
    expect(findBrokenLinks([page("skills/software.md", '<a href="projects/Homelab.md">')], known)).toEqual([
      { from: "skills/software.md", href: "projects/Homelab.md", line: 1 },
    ]);
    expect(findBrokenLinks([page("skills/software.md", '<a href="../projects/Homelab.md">')], known)).toEqual([]);
    expect(findBrokenLinks([page("README.md", "[h](projects/Homelab.md)")], known)).toEqual([]);
  });

  it("leaves what the viewer does not follow in-app alone", () => {
    const content = '<a href="https://x.y">x</a> <a href="mailto:a@b.c">m</a> <a href="#top">t</a> <a href="/abs">a</a>';
    expect(findBrokenLinks([page("README.md", content)], known)).toEqual([]);
  });

  it("checks pages only, and html pages too", () => {
    expect(findBrokenLinks([page("a.svg", '<a href="nope.md">')], known)).toEqual([]);
    expect(findBrokenLinks([page("legal/imprint.html", '<a href="gone.md">')], known)).toEqual([
      { from: "legal/imprint.html", href: "gone.md", line: 1 },
    ]);
  });
});
