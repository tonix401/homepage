import { useLayoutEffect, useRef } from "react";
import { type CatFrame } from "../cat/catEngine";
import { catEyes, catLayout, drawCat, watchCat, type LookTarget, type Matrix } from "../cat/wallpaperCat";

/**
 * The animated cat over a wallpaper layer, drawn where the static wallpaper
 * draws it and glowing the same way. Now and then it looks up at the bar's
 * launcher button (`lookPose` in src/cat/wallpaperCat.ts).
 *
 * The wallpaper's glow is an SVG filter: a blurred copy of the cat under the
 * crisp one, the blur mixed half and half with the crisp lines and laid over
 * the blur again. Away from the lines that is the blur at 1.5 times its
 * strength, which is what painting the blurred copy, then half of it again,
 * then the crisp cat, comes to. Canvas blurs through `ctx.filter`; where that
 * is missing (Safari), a shadow of the same width stands in.
 *
 * The canvas covers only the cat and its glow, not the screen: it is redrawn
 * every frame, and a screen-sized canvas would repaint the whole wallpaper.
 */
export function WallpaperCat({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const layer = canvas.parentElement!;
    const ctx = canvas.getContext("2d")!;
    // The crisp cat, and its blur, drawn apart and then layered.
    const crisp = document.createElement("canvas");
    const blurred = document.createElement("canvas");
    const crispCtx = crisp.getContext("2d")!;
    const blurCtx = blurred.getContext("2d")!;
    const canFilter = "filter" in blurCtx;

    let layout: ReturnType<typeof catLayout> | null = null;
    let dpr = 1;

    const fit = () => {
      dpr = window.devicePixelRatio || 1;
      layout = catLayout(layer.clientWidth, layer.clientHeight);
      const { box } = layout;
      Object.assign(canvas.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      for (const c of [canvas, crisp, blurred]) {
        c.width = Math.round(box.width * dpr);
        c.height = Math.round(box.height * dpr);
      }
    };

    const draw = (frame: CatFrame) => {
      if (!layout) return;
      const { matrix, box, blur } = layout;
      // Rig coordinates to this canvas's device pixels.
      const [a, b, c, d, e, f] = matrix;
      const m: Matrix = [a * dpr, b * dpr, c * dpr, d * dpr, (e - box.left) * dpr, (f - box.top) * dpr];
      const { width, height } = canvas;

      crispCtx.clearRect(0, 0, width, height);
      drawCat(crispCtx, frame, color, m);

      ctx.clearRect(0, 0, width, height);
      if (canFilter) {
        blurCtx.clearRect(0, 0, width, height);
        blurCtx.filter = `blur(${blur * dpr}px)`;
        blurCtx.drawImage(crisp, 0, 0);
        blurCtx.filter = "none";
        ctx.drawImage(blurred, 0, 0);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(blurred, 0, 0);
        ctx.globalAlpha = 1;
      } else {
        // A canvas shadow's blur is twice the Gaussian's standard deviation.
        ctx.shadowColor = color;
        ctx.shadowBlur = 2 * blur * dpr;
        ctx.drawImage(crisp, 0, 0);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }
      ctx.drawImage(crisp, 0, 0);
    };

    fit();
    let latest: CatFrame | null = null;
    const observer = new ResizeObserver(() => {
      fit();
      if (latest) draw(latest);
    });
    observer.observe(layer);
    // The bar's window-title segment, which opens the launcher (Waybar.tsx).
    const target: LookTarget = () => {
      const launcher = document.querySelector("[data-launcher]")?.getBoundingClientRect();
      if (!layout || !launcher || launcher.width === 0) return null;
      const eyes = catEyes(layout.matrix);
      const origin = layer.getBoundingClientRect();
      return {
        from: { x: origin.left + eyes.x, y: origin.top + eyes.y },
        to: { x: launcher.left + launcher.width / 2, y: launcher.top + launcher.height / 2 },
      };
    };
    const stop = watchCat((frame) => {
      latest = frame;
      draw(frame);
    }, target);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [color]);

  return <canvas ref={canvasRef} className="arch-wallpaper-cat" aria-hidden="true" />;
}
