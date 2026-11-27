/**
 * `curl`: fetches a URL into the open folder, to the path `parseCurl`
 * (`utils/curl.ts`) has already checked.
 *
 * The page can only fetch from a server that allows other sites to (CORS),
 * and GitHub Pages has no proxy to go around one that does not. So when the
 * fetch is refused, curl tries the URL as an image
 * instead — an `<img>` needs no permission — and keeps a link to it if it
 * loads: the picture shows everywhere a file does, but its bytes stay on the
 * other server. Text cannot be had that way, and fails.
 *
 * The download starts in `run`, not in an effect, so a re-render never starts
 * a second one; `CurlOutput` (`curl.tsx`) only draws what it has printed.
 */

import { MAX_FILE_BYTES } from "../../../utils/fileFilter";
import { addFile, addLink } from "../../../utils/fileStore";
import { homePath } from "../../../utils/fileManager";
import { METER_HEADER, meterLine } from "../../../utils/curl";
import { type Line, line } from "../../../utils/shell";

/** What curl has printed so far, for the element to follow. */
export interface Printed {
  get(): readonly Line[];
  subscribe(listener: () => void): () => void;
  set(lines: readonly Line[]): void;
}

export function printed(): Printed {
  let lines: readonly Line[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => lines,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      lines = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Whether an `<img>` can show `url`: what a server that refuses fetches still allows. */
function loadsAsImage(url: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    signal.addEventListener("abort", () => resolve(false));
    img.src = url;
  });
}

/**
 * Downloads `url` to the tree path `path`, printing into `out`. Resolves
 * whether it succeeded, and rejects when Ctrl+C aborts it.
 */
export async function curl(url: URL, path: string, signal: AbortSignal, out: Printed): Promise<boolean> {
  let shown: Line[] = [...METER_HEADER, meterLine(0, null, 0, 0)];
  const show = (lines: Line[]) => out.set((shown = lines));
  show(shown);
  const fail = (...lines: Line[]) => {
    show([...shown, ...lines]);
    return false;
  };
  // The folder was checked before the fetch; it is checked again on writing,
  // since a file may have been added or removed meanwhile.
  const writeFailed = (error: string, received: number) =>
    fail(
      line(`Warning: Failed to open the file ${homePath(path)}: ${error}`),
      line(`curl: (23) client returned ERROR on write of ${received} bytes`),
    );

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    // A dropped file's URL lasts as long as the page that made it.
    if (url.protocol === "blob:") return fail(line(`curl: (37) Couldn't open file ${url.href}`));
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    if (await loadsAsImage(url.href, signal)) {
      const added = addLink(path, url.href);
      if ("error" in added) return writeFailed(added.error, 0);
      show([...shown, line(`Note: ${url.host} lets no other site download it, so ${homePath(path)} links to the image there`, "dim")]);
      return true;
    }
    if (signal.aborted) throw error;
    return fail(line(`curl: (7) Failed to connect to ${url.hostname} port ${port}: blocked by the browser (CORS)`));
  }
  if (!response.ok) return fail(line(`curl: (22) The requested URL returned error: ${response.status}`));

  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const started = performance.now();
  let drawn = 0;
  const reader = response.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (received > MAX_FILE_BYTES) {
      void reader.cancel();
      return fail(line(`curl: (63) Exceeded the maximum allowed file size (${MAX_FILE_BYTES}) with ${received} bytes`));
    }
    const now = performance.now();
    if (now - drawn > 100) {
      drawn = now;
      const seconds = (now - started) / 1000;
      show([...METER_HEADER, meterLine(received, total, seconds, seconds > 0 ? received / seconds : 0)]);
    }
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const seconds = Math.max((performance.now() - started) / 1000, 0.001);
  show([...METER_HEADER, meterLine(received, total ?? received, seconds, received / seconds)]);

  const added = addFile(path, bytes, response.headers.get("content-type") ?? "");
  return "error" in added ? writeFailed(added.error, received) : true;
}
