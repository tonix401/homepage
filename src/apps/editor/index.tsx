import folderFiles from "virtual:open-folder-files";
import { findFileByPath, pageName } from "../../utils/files";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { EditorApp } from "./EditorApp";

export const editorApp: AppDefinition = {
  id: "editor",
  name: APP_NAMES.editor,
  title: (arg) => {
    const name = pageName(folderFiles, arg);
    return name ? `${name} — ${APP_NAMES.editor}` : APP_NAMES.editor;
  },
  // A file that has left the tree becomes "no file", which the editor already
  // reads as "the first one" — so a stale link degrades instead of breaking.
  normalizeArg: (arg) => (arg ? (findFileByPath(folderFiles, arg)?.path ?? null) : null),
  render: (props) => <EditorApp {...props} />,
};
