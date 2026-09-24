import { APP_NAMES } from "../icons";
import { type AppDefinition } from "../types";
import { FastfetchApp } from "./FastfetchApp";

export const fetchApp: AppDefinition = {
  id: "fetch",
  name: APP_NAMES.fetch,
  title: () => APP_NAMES.fetch,
  // It reports the browser it runs in, which is the same for every window.
  normalizeArg: () => null,
  render: (props) => <FastfetchApp {...props} />,
};
