import { type PointerEvent } from "react";

/**
 * Pointer handlers that seek to wherever the pointer is along an element, and
 * keep seeking while it drags: the element captures the pointer, so a scrub
 * that leaves it still steers.
 */
export function scrubHandlers(toTime: (x: number, el: HTMLElement) => number, onSeek: (t: number) => void) {
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      onSeek(toTime(e.clientX, e.currentTarget));
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      onSeek(toTime(e.clientX, e.currentTarget));
    },
  };
}
