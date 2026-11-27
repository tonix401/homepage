import { formatArg, parseArg } from "../../utils/shell";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { KittyApp } from "./KittyApp";
import { findProgram } from "./programs";

/** The full-screen program a payload names, with its arguments, or `null` for the prompt. */
function screenOf(arg: string | null) {
  const foreground = parseArg(arg);
  const program = foreground && findProgram(foreground.program);
  return program?.Screen && foreground ? { program, args: foreground.args } : null;
}

export const kittyApp: AppDefinition = {
  id: "kitty",
  name: APP_NAMES.kitty,
  // The program in the foreground names the window, as jīzǐ and btop named
  // theirs before they ran in here; the bare shell is kitty.
  title: (arg) => {
    const screen = screenOf(arg);
    return screen ? (screen.program.title?.(screen.args) ?? screen.program.name) : APP_NAMES.kitty;
  },
  // A program it no longer knows, or one that only prints, leaves the prompt.
  normalizeArg: (arg) => {
    const screen = screenOf(arg);
    if (!screen) return null;
    const args = screen.program.normalizeArgs ? screen.program.normalizeArgs(screen.args) : screen.args;
    return args === null ? null : formatArg(screen.program.name, args);
  },
  render: (props) => <KittyApp {...props} />,
};
