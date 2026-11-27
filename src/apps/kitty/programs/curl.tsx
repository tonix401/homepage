/** What `curl` has printed so far (`download.ts`), redrawn as it prints more. */

import { useSyncExternalStore } from "react";
import { Lines } from "../Lines";
import { type Printed } from "./download";

export function CurlOutput({ out }: { out: Printed }) {
  return <Lines lines={useSyncExternalStore(out.subscribe, out.get)} />;
}
