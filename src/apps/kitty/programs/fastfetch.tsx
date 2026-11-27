/**
 * fastfetch, printed into kitty's scrollback — the first thing a new kitty
 * window runs, and `fastfetch` (or `neofetch`, `ff`) at its prompt. Laid out the way
 * Tom's own fastfetch prints (~/.config/matugen/templates/colors-fastfetch.jsonc):
 * the Arch logo on the left, as text the way fastfetch draws it in a terminal
 * with no image support; on the right the title, two groups of keys between
 * `╭──╮` and `╰──╯` rules, keys in the terminal's ANSI colours and values in
 * the theme's primary, and a row of colour circles under it all. Everything
 * is characters: Tom's config puts Nerd Font icons beside the keys, and with
 * no Nerd Font loaded fastfetch prints the keys alone.
 *
 * What it reports is the visitor's own browser, not Tom's machine, and only
 * what a page is told without asking: no permission prompt is ever raised,
 * and nothing leaves the page. Like the real command it runs once — a
 * snapshot taken when the window opens — and the few fields that have to be
 * waited for (client hints, the battery, a measured refresh rate) fill in as
 * they arrive.
 */

import { useEffect, useState } from "react";
import "./Fastfetch.css";
import { readHeap } from "../../../utils/systemStats";
import { sessionStart } from "../../../utils/sessionStart";
import {
  engineFromUserAgent,
  formatUptime,
  gpuName,
  osFromUserAgent,
  refreshRate,
} from "../../../utils/browserInfo";

/** The terminal's ANSI palette — kitty's, from Tom's matugen template. */
const ANSI = {
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
};
/** color0–color7, for fastfetch's colour circles. */
const PALETTE = ["#1d202f", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6"];

/** fastfetch's own Arch logo, the one it prints when it cannot show an image. */
const ARCH_LOGO = [
  "                  -`",
  "                 .o+`",
  "                `ooo/",
  "               `+oooo:",
  "              `+oooooo:",
  "              -+oooooo+:",
  "            `/:-:++oooo+:",
  "           `/++++/+++++++:",
  "          `/++++++++++++++:",
  "         `/+++ooooooooooooo/`",
  "        ./ooosssso++osssssso+`",
  "       .oossssso-````/ossssss+`",
  "      -osssssso.      :ssssssso.",
  "     :osssssss/        osssso+++.",
  "    /ossssssss/        +ssssooo/-",
  "  `/ossssso+/:-        -:/+osssso+-",
  " `+sso+:-`                 `.-/+oso:",
  "`++:.                           `-/+/",
  ".`                                 `/",
].join("\n");

/** The low- and high-entropy client hints; Chromium only, and asked without a prompt. */
interface UAData {
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{
    platformVersion?: string;
    architecture?: string;
    bitness?: string;
    model?: string;
    fullVersionList?: { brand: string; version: string }[];
  }>;
}

interface Battery {
  level: number;
  charging: boolean;
}

/** `x86` + `64` -> `x86_64`; `arm` + `64` -> `aarch64`, as `uname -m` says it. */
function machine(architecture?: string, bitness?: string): string | null {
  if (!architecture) return null;
  if (architecture === "arm") return bitness === "64" ? "aarch64" : "arm";
  return bitness === "64" ? `${architecture}_64` : architecture;
}

/** The GPU WebGL reports, asked for once and the context let go straight after. */
function readGpu(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) as string;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return renderer ? gpuName(renderer) : null;
  } catch {
    return null;
  }
}

function formatGib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function formatMib(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

/** Everything that can be read on the spot. */
function snapshot() {
  const ua = navigator.userAgent;
  const dpr = window.devicePixelRatio || 1;
  const heap = readHeap();
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return {
    host: location.hostname || "localhost",
    os: osFromUserAgent(ua),
    engine: engineFromUserAgent(ua),
    device: `${coarse ? "Touch device" : "Desktop"}${navigator.maxTouchPoints > 0 && !coarse ? " (touchscreen)" : ""}`,
    packages: performance.getEntriesByType("resource").length,
    threads: navigator.hardwareConcurrency || null,
    gpu: readGpu(),
    memory:
      deviceMemory !== undefined
        ? // deviceMemory is rounded down to a power of two and capped at 8.
          `${deviceMemory >= 8 ? "8+ GiB" : `${deviceMemory} GiB`} (JS heap ${heap ? formatMib(heap.usedJSHeapSize) : "n/a"})`
        : heap
          ? `${formatMib(heap.usedJSHeapSize)} / ${formatGib(heap.jsHeapSizeLimit)} (JS heap)`
          : null,
    width: Math.round(screen.width * dpr),
    height: Math.round(screen.height * dpr),
    scale: dpr,
    locale: `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    // Since this tab's session began, not this page load: a reload keeps it.
    uptime: formatUptime(Date.now() - sessionStart()),
  };
}

export function Fastfetch() {
  const [info] = useState(snapshot);
  const [hints, setHints] = useState<{ os?: string; arch?: string | null; model?: string; engine?: string }>({});
  const [battery, setBattery] = useState<Battery | null>(null);
  const [hz, setHz] = useState<number | null>(null);

  useEffect(() => {
    let live = true;

    // Client hints give the real platform version and CPU architecture, which
    // the frozen user-agent string no longer does.
    const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
    uaData
      ?.getHighEntropyValues(["platformVersion", "architecture", "bitness", "model", "fullVersionList"])
      .then((v) => {
        if (!live) return;
        const arch = machine(v.architecture, v.bitness);
        const major = Number.parseInt(v.platformVersion ?? "", 10);
        const os =
          uaData.platform === "Windows"
            ? major >= 13
              ? "Windows 11"
              : "Windows 10"
            : uaData.platform === "macOS" && v.platformVersion
              ? `macOS ${v.platformVersion}`
              : uaData.platform || undefined;
        const brand = v.fullVersionList?.find((b) => /Chrom|Edge|Opera|Brave/.test(b.brand) && !/Not/.test(b.brand));
        setHints({
          os: os && arch ? `${os} ${arch}` : os,
          arch,
          model: v.model || undefined,
          engine: brand ? `Blink (${brand.brand} ${brand.version})` : undefined,
        });
      })
      .catch(() => {});

    (navigator as Navigator & { getBattery?: () => Promise<Battery> })
      .getBattery?.()
      .then((b) => live && setBattery({ level: b.level, charging: b.charging }))
      .catch(() => {});

    // The refresh rate, from the intervals between animation frames. A
    // hidden tab gets none, so the field simply waits for the tab to show.
    const intervals: number[] = [];
    let last = 0;
    let frame = requestAnimationFrame(function tick(now) {
      if (last) intervals.push(now - last);
      last = now;
      if (intervals.length < 40) frame = requestAnimationFrame(tick);
      else if (live) setHz(refreshRate(intervals));
    });

    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const cpu = [hints.arch, info.threads && `${info.threads} threads`].filter(Boolean).join(" · ");
  const display = `${info.width}x${info.height}${hz ? ` @ ${hz} Hz` : ""}${info.scale !== 1 ? ` (scale ${+info.scale.toFixed(2)})` : ""}`;

  const groups: { key: string; colour: string; value: string | null }[][] = [
    [
      { key: "OS", colour: ANSI.red, value: hints.os ?? info.os },
      { key: "Device", colour: ANSI.yellow, value: hints.model ?? info.device },
      { key: "Kernel", colour: ANSI.green, value: hints.engine ?? info.engine },
      { key: "Packages", colour: ANSI.cyan, value: `${info.packages} (loaded by this page)` },
      // kitty is the terminal; jīzǐ is the file manager that runs inside it.
      { key: "Terminal", colour: ANSI.blue, value: "kitty" },
      { key: "WM", colour: ANSI.magenta, value: "Hyprland" },
    ],
    [
      { key: "CPU", colour: ANSI.red, value: cpu || null },
      { key: "GPU", colour: ANSI.yellow, value: info.gpu },
      { key: "Memory", colour: ANSI.green, value: info.memory },
      { key: "Display", colour: ANSI.cyan, value: display },
      { key: "Locale", colour: ANSI.blue, value: info.locale },
      { key: "Uptime", colour: ANSI.magenta, value: info.uptime },
      {
        key: "Battery",
        colour: ANSI.red,
        value: battery
          ? `${Math.round(battery.level * 100)}% [${battery.charging ? "AC Connected" : "Discharging"}]`
          : null,
      },
    ],
  ];

  return (
    <div className="ff">
      <pre className="ff-logo" aria-hidden="true">
        {ARCH_LOGO}
      </pre>

      <div className="ff-info">
        <div className="ff-title">guest@{info.host}</div>
        {groups.map((group, g) => (
          <div key={g} className="ff-group">
            <div className="ff-rule">╭{"─".repeat(44)}╮</div>
            {group
              .filter((row) => row.value !== null)
              .map((row) => (
                <div key={row.key} className="ff-row">
                  <span className="ff-key" style={{ color: row.colour }}>
                    {row.key}
                  </span>
                  <span className="ff-sep">:</span>
                  <span className="ff-value">{row.value}</span>
                </div>
              ))}
            <div className="ff-rule">╰{"─".repeat(44)}╯</div>
          </div>
        ))}
        <div className="ff-colors" aria-hidden="true">
          {PALETTE.map((colour) => (
            <span key={colour} style={{ color: colour }}>
              ●
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
