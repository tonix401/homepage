import folderFiles from "virtual:open-folder-files";
import { defaultFile } from "virtual:open-folder-config";
import { pageName } from "../../utils/files";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { BrowserApp } from "./BrowserApp";

export const browserApp: AppDefinition = {
  id: "browser",
  name: APP_NAMES.browser,
  title: (arg) => {
    const name = pageName(folderFiles, arg, defaultFile);
    return name ? `${name} — ${APP_NAMES.browser}` : APP_NAMES.browser;
  },
  // Unlike the editor, a browser has something to say about a page that is
  // not there, so a stale path is kept as typed and `BrowserApp` renders the
  // error page rather than silently showing a different file.
  normalizeArg: (arg) => arg,
  render: (props) => <BrowserApp {...props} />,
};
