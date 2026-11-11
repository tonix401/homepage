import { describe, it, expect } from "vitest";
import { glyphs, supportsColor, supportsHyperlinks, supportsUnicode } from "./terminal.ts";

describe("supportsHyperlinks", () => {
  it("is on for terminals known to open them", () => {
    expect(supportsHyperlinks({ KITTY_WINDOW_ID: "1" }, true)).toBe(true);
    expect(supportsHyperlinks({ TERM: "xterm-kitty" }, true)).toBe(true);
    expect(supportsHyperlinks({ TERM_PROGRAM: "WezTerm" }, true)).toBe(true);
    expect(supportsHyperlinks({ VTE_VERSION: "7603" }, true)).toBe(true);
  });

  it("is off for simple terminals, pipes, multiplexers and CI", () => {
    expect(supportsHyperlinks({ TERM: "xterm-256color" }, true)).toBe(false);
    expect(supportsHyperlinks({ TERM: "dumb", KITTY_WINDOW_ID: "1" }, true)).toBe(false);
    expect(supportsHyperlinks({ KITTY_WINDOW_ID: "1" }, false)).toBe(false);
    expect(supportsHyperlinks({ KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" }, true)).toBe(false);
    expect(supportsHyperlinks({ KITTY_WINDOW_ID: "1", CI: "true" }, true)).toBe(false);
    expect(supportsHyperlinks({ VTE_VERSION: "4000" }, true)).toBe(false);
  });

  it("can be forced either way", () => {
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "1" }, false)).toBe(true);
    expect(supportsHyperlinks({ FORCE_HYPERLINK: "0", KITTY_WINDOW_ID: "1" }, true)).toBe(false);
  });
});

describe("supportsColor and supportsUnicode", () => {
  it("turn off for a dumb terminal", () => {
    expect(supportsColor({ TERM: "dumb" })).toBe(false);
    expect(supportsColor({ TERM: "xterm-256color" })).toBe(true);
    expect(supportsUnicode({ TERM: "dumb", LANG: "en_US.UTF-8" })).toBe(false);
  });

  it("need a UTF-8 locale and a terminal that is not the Linux console", () => {
    expect(supportsUnicode({ TERM: "xterm", LANG: "en_US.UTF-8" })).toBe(true);
    expect(supportsUnicode({ TERM: "xterm", LC_ALL: "de_DE.utf8", LANG: "C" })).toBe(true);
    expect(supportsUnicode({ TERM: "xterm", LANG: "C" })).toBe(false);
    expect(supportsUnicode({ TERM: "xterm" })).toBe(false);
    expect(supportsUnicode({ TERM: "linux", LANG: "en_US.UTF-8" })).toBe(false);
  });

  it("draws with ASCII where unicode is off", () => {
    expect(glyphs(false)).toMatchObject({ branch: "|-- ", arrow: "->" });
    expect(glyphs(true)).toMatchObject({ branch: "├── ", arrow: "↗" });
  });
});
