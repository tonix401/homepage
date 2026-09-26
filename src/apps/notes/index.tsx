import folderFiles from "virtual:open-folder-files";
import { defaultFile } from "virtual:open-folder-config";
import { findFileByPath, pageName } from "../../utils/files";
import { noteName } from "../../utils/graph";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { NotesApp } from "./NotesApp";

export const notesApp: AppDefinition = {
  id: "notes",
  name: APP_NAMES.notes,
  // Named the way Obsidian names a note: without its `.md`.
  title: (arg) => {
    const name = pageName(folderFiles, arg, defaultFile);
    return name ? `${noteName(name)} — ${APP_NAMES.notes}` : APP_NAMES.notes;
  },
  // A note that has left the vault opens the default file instead, as in Codium.
  normalizeArg: (arg) => (arg ? (findFileByPath(folderFiles, arg)?.path ?? null) : null),
  render: (props) => <NotesApp {...props} />,
};
