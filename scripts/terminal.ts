/**
 * What the terminal running a script can show, so the output degrades to plain
 * text on a simple one: a `TERM=dumb` shell, the Linux console, a pipe, tmux, CI.
 * Each check takes the environment as an argument, so the tests can try them all.
 */

type Env = Record<string, string | undefined>;

const dumb = (env: Env): boolean => env.TERM === "dumb";

/**
 * OSC 8 hyperlinks. They are escape sequences a terminal that does not know
 * them may print as garbage, so only terminals known to handle them get them.
 * `FORCE_HYPERLINK=1` / `=0` overrides the guess, as in `supports-hyperlinks`.
 */
export function supportsHyperlinks(env: Env, isTTY: boolean): boolean {
  if (env.FORCE_HYPERLINK !== undefined) return env.FORCE_HYPERLINK !== "0" && env.FORCE_HYPERLINK !== "false";
  if (!isTTY || dumb(env) || env.CI !== undefined) return false;
  // tmux and screen swallow the sequence unless they are set up to pass it on.
  if (env.TMUX !== undefined || env.STY !== undefined) return false;
  if (env.KITTY_WINDOW_ID !== undefined || env.WT_SESSION !== undefined || env.KONSOLE_VERSION !== undefined) return true;
  if (env.TERM === "xterm-kitty" || env.TERM === "xterm-ghostty") return true;
  if (["iTerm.app", "WezTerm", "vscode", "ghostty", "Hyper"].includes(env.TERM_PROGRAM ?? "")) return true;
  return Number.parseInt(env.VTE_VERSION ?? "", 10) >= 5000;
}

/** Colour is asked for with a flag, so only a terminal that cannot show it says no. */
export function supportsColor(env: Env): boolean {
  return !dumb(env);
}

/**
 * The box-drawing and arrow characters. They need a UTF-8 locale and a font for
 * them: `dumb` has neither, and the Linux console's font lacks the arrow.
 */
export function supportsUnicode(env: Env): boolean {
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return /utf-?8/i.test(locale) && env.TERM !== "dumb" && env.TERM !== "linux";
}

/** The characters a tree and a link are drawn with, by what the terminal can show. */
export function glyphs(unicode: boolean): { branch: string; last: string; pipe: string; space: string; arrow: string } {
  return unicode
    ? { branch: "├── ", last: "└── ", pipe: "│   ", space: "    ", arrow: "↗" }
    : { branch: "|-- ", last: "`-- ", pipe: "|   ", space: "    ", arrow: "->" };
}
