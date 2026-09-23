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

export const APPS: Record<AppId, AppDefinition> = {
  editor: editorApp,
  browser: browserApp,
};

/** The order the launcher lists them in. */
export const LAUNCHABLE: readonly AppDefinition[] = [editorApp, browserApp];
