import { getTree } from "../../utils/fileStore";
import { defaultFile } from "virtual:open-folder-config";
import { findFileByPath, pageName } from "../../utils/files";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { KdenliveApp } from "./KdenliveApp";

export const videoApp: AppDefinition = {
  id: "video",
  name: APP_NAMES.video,
  title: (arg) => {
    const name = pageName(getTree(), arg, defaultFile);
    return name ? `${name} — ${APP_NAMES.video}` : APP_NAMES.video;
  },
  // A clip that has left the bin opens the default file instead, as in Codium.
  normalizeArg: (arg) => (arg ? (findFileByPath(getTree(), arg)?.path ?? null) : null),
  render: (props) => <KdenliveApp {...props} />,
};
