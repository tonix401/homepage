/**
 * How each app looks outside its own window: in the Waybar's workspace pills,
 * in its window-title segment, and in the launcher.
 *
 * Paths follow the same convention as the `icons` map in `Waybar.tsx` —
 * 24x24, stroked, no fill — because they are drawn by the same `<Icon>`.
 * Kept apart from `registry.tsx` so the bar never imports an app component.
 */

import { type AppId } from "./ids";

export const APP_ICONS: Record<AppId, string> = {
  editor: "M3 5h18v14H3zM3 9h18",
  browser:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  // A chicken — jīzǐ is pinyin for chicken — facing left: comb, head and body
  // in one outline with the tail up, a beak, an eye, a wing, two legs.
  terminal:
    "M7 4.5c0-1.2 1.3-1.6 1.9-.7.6-.9 2-.5 1.8.8M6 9.5A3 3 0 1 1 11 8v1.5c1.5 1 3.5 1 5-.5l2-3.5c1.5 2 2 4 2 6a6.5 6.5 0 0 1-6.5 6.5h-2A6 6 0 0 1 5.5 12c0-1 .2-1.8.5-2.5M5 7.5 3 8.5l2.3.6M8.3 7h.01M10 13c1.2 1.5 3 2 5 1.5M10.5 18v3M14.5 18v3",
  // Obsidian's gem: a tall, pointed crystal with one facet cut off-centre.
  notes: "M12.5 2 6 9.5l1.5 8.5 5 4 4.5-4.5 1-9.5zM12.5 2 10 11l2.5 11M6 9.5l4 1.5 8-2",
};

/** The name the launcher lists and the title segment falls back to. */
export const APP_NAMES: Record<AppId, string> = {
  editor: "Codium",
  browser: "Chromium",
  // Pinyin with its tone marks, ji first tone and zi third. The launcher's
  // filter ignores them, so typing "jizi" still finds it.
  terminal: "jīzǐ",
  notes: "Obsidian",
};
