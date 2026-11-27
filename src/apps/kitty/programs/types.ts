/**
 * The contract between kitty's shell and the programs it runs.
 *
 * A program either **prints**: `run` returns lines, or an element that keeps
 * drawing in the scrollback (fastfetch fills in fields as they arrive; curl
 * draws its progress, and holds the prompt back with `wait`). Or it
 * takes the window over, as btop and jīzǐ do in a real terminal's alternate
 * screen: it has a `Screen`, which stays up until it calls `exit`. A screen's
 * command line is the window's payload, so a reload comes back to it.
 */

import { type ComponentType, type ReactElement } from "react";
import { type AppId } from "../../ids";
import { type Desktop } from "../../../utils/desktop";
import { type CommandInfo, type Line } from "../../../utils/shell";

/** What a printing program is handed. */
export interface ShellContext {
  args: string[];
  /** The working directory, as a tree path: `""` is `~`. */
  cwd: string;
  cd(path: string): void;
  /** Every line typed in this window, oldest first, this one included. */
  history: readonly string[];
  /** Wipes the scrollback, this command's own line included. */
  clear(): void;
  /** A non-zero exit status: the next prompt turns red. */
  fail(): void;
  /**
   * Holds the prompt back until `job` settles, as a shell waits for a command
   * that is still running — `curl` downloading. A rejection is a failure, as
   * is `fail()` called any time before it settles.
   */
  wait(job: Promise<unknown>): void;
  /** Aborted by Ctrl+C, or by the window closing, while the shell waits. */
  signal: AbortSignal;
  /** Every command, for `help` and for completion. */
  commands: readonly CommandInfo[];
  open(app: AppId, arg?: string | null): void;
  /** Closes the window, as `exit` closes a terminal. */
  close(): void;
}

/** What a full-screen program is handed. */
export interface ScreenProps {
  /** Its arguments, from the window's payload. */
  args: string[];
  /** Replaces them, so a reload comes back to the same place. */
  setArgs(args: string[]): void;
  /** Back to the prompt. */
  exit(): void;
  /** Only the focused window answers the keyboard. */
  focused: boolean;
  open(app: AppId, arg?: string | null): void;
  /** The window it runs in, which btop marks as its own process. */
  windowId: string;
  desktop: Desktop;
}

export interface Program extends CommandInfo {
  run?(context: ShellContext): Line[] | ReactElement | void;
  Screen?: ComponentType<ScreenProps>;
  /**
   * A screen's arguments as typed, made into what it stores: jīzǐ turns a
   * folder relative to the working directory into the path its cursor is on.
   */
  launch?(args: string[], cwd: string): string[];
  /**
   * Stored arguments cleaned up after a reload, like
   * `AppDefinition.normalizeArg`; `null` drops back to the prompt.
   */
  normalizeArgs?(args: string[]): string[] | null;
  /** What the Waybar's title segment says; the program's name by default. */
  title?(args: string[]): string;
}
