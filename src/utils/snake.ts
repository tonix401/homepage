/**
 * A line in the theme's primary that runs once round the bar's launcher
 * segment every few seconds while the workspace is empty, leading the eye to
 * the only thing there is to click. With less
 * motion asked for, an empty workspace gets the whole outline, held still.
 *
 * The segment is not its own box. It is a powerline block, so its outline
 * takes in the separator on each side: the notch the previous segment's arrow
 * cuts into its left end (the tail) and the arrow it points into the
 * wallpaper with on its right (the tip). The line is an SVG laid over all
 * three, created for the run and removed after, so the bar itself carries no
 * markup for it.
 */

export interface Span {
  left: number;
  right: number;
}

/** How long one lap takes, in milliseconds. */
export const SNAKE_DURATION = 1100;
/** How much of the outline the snake covers at once, out of 100. */
const SNAKE_LENGTH = 32;
/** Room round the outline for the stroke and its glow. */
const PAD = 6;

/**
 * The outline of a segment `height` tall, with its tail, body and tip laid
 * out left to right as `tail`, `body` and `tip`, in coordinates relative to
 * `tail.left`. Clockwise from the middle of the top edge: out to the tip's
 * point, back along the bottom, in to the tail's notch (whose apex is where
 * the tail meets the body), and along the top to the start.
 *
 * It starts mid-way along the top so the snake fades in and out on a plain
 * edge, and passes both the tip and the tail at full strength.
 */
export function segmentOutline(tail: Span, body: Span, tip: Span, height: number): string {
  const x = (n: number) => round(n - tail.left);
  const mid = round(height / 2);
  return [
    `M ${x((body.left + body.right) / 2)} 0`,
    `H ${x(body.right)}`,
    `L ${x(tip.right)} ${mid}`,
    `L ${x(body.right)} ${round(height)}`,
    `H ${x(tail.left)}`,
    `L ${x(body.left)} ${mid}`,
    `L ${x(tail.left)} 0`,
    "Z",
  ].join(" ");
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Runs the snake round `segment`, the launcher button, after `delay`
 * milliseconds, and returns a function that takes it away before its lap is
 * done. Does nothing when the segment is not showing or the visitor has asked
 * for less motion — `holdOutline` is their version.
 */
export function snakeAround(segment: Element | null, delay = 0): () => void {
  if (!segment || window.matchMedia(REDUCED_MOTION).matches) return () => {};
  const overlay = createOverlay();
  if (!placeOverlay(overlay, segment)) return () => {};
  const { svg, path } = overlay;
  // Opening an app mid-lap retitles the segment, which widens it: refit the
  // outline to it. The dash is in hundredths of the outline, so it keeps its
  // place along it. A segment that has gone takes the snake with it.
  const unfollow = follow(segment, () => {
    if (!placeOverlay(overlay, segment)) drop();
  });
  Object.assign(path.style, {
    strokeDasharray: `${SNAKE_LENGTH} ${100 - SNAKE_LENGTH}`,
    // Hidden until the delay is over; `fill: "backwards"` takes over then.
    opacity: "0",
  });
  document.body.append(svg);

  // A negative offset runs the dash forwards, clockwise, and one lap ends it
  // where it began, fading in and out on the top edge.
  const lap = path.animate(
    [
      { strokeDashoffset: 0, opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { opacity: 1, offset: 0.75 },
      { strokeDashoffset: -100, opacity: 0 },
    ],
    { duration: SNAKE_DURATION, delay, easing: "ease-in-out", fill: "backwards" },
  );
  // As in genie.ts: `finished` never settles in a hidden tab, so a timer backs it up.
  function drop() {
    unfollow();
    svg.remove();
  }
  lap.finished.then(drop, drop);
  setTimeout(drop, delay + SNAKE_DURATION + 200);
  return drop;
}

/**
 * The snake for a visitor who has asked for less motion: the whole outline,
 * drawn and left there, until the returned function is called. Only while
 * that preference holds, so it follows the setting being changed mid-visit,
 * and the snake takes over when it is switched off.
 *
 * It is refitted whenever the segment moves or changes width (see `follow`).
 */
export function holdOutline(segment: Element | null): () => void {
  if (!segment) return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  const overlay = createOverlay();
  const update = () => {
    if (query.matches && placeOverlay(overlay, segment)) {
      if (!overlay.svg.isConnected) document.body.append(overlay.svg);
    } else {
      overlay.svg.remove();
    }
  };
  const unfollow = follow(segment, update);
  query.addEventListener("change", update);
  update();
  return () => {
    unfollow();
    query.removeEventListener("change", update);
    overlay.svg.remove();
  };
}

/**
 * Calls `update` whenever `segment` may have moved or changed size, until the
 * returned function is called. The bar is not fixed round it: the title
 * changes its width, the side groups collapse at the breakpoints, and either
 * resizes the cluster that holds it. A `ResizeObserver` reports after layout
 * and before paint, so the outline is refitted on the very frame the segment
 * changes, never a frame behind.
 */
function follow(segment: Element, update: () => void): () => void {
  const observer = new ResizeObserver(update);
  observer.observe(segment);
  if (segment.parentElement) observer.observe(segment.parentElement);
  window.addEventListener("resize", update);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", update);
  };
}

interface Overlay {
  svg: SVGSVGElement;
  path: SVGPathElement;
}

/** An SVG for the outline, not yet on the page or placed. */
function createOverlay(): Overlay {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "fixed",
    // Over the bar (`z-index: 1`), which it outlines.
    zIndex: "2",
    pointerEvents: "none",
    overflow: "visible",
    filter: "drop-shadow(0 0 3px var(--theme-primary))",
  });

  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("transform", `translate(${PAD} ${PAD})`);
  // Measured in hundredths of the outline, whatever its real length.
  path.setAttribute("pathLength", "100");
  Object.assign(path.style, {
    fill: "none",
    stroke: "var(--theme-primary)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  });
  svg.append(path);
  return { svg, path };
}

/**
 * Fits the overlay round `segment` and its separators where they are now.
 * False when the segment is not showing, so there is nothing to outline.
 */
function placeOverlay({ svg, path }: Overlay, segment: Element): boolean {
  const body = segment.getBoundingClientRect();
  if (body.width === 0) return false;
  // The separators either side, or the button's own edges if either is missing.
  const tail = sibling(segment.previousElementSibling) ?? { left: body.left, right: body.left };
  const tip = sibling(segment.nextElementSibling) ?? { left: body.right, right: body.right };
  svg.setAttribute("width", String(tip.right - tail.left + 2 * PAD));
  svg.setAttribute("height", String(body.height + 2 * PAD));
  svg.style.left = `${tail.left - PAD}px`;
  svg.style.top = `${body.top - PAD}px`;
  path.setAttribute("d", segmentOutline(tail, body, tip, body.height));
  return true;
}

/** A powerline separator's horizontal extent, or `null` if `el` is not one. */
function sibling(el: Element | null): Span | null {
  if (!el?.classList.contains("wb-arrow")) return null;
  const { left, right } = el.getBoundingClientRect();
  return { left, right };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
