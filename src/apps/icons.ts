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
};

/** The name the launcher lists and the title segment falls back to. */
export const APP_NAMES: Record<AppId, string> = {
  editor: "Codium",
  browser: "Chromium",
};
