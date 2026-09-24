import folderFiles from "virtual:open-folder-files";
import { cursorAt, findEntry } from "../../utils/fileManager";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { TerminalApp } from "./TerminalApp";

export const terminalApp: AppDefinition = {
  id: "terminal",
  name: APP_NAMES.terminal,
  // The entry under the cursor, the way the editor and the browser name the
  // file they show — the file (or folder) the preview pane is showing. `null`
  // is the cursor on the first row of home, so that row is named too.
  title: (arg) => {
    const { entries, index } = cursorAt(folderFiles, arg);
    const name = entries[index]?.name;
    return name ? `${name} — ${APP_NAMES.terminal}` : APP_NAMES.terminal;
  },
  // A path that has left the tree puts the cursor back at the top of home.
  normalizeArg: (arg) => (arg && findEntry(folderFiles, arg) ? arg : null),
  render: (props) => <TerminalApp {...props} />,
};
