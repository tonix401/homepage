/**
 * imv, the Wayland image viewer, as a window: the image on black, scaled to
 * fit, with imv's default key binds and its overlay on `d`.
 *
 * The payload is the image's path. imv steps through the other images in the
 * same folder, as it does when a file manager opens one with it; a step is
 * `setArg`, so a reload comes back to the same image. The view — zoom, pan,
 * rotation, scaling mode, the overlay — is the window's own and starts over
 * on every image, as imv's does.
 *
 * Without an image it is what imv is when started with nothing to show: a
 * black window.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import "./Imv.css";
import { useTree } from "../../utils/fileStore";
import { SCALING_MODES, type ScalingMode, fitScale, imagesBeside, overlayText } from "../../utils/imv";
import { WindowButtons } from "../../components/WindowButtons";
import { type AppRenderProps } from "../types";

/** Where the image sits: `zoom` null is the scaling mode's own fit. */
interface View {
  zoom: number | null;
  x: number;
  y: number;
  rotation: number;
}

const INITIAL: View = { zoom: null, x: 0, y: 0, rotation: 0 };
/** How far one key press zooms, and one notch of the wheel. */
const KEY_ZOOM = 1.25;
const WHEEL_ZOOM = 1.1;
/** `hjkl`'s step, from imv's default binds (`pan 50 0`). */
const PAN = 50;
/** An image with no size of its own — an SVG without one — is drawn as a browser draws it. */
const NO_SIZE = { width: 300, height: 150 };

/** Keys typed into a text field belong to that field. */
function belongsToTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

export function ImvApp({ arg, focused, maximized, handle }: AppRenderProps) {
  const tree = useTree();
  // `x` closes an image: it leaves this window's list, not the folder.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const images = arg ? imagesBeside(tree, arg).filter((f) => !closed.has(f.path)) : [];
  const index = images.findIndex((f) => f.path === arg);
  const image = index === -1 ? null : images[index];

  const [mode, setMode] = useState<ScalingMode>("full");
  const [smooth, setSmooth] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [view, setView] = useState<View>(INITIAL);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // A new image starts with a fresh view, as imv resets its viewport. Adjusted
  // during the render that notices, so the old zoom never shows on it.
  const [shown, setShown] = useState(arg);
  if (shown !== arg) {
    setShown(arg);
    setView(INITIAL);
    setNatural(null);
  }

  const turned = view.rotation % 180 !== 0;
  const size = natural ?? NO_SIZE;
  const fit = fitScale(mode, turned ? { width: size.height, height: size.width } : size, box);
  const scale = view.zoom ?? fit;

  // Measured before the first paint, so the image never shows at a scale of
  // nothing, and again whenever the window is resized.
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // What the listeners below need of the latest render, without re-binding
  // them on every pan.
  const live = useRef({ images, index, scale, arg, handle });
  useEffect(() => {
    live.current = { images, index, scale, arg, handle };
  });

  /** Zooms by `factor`, keeping the point `at` (from the stage's centre) where it is. */
  const zoomBy = useCallback((factor: number, at = { x: 0, y: 0 }) => {
    setView((v) => {
      const from = v.zoom ?? live.current.scale;
      const to = Math.min(Math.max(from * factor, 0.01), 100);
      const k = to / from;
      return { ...v, zoom: to, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
    });
  }, []);

  // The wheel zooms at the pointer. Bound by hand: React's wheel listener is
  // passive, and the page must not scroll under it.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      zoomBy(event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM, at);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // imv's default binds (`/etc/imv_config`). Only the focused window answers.
  const lastG = useRef(0);
  useEffect(() => {
    if (!focused) return;
    const go = (to: number) => {
      const { images: list, handle: h } = live.current;
      if (list.length) h.setArg(list[((to % list.length) + list.length) % list.length].path);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.altKey || event.defaultPrevented || belongsToTarget(event)) return;
      const { index: at, images: list, arg: current, handle: h } = live.current;
      if (event.ctrlKey) {
        if (event.key !== "r") return;
        setView((v) => ({ ...v, rotation: (v.rotation + 90) % 360 }));
      } else {
        switch (event.key) {
          case "q":
            h.close();
            break;
          case "ArrowLeft":
          case "[":
            go(at - 1);
            break;
          case "ArrowRight":
          case "]":
            go(at + 1);
            break;
          case "g":
            // `gg`: two presses close together.
            if (event.timeStamp - lastG.current < 600) go(0);
            lastG.current = event.timeStamp;
            break;
          case "G":
            go(-1);
            break;
          case "j":
            setView((v) => ({ ...v, y: v.y - PAN }));
            break;
          case "k":
            setView((v) => ({ ...v, y: v.y + PAN }));
            break;
          case "h":
            setView((v) => ({ ...v, x: v.x + PAN }));
            break;
          case "l":
            setView((v) => ({ ...v, x: v.x - PAN }));
            break;
          case "ArrowUp":
          case "+":
          case "i":
            zoomBy(KEY_ZOOM);
            break;
          case "ArrowDown":
          case "-":
          case "o":
            zoomBy(1 / KEY_ZOOM);
            break;
          case "x": {
            // Closes the image: the next one shows, and closing the last quits.
            if (!current) return;
            const rest = list.filter((f) => f.path !== current);
            if (rest.length === 0) return h.close();
            setClosed((c) => new Set([...c, current]));
            h.setArg(rest[Math.min(at, rest.length - 1)].path);
            break;
          }
          case "f":
            h.toggleFullscreen();
            break;
          case "d":
            setOverlay((o) => !o);
            break;
          case "c":
            setView((v) => ({ ...v, x: 0, y: 0 }));
            break;
          case "s":
            setMode((m) => SCALING_MODES[(SCALING_MODES.indexOf(m) + 1) % SCALING_MODES.length]);
            setView((v) => ({ ...v, zoom: null, x: 0, y: 0 }));
            break;
          case "S":
            setSmooth((s) => !s);
            break;
          case "a":
            setView((v) => ({ ...v, zoom: 1 }));
            break;
          case "r":
            setView(INITIAL);
            break;
          default:
            return;
        }
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, zoomBy]);

  // Dragging pans.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    drag.current = { x: event.clientX, y: event.clientY };
    setView((v) => ({ ...v, x: v.x + event.clientX - from.x, y: v.y + event.clientY - from.y }));
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div className={`imv${maximized ? "" : " imv--windowed"}`}>
      <div
        className="imv-stage"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {image?.src && (
          <img
            key={image.path}
            className="imv-image"
            src={image.src}
            alt={image.name}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              const img = event.currentTarget;
              setNatural(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : NO_SIZE);
            }}
            style={{
              width: size.width,
              height: size.height,
              visibility: natural ? "visible" : "hidden",
              imageRendering: smooth ? "auto" : "pixelated",
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation}deg) scale(${scale})`,
            }}
          />
        )}
      </div>
      {overlay && image && (
        <div className="imv-overlay">{overlayText(index, images.length, image.name, natural, scale, mode)}</div>
      )}
      <div className="imv-buttons">
        <WindowButtons handle={handle} maximized={maximized} />
      </div>
    </div>
  );
}
