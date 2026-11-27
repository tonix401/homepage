/**
 * Every app the window manager can run, and how to draw one.
 *
 * Adding an app is an entry here plus an id in `ids.ts` and an icon in
 * `icons.ts` — nothing in the router, the strip or the bar has to know about
 * it. See the Apps section of CLAUDE.md for the full checklist.
 */

import { type AppId } from "./ids";
import { type AppDefinition } from "./types";
import { editorApp } from "./editor";
import { browserApp } from "./browser";
import { kittyApp } from "./kitty";
import { notesApp } from "./notes";
import { videoApp } from "./video";
import { imvApp } from "./imv";
import { APP_ICONS, PROGRAM_ICONS } from "./icons";

export const APPS: Record<AppId, AppDefinition> = {
  editor: editorApp,
  browser: browserApp,
  kitty: kittyApp,
  notes: notesApp,
  video: videoApp,
  imv: imvApp,
};

/** One row of the launcher: an app, and what its new window opens on. */
export interface LaunchEntry {
  /** Unique among the rows. */
  key: string;
  app: AppId;
  arg: string | null;
  name: string;
  icon: string;
}

const launch = (app: AppDefinition): LaunchEntry => ({
  key: app.id,
  app: app.id,
  arg: null,
  name: app.name,
  icon: APP_ICONS[app.id],
});

/**
 * The order the launcher lists them in. jīzǐ and btop are kitty opened on
 * them, so quitting either leaves a shell; fastfetch needs no row, as every
 * kitty opens on it. imv has none either: with no image to open it only says
 * so, as the real one does.
 */
export const LAUNCHABLE: readonly LaunchEntry[] = [
  launch(editorApp),
  launch(browserApp),
  launch(notesApp),
  launch(videoApp),
  launch(kittyApp),
  // Pinyin with its tone marks, ji first tone and zi third. The launcher's
  // filter ignores them, so typing "jizi" still finds it.
  { key: "jizi", app: "kitty", arg: "jizi", name: "jīzǐ", icon: PROGRAM_ICONS.jizi },
  { key: "btop", app: "kitty", arg: "btop", name: "btop", icon: PROGRAM_ICONS.btop },
];
