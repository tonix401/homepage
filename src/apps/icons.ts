/**
 * How each app looks outside its own window: in the Waybar's workspace pills,
 * in its window-title segment, and in the launcher.
 *
 * Paths follow the same convention as the `icons` map in `Waybar.tsx` —
 * 24x24, stroked, no fill — because they are drawn by the same `<Icon>`.
 * Kept apart from `registry.tsx` so the bar never imports an app component.
 */

import { type AppId } from "./ids";

/** A window with a title bar: Codium's icon. */
const WINDOW = "M3 5h18v14H3zM3 9h18";

/** A shell prompt, `>_`: kitty at its prompt. */
const PROMPT = "M4 17l6-5-6-5M12 19h8";

export const APP_ICONS: Record<AppId, string> = {
  editor: WINDOW,
  browser:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  kitty: PROMPT,
  // Obsidian's gem: a tall, pointed crystal with one facet cut off-centre.
  notes: "M12.5 2 6 9.5l1.5 8.5 5 4 4.5-4.5 1-9.5zM12.5 2 10 11l2.5 11M6 9.5l4 1.5 8-2",
  // A clapperboard: the board, and its open clapper striped on top.
  video: "M4 10h16v10H4zM4 10 3.3 6.2 18.6 3.5l.7 3.8M7.3 5.5 9.5 8.6M11.8 4.7l2.2 3.1",
  // A picture: its frame, a sun, and two hills.
  imv: "M3 5h18v14H3zM3 17l5-5 4 4 3-3 6 6M15.5 9h.01",
};

/** The name the launcher lists and the title segment falls back to. */
export const APP_NAMES: Record<AppId, string> = {
  editor: "Codium",
  browser: "Chromium",
  kitty: "kitty",
  notes: "Obsidian",
  video: "Kdenlive",
  imv: "imv",
};

/**
 * The full-screen programs kitty runs, which the launcher lists beside the
 * apps and whose icon a kitty window shows while one is in the foreground.
 */
export const PROGRAM_ICONS: Record<string, string> = {
  // A chicken — jīzǐ is pinyin for chicken — facing left: comb, head and body
  // in one outline with the tail up, a beak, an eye, a wing, two legs.
  jizi: "M7 4.5c0-1.2 1.3-1.6 1.9-.7.6-.9 2-.5 1.8.8M6 9.5A3 3 0 1 1 11 8v1.5c1.5 1 3.5 1 5-.5l2-3.5c1.5 2 2 4 2 6a6.5 6.5 0 0 1-6.5 6.5h-2A6 6 0 0 1 5.5 12c0-1 .2-1.8.5-2.5M5 7.5 3 8.5l2.3.6M8.3 7h.01M10 13c1.2 1.5 3 2 5 1.5M10.5 18v3M14.5 18v3",
  // A load trace, as btop's own graphs draw one.
  btop: "M2 12h4l3-8 4 16 3-8h6",
};

/**
 * A window's icon: its app's, except that kitty shows the program in its
 * foreground. The payload's first word is that program (`utils/shell.ts`
 * writes it, already resolved from any alias); read here without the
 * parser, so the bar still imports nothing but this leaf.
 */
export function windowIcon(app: AppId, arg: string | null): string {
  if (app !== "kitty" || arg === null) return APP_ICONS[app];
  return PROGRAM_ICONS[arg.split(" ")[0]] ?? APP_ICONS.kitty;
}
