/**
 * The debugger the Run and Debug panel starts. No page can open the browser's
 * own DevTools, so this is Eruda: a DevTools drawn by the page itself, with a
 * console, elements, network, resources and sources. It is half a megabyte,
 * so it is imported the first time someone asks for it and never before.
 *
 * Eruda only docks at the bottom, so it runs in its `inline` mode instead,
 * which fills a container of ours: a dock down the right edge. Opening it
 * shrinks `#root` by the dock's width (`--debugger-width`, see
 * `RunAndDebug.css`), the way docked DevTools narrows the page rather than
 * covering it. Inline mode has no close button or resizer, so the dock
 * brings its own.
 *
 * There is one per page, not one per window — it hooks the page's console and
 * network — so its state lives here rather than in any editor, and every
 * editor's panel reads the same status through `useSyncExternalStore`.
 */
import type { Eruda } from "eruda";

/** `open` and `hidden` are both running: hiding keeps the console's history. */
export type DebuggerStatus = "idle" | "starting" | "open" | "hidden" | "failed";

/** Neither the dock nor the page it leaves may get narrower than this. */
const MIN_WIDTH = 320;

let status: DebuggerStatus = "idle";
let eruda: Eruda | null = null;
let dock: HTMLElement | null = null;
let width = 0;
const listeners = new Set<() => void>();

function setStatus(next: DebuggerStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

export function subscribeDebugger(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function debuggerStatus(): DebuggerStatus {
  return status;
}

/** Keeps both the dock and the page at least `MIN_WIDTH` wide, if they fit. */
function clampWidth(px: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(px, window.innerWidth - MIN_WIDTH)));
}

function setWidth(px: number) {
  width = clampWidth(px);
  document.documentElement.style.setProperty("--debugger-width", `${width}px`);
}

/** Dragging the dock's left edge; pointer capture keeps the drag when the
 *  pointer crosses Eruda's shadow root or an iframe in the page. */
function bindResize(handle: HTMLElement) {
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    handle.setPointerCapture(down.pointerId);
    document.documentElement.classList.add("debugger-resizing");
    const move = (event: PointerEvent) => setWidth(window.innerWidth - event.clientX);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      document.documentElement.classList.remove("debugger-resizing");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", up, { once: true });
  });
}

function createDock(): { dock: HTMLElement; container: HTMLElement } {
  const aside = document.createElement("aside");
  aside.className = "debugger-dock";
  aside.setAttribute("aria-label", "Eruda debugger");
  aside.innerHTML = `
    <div class="debugger-dock-resize" role="separator" aria-orientation="vertical" aria-label="Resize the debugger"></div>
    <div class="debugger-dock-bar">
      <span class="debugger-dock-title">Eruda</span>
      <button class="debugger-dock-close" title="Close" aria-label="Close the debugger">
        <i class="codicon codicon-close" aria-hidden="true"></i>
      </button>
    </div>
    <div class="debugger-dock-body"><div></div></div>`;
  bindResize(aside.querySelector<HTMLElement>(".debugger-dock-resize")!);
  // Closing it ends the session, as in Chrome; the panel's Hide Debugger is
  // what keeps it running out of sight.
  aside.querySelector(".debugger-dock-close")!.addEventListener("click", stopDebugging);
  document.body.append(aside);
  // Eruda puts `all: initial` on its container, so it gets a bare element of
  // its own inside the body rather than the body, which must keep its layout.
  // Its panel is absolutely positioned, and the body is what it fills.
  return { dock: aside, container: aside.querySelector<HTMLElement>(".debugger-dock-body > div")! };
}

/**
 * Inline mode makes `eruda.hide()` a no-op, so hiding the dock never tells
 * the Elements tool it went away — and a highlight it drew over the page,
 * outside the dock, would stay. Hiding the tool clears it; `active` (untyped,
 * but what Eruda's own tab switching reads) still says it is the open tab, so
 * showing it again restores it.
 */
function elementsTool(): { active?: boolean; show(): unknown; hide(): unknown } | undefined {
  return eruda?.get("elements");
}

type Highlight = (part?: string) => void;

/** The Eruda internals `highlightOnHoverOnly` reaches into; none are typed. */
interface ElementsInternals {
  _detail?: {
    _highlight?: Highlight;
    _boxModel?: { on(event: string, fn: Highlight): unknown; off(event: string, fn: Highlight): unknown };
  };
}

/**
 * Eruda highlights the selected element for as long as the Elements detail
 * pane is showing, and in a dock 680px wide or more that pane is always
 * showing. The selection starts on <body>, so the whole page sat under a blue
 * overlay. Chrome only highlights what the pointer is over, so this does too:
 * the pane's whole-element highlight clears instead, and hovering a part of
 * its box-model diagram (margin, border, padding, content) still highlights
 * that part. The element picker is a separate path and is untouched.
 *
 * `_highlight` is an instance property the pane calls on every show, and the
 * box model was handed the same function when it was built, so both are
 * swapped. They are internals of Eruda 3.4, which is why `package.json` pins
 * it exactly: if a later version renames them, this does nothing and Eruda
 * keeps its own behaviour, so check the overlay by hand before bumping it.
 */
function highlightOnHoverOnly(instance: Eruda) {
  const detail = (instance.get("elements") as ElementsInternals | undefined)?._detail;
  const original = detail?._highlight;
  const boxModel = detail?._boxModel;
  const chobitsu = (instance as Eruda & { chobitsu?: { domain(name: string): { hideHighlight(): void } } })
    .chobitsu;
  if (!detail || !original || !boxModel || !chobitsu) return;

  const overlay = chobitsu.domain("Overlay");
  const onHoverOnly: Highlight = (part) =>
    part && part !== "all" ? original(part) : overlay.hideHighlight();
  detail._highlight = onHoverOnly;
  boxModel.off("highlight", original);
  boxModel.on("highlight", onHoverOnly);
}

function showDock() {
  if (!dock) return;
  dock.hidden = false;
  // A third of the screen the first time, as Chrome docks its own; after
  // that whatever it was dragged to, re-clamped in case the window shrank.
  setWidth(width || window.innerWidth / 3);
  document.documentElement.classList.add("debugger-docked");
}

/**
 * Loads Eruda if it has not been, docks it on the right and opens it on the
 * Elements tab. A debugger that is only hidden comes back on whichever tab it
 * was left on.
 */
export async function startDebugging(): Promise<void> {
  if (status === "starting" || status === "open") return;
  if (status === "hidden") {
    showDock();
    const elements = elementsTool();
    if (elements?.active) elements.show();
    setStatus("open");
    return;
  }
  setStatus("starting");
  try {
    eruda ??= (await import("eruda")).default;
    const created = createDock();
    dock = created.dock;
    showDock();
    // In a shadow root, so its styles and the site's cannot reach each other.
    eruda.init({
      container: created.container,
      inline: true,
      useShadowDom: true,
      defaults: { theme: "Dark" },
    });
    // Every init builds a new Elements tool, so this runs after each one.
    highlightOnHoverOnly(eruda);
    eruda.show("elements");
    setStatus("open");
  } catch (error) {
    // The chunk failed to load, most likely offline or after a redeploy.
    console.error("Could not start Eruda", error);
    removeDock();
    setStatus("failed");
  }
}

/** Hides the dock and gives the page its width back; Eruda keeps running. */
export function hideDebugger(): void {
  if (status !== "open" || !dock) return;
  elementsTool()?.hide();
  dock.hidden = true;
  document.documentElement.classList.remove("debugger-docked");
  setStatus("hidden");
}

function removeDock() {
  dock?.remove();
  dock = null;
  document.documentElement.classList.remove("debugger-docked");
}

/** Removes Eruda from the page, dock and all; it can be started again. */
export function stopDebugging(): void {
  if (status !== "open" && status !== "hidden") return;
  eruda?.destroy();
  removeDock();
  setStatus("idle");
}
