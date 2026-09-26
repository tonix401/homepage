/**
 * The contract between the window manager and the things it runs.
 *
 * An app is a definition in `registry.tsx`: an id, how it names itself, how it
 * cleans up a payload that came from a URL or from storage, and how it renders
 * into a column. Everything the app may do *to its own window* arrives as a
 * `WindowHandle`, so no app ever touches the route.
 */

import { type ReactNode } from "react";
import { type AppId } from "./ids";
import { type Desktop } from "../utils/desktop";

/** The commands a window can issue about itself. Supplied by `App`. */
export interface WindowHandle {
  readonly id: string;
  /** Replace this window's payload — the editor opening another file. */
  setArg(arg: string | null): void;
  close(): void;
  /** Maximize <-> restore. A no-op while the strip holds more than one column. */
  toggleFullscreen(): void;
  /** Make this the focused column, which scrolls it into view. */
  focus(): void;
  /** Launch another app at the right end of the strip. */
  open(app: AppId, arg?: string | null): void;
}

export interface AppRenderProps {
  arg: string | null;
  /** Only the focused window answers global keyboard shortcuts. */
  focused: boolean;
  /** True when this window fills the viewport (`state === "fullscreen"`). */
  maximized: boolean;
  handle: WindowHandle;
  /**
   * The whole desktop, to **read**: btop draws it as its process tree. It is
   * the live object, frozen by convention — an app changes its own window
   * through `handle` and never anything here, so the window manager stays
   * the only writer.
   */
  desktop: Desktop;
}

export interface AppDefinition {
  readonly id: AppId;
  readonly name: string;
  /** What the Waybar's window-title segment shows for a window of this app. */
  title(arg: string | null): string;
  /**
   * Canonicalizes a payload before it reaches the URL or sessionStorage — the
   * editor turns a file path that has left the tree into `null`, meaning "the
   * default file", rather than leaving an empty window behind.
   */
  normalizeArg(arg: string | null): string | null;
  /**
   * Must return an element of a *stable* component type. An inline closure
   * would be a new type on every render, so React would remount the window and
   * throw away its scroll position, open folders and search query.
   */
  render(props: AppRenderProps): ReactNode;
}
