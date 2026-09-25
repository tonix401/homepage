/**
 * Generates `public/og-image.png`, the picture a shared link previews with: the
 * tiled desktop in the teal theme over the cat, Codium on the README with its
 * sidebar collapsed and the window tiled, so the bar and the wallpaper frame it.
 *
 *   npm run generate:og
 *
 * The output is committed, like the palettes, because CI has no reason to run
 * a browser — re-run this when the desktop's look changes enough that the
 * preview no longer matches it.
 *
 * It starts its own Vite server on a spare port, so it neither needs nor
 * disturbs a running dev server, and drives headless Chromium over the
 * DevTools protocol with Node's own WebSocket: nothing to install. Set
 * CHROMIUM to use a binary other than `chromium` on the PATH.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { OG_IMAGE_SIZE } from "../src/services/seo.ts";

const OUT = resolve("public/og-image.png");
const DEBUG_PORT = 9333;
/** How long the app gets to load, and then to settle after the reload. */
const SETTLE_MS = 4000;

/** Stored as `preferences.ts` stores them; see THEME_KEY and SUBJECT_KEY. */
const THEME = { key: "homepage.theme.v1", id: "teal" };
const SUBJECT = { key: "homepage.wallpaper.v1", id: "cat" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The layout to capture, applied to whatever desktop the first visit got:
 * its one editor shows the README, and it is tiled rather than maximized so
 * the bar and the wallpaper are in the picture. A second window would halve
 * the README's width. The session key is looked
 * up rather than imported, so a bumped `SESSION_KEY` cannot leave this behind.
 * The theme and wallpaper are preferences, so they go in `localStorage`.
 */
const LAYOUT = `(() => {
    localStorage.setItem(${JSON.stringify(THEME.key)}, ${JSON.stringify(THEME.id)});
    localStorage.setItem(${JSON.stringify(SUBJECT.key)}, ${JSON.stringify(SUBJECT.id)});
    const key = Object.keys(sessionStorage).find((k) => k.startsWith("homepage.session."));
    const desktop = JSON.parse(sessionStorage.getItem(key));
    const workspace = desktop.workspaces[desktop.workspace];
    const editor = workspace.windows[0];
    desktop.windows[editor].arg = "README.md";
    workspace.focus = editor;
    desktop.fullscreen = false;
    sessionStorage.setItem(key, JSON.stringify(desktop));
    location.reload();
  })()`;

async function connect(port: number): Promise<WebSocket> {
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200);
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = targets.find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener("open", r, { once: true }));
        return ws;
      }
    } catch {
      // Chromium is still starting.
    }
  }
  throw new Error(`Chromium never opened its debugging port ${port}`);
}

function protocol(ws: WebSocket) {
  let seq = 0;
  const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  return <T = unknown>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

const server = await createServer({ server: { port: 8099, strictPort: false }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("the Vite server reported no local URL");

const profile = mkdtempSync(join(tmpdir(), "og-image-"));
const chrome = spawn(process.env.CHROMIUM ?? "chromium", [
  "--headless=new",
  "--hide-scrollbars",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  "about:blank",
]);

try {
  const ws = await connect(DEBUG_PORT);
  const send = protocol(ws);
  await send("Emulation.setDeviceMetricsOverride", {
    ...OG_IMAGE_SIZE,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(SETTLE_MS);
  await send("Runtime.evaluate", { expression: LAYOUT });
  await sleep(SETTLE_MS);
  // The sidebar is the editor's own state, not the session's, so it is
  // collapsed the way a visitor would: with the title bar's layout button.
  await send("Runtime.evaluate", { expression: `document.querySelector(".vscode-layout-btn").click()` });
  await sleep(500);
  const { data } = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log(`wrote ${OUT} (${OG_IMAGE_SIZE.width}×${OG_IMAGE_SIZE.height})`);
  ws.close();
} finally {
  chrome.kill();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
