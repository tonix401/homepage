import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { BtopApp } from "./BtopApp";

export const monitorApp: AppDefinition = {
  id: "monitor",
  name: APP_NAMES.monitor,
  title: () => APP_NAMES.monitor,
  // Everything btop shows is the desktop's, so the window keeps no payload.
  normalizeArg: () => null,
  render: (props) => <BtopApp {...props} />,
};
