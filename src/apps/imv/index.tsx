import { getTree } from "../../utils/fileStore";
import { imagesBeside } from "../../utils/imv";
import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { ImvApp } from "./ImvApp";

export const imvApp: AppDefinition = {
  id: "imv",
  name: APP_NAMES.imv,
  // imv's title is its overlay after `imv - `; the size and zoom are the
  // window's own state, so the bar shows the place in the list and the name.
  title: (arg) => {
    if (!arg) return APP_NAMES.imv;
    const images = imagesBeside(getTree(), arg);
    const index = images.findIndex((f) => f.path === arg);
    return index === -1 ? APP_NAMES.imv : `imv - [${index + 1}/${images.length}] ${images[index].name}`;
  },
  // An image that has gone — removed, or another tab's — leaves an empty imv.
  normalizeArg: (arg) => (arg && imagesBeside(getTree(), arg).some((f) => f.path === arg) ? arg : null),
  render: (props) => <ImvApp {...props} />,
};
