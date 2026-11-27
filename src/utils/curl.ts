/**
 * kitty's `curl`, as data: where its arguments say to put the download, the
 * progress meter it draws, and the messages it fails with. The download
 * itself is `apps/kitty/programs/download.ts`.
 *
 * It is cut down to adding a file, so it always saves and takes no options:
 *
 *   curl <url>                  the working folder, under the URL's own name
 *   curl <url> <name>           the working folder, under that name
 *   curl <url> <folder>/<name>  that folder, under that name
 *   curl <url> <folder>/        that folder, under the URL's own name
 *
 * A folder that exists counts without its slash too, as it does for `cp`.
 * Where it goes is checked before anything is fetched.
 *
 * Besides http(s), it takes a `blob:` URL: what the browser calls a file
 * dropped on kitty, which runs `curl <blob url> <name>` for each.
 */

import { type TreeNode } from "../services/types";
import { homePath, writeError } from "./fileManager";
import { type Line, destination, joinPath, line } from "./shell";

const TRY_HELP = "curl: try 'curl --help' for more information";

const HELP: Line[] = [
  "Usage: curl <url> [<name> | <folder>/ | <folder>/<name>]",
  "Downloads <url> into the working folder under its own name, or under the",
  "name and into the folder given. The folder has to exist.",
].map((text) => line(text));

/** The name a URL's file goes by: the last part of its path, decoded, or curl's own fallback. */
export function remoteFileName(url: URL): string {
  const last = url.pathname.split("/").pop() ?? "";
  let name: string;
  try {
    name = decodeURIComponent(last);
  } catch {
    name = last;
  }
  // A slash spelled `%2F` is part of the name, not a folder.
  return name.replaceAll("/", "_") || "curl_response";
}

/**
 * Where a download of `url` lands, as a tree path, given what was typed after
 * it (`dest`), or why it cannot land there.
 */
export function curlTarget(tree: TreeNode[], cwd: string, url: URL, dest?: string): { path: string } | { error: string } {
  const name = remoteFileName(url);
  const path = dest === undefined ? joinPath(cwd, name) : destination(tree, cwd, name, dest).path;
  const error = writeError(tree, path);
  return error ? { error: `curl: (23) Failed to open the file '${homePath(path)}': ${error}` } : { path };
}

/**
 * The URL and where it goes, `{ help }` for `--help`, or the lines curl fails
 * with. A URL without a scheme gets `https://`, which a page served over
 * HTTPS can fetch, where curl's own default `http://` would be blocked.
 */
export function parseCurl(
  tree: TreeNode[],
  cwd: string,
  args: readonly string[],
): { url: URL; path: string } | { help: Line[] } | { error: Line[] } {
  if (args.includes("-h") || args.includes("--help")) return { help: HELP };
  const option = args.find((a) => a.startsWith("-") && a !== "-");
  if (option) return { error: [line(`curl: option ${option}: is unknown`), line(TRY_HELP)] };
  const [target, dest, ...rest] = args;
  if (target === undefined) return { error: [line("curl: no URL specified"), line(TRY_HELP)] };
  if (rest.length) return { error: [line("curl: too many arguments"), line(TRY_HELP)] };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(target) ? target : `https://${target}`);
  } catch {
    return { error: [line("curl: (3) URL rejected: Malformed input to a URL function")] };
  }
  if (!["http:", "https:", "blob:"].includes(url.protocol)) {
    return { error: [line(`curl: (1) Protocol "${url.protocol.slice(0, -1)}" not supported`)] };
  }
  const landing = curlTarget(tree, cwd, url, dest);
  return "error" in landing ? { error: [line(landing.error)] } : { url, path: landing.path };
}

// ── The progress meter ──────────────────────────────────────────────────────
// As Tom's curl 8.23 draws it, measured: six-column sizes, `MM:SS` times,
// and blanks for a time it does not know.

/**
 * A byte count in six columns: whole bytes below 100000, then kilobytes to
 * one place and megabytes to two, cut rather than rounded — 99999, 488.2k,
 * 28.60M.
 */
export function meterBytes(bytes: number): string {
  const n = Math.floor(bytes);
  const kb = Math.floor(n / 1024);
  const cut = (whole: number, part: number, places: number) =>
    `${whole}.${String(Math.floor((part * 10 ** places) / 1024)).padStart(places, "0")}`;
  let text: string;
  if (n < 100000) text = String(n);
  else if (kb < 1000) text = `${cut(kb, n % 1024, 1)}k`;
  else if (kb < 100 * 1024) text = `${cut(Math.floor(kb / 1024), kb % 1024, 2)}M`;
  else if (kb < 1000 * 1024) text = `${cut(Math.floor(kb / 1024), kb % 1024, 1)}M`;
  else text = `${cut(Math.floor(kb / 1024 / 1024), Math.floor(kb / 1024) % 1024, 2)}G`;
  return text.padStart(6);
}

/** A duration as `MM:SS`, `H:MM:SS` past an hour, or blank when it is not known. */
export function meterTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return " ".repeat(7);
  const s = Math.round(seconds);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (s < 3600 ? `${mm}:${ss}` : `${Math.floor(s / 3600)}:${mm}:${ss}`).padStart(7);
}

export const METER_HEADER: Line[] = [
  line("  % Total    % Received % Xferd  Average Speed  Time    Time    Time   Current"),
  line("                                 Dload  Upload  Total   Spent   Left   Speed"),
];

/**
 * One state of the meter: `received` of `total` bytes (unknown: `null`)
 * after `seconds`, at `speed` bytes a second just now. Once it is done, the
 * time left is blank, as curl leaves it.
 */
export function meterLine(received: number, total: number | null, seconds: number, speed: number): Line {
  const percent = String(total ? Math.floor((received / total) * 100) : 0).padStart(3);
  const average = seconds > 0 ? received / seconds : 0;
  const known = total !== null && average > 0;
  const left = known && received < total ? (total - received) / average : null;
  return line(
    [
      percent,
      meterBytes(total ?? 0),
      percent,
      meterBytes(received),
      "  0",
      meterBytes(0),
      meterBytes(average),
      meterBytes(0),
      meterTime(known ? total / average : null),
      meterTime(seconds > 0 ? seconds : null),
      meterTime(left),
      meterBytes(speed),
    ].join(" "),
  );
}
