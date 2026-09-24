/**
 * What fastfetch can say about the machine it runs on, when it runs in a
 * browser: only what a page is told without asking — no permission prompt,
 * nothing fingerprinted beyond what the browser hands every site anyway.
 *
 * The parsing is here and pure, so the tests can feed it the strings real
 * browsers produce; `FastfetchApp` does the asking.
 */

/** "Linux", "Windows 11", "macOS 14.5", "Android 15", "iOS 18.1". */
export function osFromUserAgent(ua: string): string {
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  if (android) return `Android ${android[1]}`;
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/);
  if (ios) return `iOS ${ios[1]}.${ios[2]}`;
  const mac = ua.match(/Mac OS X (\d+)[_.](\d+)/);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown";
}

/**
 * The browser engine and its version, standing in for fastfetch's kernel:
 * the layer everything else on the page runs on. Chromium's own browsers
 * all report Blink; Firefox Gecko; Safari WebKit.
 */
export function engineFromUserAgent(ua: string): string {
  const firefox = ua.match(/Firefox\/(\d+(?:\.\d+)?)/);
  if (firefox) return `Gecko (Firefox ${firefox[1]})`;
  const chrome = ua.match(/(?:Chrome|Chromium|CriOS)\/(\d+)/);
  if (chrome) {
    const edge = ua.match(/Edg\/(\d+)/);
    return edge ? `Blink (Edge ${edge[1]})` : `Blink (Chromium ${chrome[1]})`;
  }
  const safari = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/);
  if (safari) return `WebKit (Safari ${safari[1]})`;
  return "unknown";
}

/** `a, b (c, d), e` -> `["a", "b (c, d)", "e"]`: commas inside parentheses stay. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0 && text.startsWith(", ", i)) {
      parts.push(text.slice(start, i));
      start = i + 2;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * The GPU's name out of a WebGL renderer string. Chromium wraps it in ANGLE's
 * `ANGLE (Vendor, Renderer (device id or driver) backend, API)`; the renderer,
 * cut before its parenthesised details, is the part a person would recognise.
 * Firefox and Safari report something plainer, or a deliberately vague
 * "Apple GPU", which is passed through as it is, less any bus suffix.
 */
export function gpuName(renderer: string): string {
  const angle = renderer.match(/^ANGLE \((.*)\)$/);
  if (!angle) return withoutBus(renderer).trim();
  const parts = splitTopLevel(angle[1]);
  const name = withoutBus(
    (parts.length >= 2 ? parts[1] : parts[0])
      .split(" (")[0]
      .replace(/\s+(Direct3D|D3D|OpenGL|Vulkan|Metal).*$/i, ""),
  ).trim();
  return name || renderer.trim();
}

/**
 * The NVIDIA driver's OpenGL name carries the bus and instruction set after
 * it — "NVIDIA GeForce RTX 2060/PCIe/SSE2" — bare or inside ANGLE's wrapper;
 * fastfetch would not print either.
 */
function withoutBus(name: string): string {
  return name.replace(/\/(PCIe?|AGP)(\/[A-Z0-9.]+)*$/i, "");
}

const RATES = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 240, 360];

/**
 * A refresh rate from measured frame intervals: the median, so one dropped
 * frame does not halve it, snapped to the nearest rate a display actually
 * runs at when within 6% of one, rounded otherwise.
 */
export function refreshRate(intervals: readonly number[]): number | null {
  const valid = intervals.filter((ms) => ms > 0 && Number.isFinite(ms)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const hz = 1000 / valid[Math.floor(valid.length / 2)];
  const near = RATES.reduce((best, r) => (Math.abs(r - hz) < Math.abs(best - hz) ? r : best));
  return Math.abs(near - hz) / near < 0.06 ? near : Math.round(hz);
}

/** fastfetch's uptime: "2 hours, 5 mins", "3 mins", "12 secs". */
export function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor(s / 3600) % 24;
  const mins = Math.floor(s / 60) % 60;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const parts = [
    days && plural(days, "day"),
    hours && plural(hours, "hour"),
    mins && plural(mins, "min"),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : plural(s, "sec");
}
