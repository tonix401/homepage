import folderFiles from "virtual:open-folder-files";
import { findEntry, homePath, parentOf } from "../../utils/fileManager";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { TerminalApp } from "./TerminalApp";

export const terminalApp: AppDefinition = {
  id: "terminal",
  name: APP_NAMES.terminal,
  // A terminal titles itself with its working directory, which is the folder
  // being listed — the cursor's parent — not the row the cursor is on.
  title: (arg) => `${homePath(arg ? parentOf(arg) : "")} — ${APP_NAMES.terminal}`,
  // A path that has left the tree puts the cursor back at the top of home.
  normalizeArg: (arg) => (arg && findEntry(folderFiles, arg) ? arg : null),
  render: (props) => <TerminalApp {...props} />,
};
