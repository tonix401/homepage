/**
 * The whole app lives at `/`; what it shows is a query string:
 *
 *   /                                              the first file, maximized
 *   /?file=projects/Homelab.md                     that file, maximized
 *   /?file=projects/Homelab.md&state=window        the editor as a window
 *   /?state=desktop&workspace=3                    the bare desktop, workspace 3
 *
 * Keeping every URL at the site root is what lets content in `open_folder/`
 * write its asset URLs relative to the root (`eschbach/logo.jpg`), and is why
 * no static-host rewrite is needed to reach a link.
 *
 * Defaults are left out of the URL, so the home page stays `/`. Parsing is
 * deliberately forgiving: parameters have no order, an unknown value falls
 * back to its default, and anything missing takes the default too — a URL
 * someone typed or truncated still opens something sensible, and the address
 * bar is rewritten to the canonical form.
 */

export type WindowState = "fullscreen" | "window";

export interface Route {
  workspace: number;
  /** `null` when no window is open — the desktop by itself. */
  state: WindowState | null;
  filePath: string | null;
}

/** Kept in step with the glyph sets in `Waybar.tsx`. */
export const WORKSPACE_COUNT = 5;

export const DEFAULT_WORKSPACE = 1;
export const DEFAULT_STATE: WindowState = "fullscreen";

/** `state` value standing for "no window on this workspace". */
const DESKTOP = "desktop";

/**
 * Percent-encodes a file path but leaves its slashes alone: they are legal in
 * a query value (RFC 3986 §3.4) and `?file=work%20experience/Dräger.md` reads
 * far better than the `%2F` an encoder would otherwise produce.
 */
function encodePath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/g, "/");
}

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);

  const rawState = params.get("state");
  const state: WindowState | null =
    rawState === DESKTOP ? null : rawState === "window" ? "window" : DEFAULT_STATE;

  const rawWorkspace = Number(params.get("workspace"));
  const workspace =
    Number.isInteger(rawWorkspace) && rawWorkspace >= 1 && rawWorkspace <= WORKSPACE_COUNT
      ? rawWorkspace
      : DEFAULT_WORKSPACE;

  // A closed window has no file to show, so `file` only counts alongside a state.
  const filePath = state ? params.get("file") || null : null;

  return { workspace, state, filePath };
}

export function formatRoute({ workspace, state, filePath }: Route): string {
  const params: string[] = [];
  if (!state) params.push(`state=${DESKTOP}`);
  else {
    if (filePath) params.push(`file=${encodePath(filePath)}`);
    if (state !== DEFAULT_STATE) params.push(`state=${state}`);
  }
  if (workspace !== DEFAULT_WORKSPACE) params.push(`workspace=${workspace}`);
  return params.length ? `/?${params.join("&")}` : "/";
}
