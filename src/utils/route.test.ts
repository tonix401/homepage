import { describe, it, expect } from "vitest";
import { parseRoute, formatRoute, type Route } from "./route";

describe("parseRoute", () => {
  it("defaults an empty query to the first file, maximized, on workspace 1", () => {
    expect(parseRoute("")).toEqual({ workspace: 1, state: "fullscreen", filePath: null });
  });

  it("reads a windowed editor on another workspace, in any order", () => {
    const expected = { workspace: 2, state: "window", filePath: "projects/Homelab.md" };
    expect(parseRoute("?file=projects/Homelab.md&state=window&workspace=2")).toEqual(expected);
    expect(parseRoute("?workspace=2&file=projects/Homelab.md&state=window")).toEqual(expected);
  });

  it("decodes a file whose path has spaces and accents", () => {
    expect(parseRoute("?file=work%20experience/Dr%C3%A4ger.md").filePath).toBe(
      "work experience/Dräger.md",
    );
  });

  it("reads the bare desktop, which has no file", () => {
    expect(parseRoute("?state=desktop&workspace=3")).toEqual({
      workspace: 3,
      state: null,
      filePath: null,
    });
  });

  it("drops the file of a closed window", () => {
    expect(parseRoute("?file=README.md&state=desktop").filePath).toBeNull();
  });

  it.each(["?state=tiled", "?state=", "?workspace=0", "?workspace=9", "?workspace=x", "?nonsense=1"])(
    "falls back to defaults for %s",
    (search) => {
      expect(parseRoute(search)).toMatchObject({ workspace: 1, state: "fullscreen" });
    },
  );
});

describe("formatRoute", () => {
  it("leaves the home page bare", () => {
    expect(formatRoute({ workspace: 1, state: "fullscreen", filePath: null })).toBe("/");
  });

  it("omits the parameters that are already the default", () => {
    expect(formatRoute({ workspace: 1, state: "fullscreen", filePath: "README.md" })).toBe(
      "/?file=README.md",
    );
  });

  it("keeps slashes readable and escapes the rest", () => {
    expect(
      formatRoute({ workspace: 1, state: "window", filePath: "work experience/Dräger.md" }),
    ).toBe("/?file=work%20experience/Dr%C3%A4ger.md&state=window");
  });

  it("names the desktop explicitly and drops the file it is not showing", () => {
    expect(formatRoute({ workspace: 4, state: null, filePath: "README.md" })).toBe(
      "/?state=desktop&workspace=4",
    );
  });

  it.each<Route>([
    { workspace: 1, state: "fullscreen", filePath: null },
    { workspace: 5, state: "window", filePath: "legal/imprint.html" },
    { workspace: 3, state: null, filePath: null },
    { workspace: 2, state: "fullscreen", filePath: "work experience/Dräger.md" },
  ])("round-trips %j", (route) => {
    expect(parseRoute(formatRoute(route).replace("/", ""))).toEqual(route);
  });
});
