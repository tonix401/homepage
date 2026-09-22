import { useEffect, useState } from "react";

/**
 * Approximate CPU and memory figures for the Waybar's cpu/memory modules.
 *
 * Neither is the real thing — a page cannot ask the browser what the machine
 * is doing — so both are rough on purpose and each module's tooltip says what
 * it actually measured.
 */

/** How often the main thread is checked in on. */
const SAMPLE_MS = 100;

/** How much history one displayed reading covers. */
const WINDOW_MS = 1000;

const SAMPLES_PER_WINDOW = WINDOW_MS / SAMPLE_MS;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Main-thread busyness over one window: the share of wall-clock time the event
 * loop owed us and could not deliver, because it was running something else.
 *
 * This is the tab's own load, not the machine's — nothing a page can call
 * reports what other processes are doing, and an earlier attempt to infer it
 * by timing a fixed arithmetic probe measured CPU frequency scaling instead
 * (an idle core clocks down, so the probe ran *slower* when the machine was
 * quiet) and read ~57% on a machine sitting at 4%.
 */
export function cpuLoad(
  lagsMs: readonly number[],
  windowMs: number = WINDOW_MS,
): number {
  const blocked = lagsMs.reduce((sum, lag) => sum + lag, 0);
  return clamp01(blocked / windowMs);
}

/** Waybar-sized byte counts: "48MB", "1.2GB". */
export function formatBytes(bytes: number): string {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)}GB`
    : `${Math.round(bytes / 1e6)}MB`;
}

interface HeapInfo {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** `performance.memory` — Chromium only, and not on the standards track. */
function readHeap(): HeapInfo | null {
  const memory = (performance as Performance & { memory?: HeapInfo }).memory;
  return memory && typeof memory.usedJSHeapSize === "number" ? memory : null;
}

/** `navigator.deviceMemory` — Chromium only; total RAM in GB, coarsely rounded. */
function readDeviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

export interface SystemStats {
  /** This tab's main-thread load, 0..1. */
  cpu: number;
  cpuTitle: string;
  /** What the memory module shows, or null when no API reports anything. */
  memory: string | null;
  memoryTitle: string;
}

export function useSystemStats(): SystemStats {
  const [cpu, setCpu] = useState(0);
  const [heapUsed, setHeapUsed] = useState<number | null>(
    () => readHeap()?.usedJSHeapSize ?? null,
  );

  useEffect(() => {
    const lags: number[] = [];
    let last = performance.now();
    let resync = false;
    let sinceRender = 0;

    const id = setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - last - SAMPLE_MS);
      last = now;

      // Timers are throttled to a crawl in a background tab, so samples taken
      // there — and the first one after coming back — measure the browser's
      // throttling rather than any load. Drop the window and start over.
      if (document.hidden || resync) {
        resync = document.hidden;
        lags.length = 0;
        sinceRender = 0;
        return;
      }

      lags.push(lag);
      if (lags.length > SAMPLES_PER_WINDOW) lags.shift();

      // Sample ten times a second, but only redraw once, so the reading covers
      // a full second of history without the number flickering.
      if (++sinceRender < SAMPLES_PER_WINDOW) return;
      sinceRender = 0;
      setCpu(cpuLoad(lags));
      setHeapUsed(readHeap()?.usedJSHeapSize ?? null);
    }, SAMPLE_MS);

    return () => clearInterval(id);
  }, []);

  const cores = navigator.hardwareConcurrency;
  const cpuTitle =
    `CPU: ${Math.round(cpu * 100)}% of this tab's main thread` +
    (cores ? ` · ${cores} logical cores` : "");

  const heap = readHeap();
  const deviceGb = readDeviceMemory();

  if (heapUsed !== null && heap) {
    return {
      cpu,
      cpuTitle,
      memory: formatBytes(heapUsed),
      memoryTitle: `Memory: ${formatBytes(heapUsed)} JS heap`,
    };
  }

  if (deviceGb !== undefined) {
    return {
      cpu,
      cpuTitle,
      memory: `${deviceGb}GB`,
      memoryTitle: `Memory: ${deviceGb} GB of device RAM`,
    };
  }

  return { cpu, cpuTitle, memory: null, memoryTitle: "" };
}
