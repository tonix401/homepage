/**
 * Closing a window sends it into the bar's launcher segment, the way macOS
 * pours a window into the Dock.
 *
 * The desktop still closes the window at once — the survivors FLIP into the
 * gap on the same frame, and nothing waits on an animation. What flies off is
 * the closed window's own DOM: React detaches a deleted subtree's top node and
 * leaves everything under it intact, so `App` records the node before the
 * close and, once the commit has taken it out of the strip, `genieInto` puts
 * it back under `<body>` as an inert ghost and animates that.
 *
 * Two things do not survive the trip and are put back by hand or accepted:
 * scroll offsets, which reset whenever an element leaves the document (so the
 * snapshot records them), and iframes, which reload when re-attached — the
 * browser's HTML preview redraws inside the ghost, which at this speed reads as
 * nothing at all.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How long the genie takes, in milliseconds. About as long as macOS's. */
export const GENIE_DURATION = 440;

/**
 * Keyframes sampled over the run, each held until the next (`step-end`) rather
 * than blended: interpolating two `matrix3d`s decomposes them, which does not
 * keep neighbouring bands' shared edges together, and the window tore along
 * its seams between frames. At about 3.7ms apart they are finer than any
 * display's refresh, so holding them reads as smooth.
 */
const FRAMES = 120;
/**
 * Horizontal slices the window is cut into. Each is warped on its own, so the
 * sides are a polyline of this many segments: enough to read as a curve, few
 * enough that copying the window this many times stays cheap.
 */
export const BANDS = 10;

/** One edge of a band at one moment: where it runs, in the box's own pixels. */
export interface Row {
  y: number;
  left: number;
  right: number;
}

/**
 * The outline of a box at `from` pouring into `to`, `t` of the way through,
 * as the `BANDS + 1` rows that bound its bands, top to bottom. Coordinates
 * are relative to the box's top-left corner.
 *
 * It is shaped by a funnel: the mouth is the target itself, and an S-curve
 * runs from each side of it out to the box's bottom corners. The width of a
 * row is the funnel's width at the height the row has reached. Two things
 * happen, overlapping:
 *
 * - **The pinch.** The box bends into the funnel, its top edge going straight
 *   to the target, however far to the side that is. It starts at full speed
 *   and eases out, so the window answers the click on the first frame.
 * - **The pour.** Every row travels up to its place in the target, so the
 *   rows narrow as they climb the funnel and the window is slurped into the
 *   mouth, top first. Nothing moves the shape sideways as a whole: that is
 *   the funnel's doing, which is why a window beside the target does not
 *   shrink first and float over to it afterwards.
 *
 * The windows are always below the bar, so the near edge is the top one.
 */
export function genieOutline(from: Rect, to: Rect, t: number): Row[] {
  const { width: w, height: h } = from;
  const mouthLeft = to.left - from.left;
  const mouthRight = mouthLeft + to.width;
  // Where the funnel is at its narrowest: the target's bottom edge.
  const mouthY = to.top + to.height - from.top;

  const pinch = easeOutCubic(clamp(t / 0.45, 0, 1));
  const pour = easeInOutCubic(clamp((t - 0.05) / 0.95, 0, 1));

  const rows: Row[] = [];
  for (let j = 0; j <= BANDS; j++) {
    const at = j / BANDS;
    // From its own place in the box to the same fraction down the target.
    const y = at * h + (to.top - from.top + at * to.height - at * h) * pour;
    /** How far this row has narrowed, 0 to 1: all the way at the mouth. */
    const k = pinch * (1 - smoothstep(mouthY, h, y));
    rows.push({ y, left: mouthLeft * k, right: w + (mouthRight - w) * k });
  }
  return rows;
}

/** One slice of the ghost: where it sits in the box, and how it moves. */
export interface Band {
  top: number;
  height: number;
  keyframes: Keyframe[];
}

/**
 * The keyframes for a box at `from` pouring into `to`: one set of transforms
 * per band, and a fade for the whole.
 *
 * A real genie warps the window, and so does this, a band at a time: each
 * band's `matrix3d` maps its rectangle exactly onto its slice of the outline.
 * Its top and bottom edges stay horizontal, which makes the map affine along
 * every row, so two neighbouring bands agree point for point on the edge they
 * share and the window stays whole — border and all — while it squeezes.
 */
export function genieKeyframes(from: Rect, to: Rect): { bands: Band[]; fade: Keyframe[] } {
  const { width: w, height: h } = from;
  const bands: Band[] = Array.from({ length: BANDS }, (_, j) => ({
    top: (j * h) / BANDS,
    height: h / BANDS,
    keyframes: [],
  }));
  const fade: Keyframe[] = [];

  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    const rows = genieOutline(from, to, t);
    bands.forEach((band, j) => {
      band.keyframes.push({
        offset: t,
        transform: bandMatrix(w, band.height, rows[j], rows[j + 1], band.top),
        easing: "step-end",
      });
    });
    fade.push({ offset: t, opacity: round(1 - smoothstep(0.7, 1, t)) });
  }
  return { bands, fade };
}

/**
 * The projective map taking a `w` × `bh` box (with `transform-origin: 0 0`)
 * onto the trapezoid between `top` and `bottom`, whose `y` are relative to the
 * box's parent, which the band sits `offset` down.
 *
 * With u = x / w and v = y / bh, the map is
 * X = (W0·u + B·v + L0) / (1 + P·v) and Y = (E·v + T0) / (1 + P·v), where
 * P = W0 / W1 − 1 is the perspective that lets the two edges differ in width.
 */
function bandMatrix(w: number, bh: number, top: Row, bottom: Row, offset: number): string {
  const w0 = top.right - top.left;
  const w1 = bottom.right - bottom.left;
  const t0 = top.y - offset;
  const t1 = bottom.y - offset;
  const p = w0 / w1 - 1;
  const b = bottom.left * (1 + p) - top.left;
  const e = t1 * (1 + p) - t0;
  // Column-major, the 2D homography embedded with z left alone.
  const m = [w0 / w, 0, 0, 0, b / bh, e / bh, 0, p / bh, 0, 0, 1, 0, top.left, t0, 0, 1];
  return `matrix3d(${m.map((n) => round(n, 6)).join(", ")})`;
}

/** A window as it was the moment before it closed. */
export interface WindowSnapshot {
  node: HTMLElement;
  rect: Rect;
  /**
   * Every scrolled element inside it, since re-attaching resets them all — by
   * its index among the root and its descendants, so that each copy of the
   * window can find its own.
   */
  scrolls: [number, number, number][];
}

/** The root and all its descendants, in document order. */
function descendants(node: HTMLElement): HTMLElement[] {
  return [node, ...node.querySelectorAll<HTMLElement>("*")];
}

/** Records the window's root, where it is, and how far everything in it is scrolled. */
export function snapshotWindow(node: HTMLElement): WindowSnapshot {
  const { left, top, width, height } = node.getBoundingClientRect();
  const scrolls: WindowSnapshot["scrolls"] = [];
  descendants(node).forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) scrolls.push([i, el.scrollTop, el.scrollLeft]);
  });
  return { node, rect: { left, top, width, height }, scrolls };
}

/**
 * Pours a closed window into `target`. Does nothing if the node is somehow
 * still on the page (the close did not happen), the target is not showing, or
 * the visitor has asked for less motion — then the window simply goes.
 *
 * The window itself becomes the top band and a copy of it each of the others,
 * every one shifted up inside a band-sized box that hides the rest.
 */
export function genieInto(snapshot: WindowSnapshot, target: Element | null): void {
  const { node, rect, scrolls } = snapshot;
  if (node.isConnected || !target || rect.width === 0 || rect.height === 0) return;
  const to = target.getBoundingClientRect();
  if (to.width === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ghost = document.createElement("div");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    // Under the bar (`z-index: 1`), so the window goes in *behind* the
    // launcher; still above the strips, which have none and come earlier.
    zIndex: "0",
    pointerEvents: "none",
  });
  Object.assign(node.style, {
    position: "absolute",
    left: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    // The column's own transitions, FLIP and opening keyframe would fight these.
    transform: "none",
    transition: "none",
    animation: "none",
  });

  const { bands, fade } = genieKeyframes(rect, to);
  const copies = bands.map((band, j) => {
    const copy = j === 0 ? node : (node.cloneNode(true) as HTMLElement);
    copy.style.top = `${-band.top}px`;
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "absolute",
      left: "0",
      top: `${band.top}px`,
      width: `${rect.width}px`,
      // A pixel into the next band, which is drawn over it, so no hairline of
      // wallpaper shows between two bands that have been rasterized apart.
      height: `${band.height + (j < bands.length - 1 ? 1 : 0)}px`,
      overflow: "hidden",
      transformOrigin: "0 0",
    });
    box.append(copy);
    ghost.append(box);
    return copy;
  });
  document.body.append(ghost);
  for (const copy of copies) {
    const els = descendants(copy);
    for (const [i, top, left] of scrolls) {
      els[i].scrollTop = top;
      els[i].scrollLeft = left;
    }
  }

  // The easing is in the sampled curves; see `FRAMES` for how frames join.
  const timing: KeyframeAnimationOptions = { duration: GENIE_DURATION, fill: "forwards" };
  const fading = ghost.animate(fade, timing);
  bands.forEach((band, j) => (ghost.children[j] as HTMLElement).animate(band.keyframes, timing));
  // A cancelled animation rejects, which should drop the ghost just the same.
  // `finished` only settles on a rendering step, and a hidden tab takes none,
  // so a timer backs it up rather than leave the ghost attached until the tab
  // is shown again. It is invisible by then either way: it ends at opacity 0.
  const drop = () => ghost.remove();
  fading.finished.then(drop, drop);
  setTimeout(drop, GENIE_DURATION + 200);

  // The segment takes the window in with a nudge, as a Dock icon does.
  target.querySelector(".wb-icon")?.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }],
    { duration: 260, delay: GENIE_DURATION * 0.85, easing: "ease-out" },
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(from: number, to: number, x: number): number {
  const t = clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function round(n: number, digits = 3): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
