/**
 * fastfetch, as a window — laid out the way Tom's own fastfetch prints
 * (~/.config/matugen/templates/colors-fastfetch.jsonc): his outlined Arch
 * logo on the left; on the right the title, two groups of keys between
 * `╭──╮` and `╰──╯` rules, keys in the terminal's ANSI colours and values in
 * the theme's primary, and a row of colour circles under it all.
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
import { Icon } from "../../components/Icon";
import { WindowButtons } from "../../components/WindowButtons";
import { readHeap } from "../../utils/systemStats";
import { sessionStart } from "../../utils/sessionStart";
import {
  engineFromUserAgent,
  formatUptime,
  gpuName,
  osFromUserAgent,
  refreshRate,
} from "../../utils/browserInfo";
import { type AppRenderProps } from "../types";

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

/** Stand-ins for the Nerd Font glyphs, which the site does not load. */
const icons = {
  title: "M12 3 3.5 20.5c3-1.8 5.5-2.8 8.5-2.8s5.5 1 8.5 2.8z",
  os: "M12 3 3.5 20.5c3-1.8 5.5-2.8 8.5-2.8s5.5 1 8.5 2.8z",
  device: "M5 4h14v11H5zM2 19h20",
  kernel: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  packages: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  terminal: "M4 17l6-5-6-5M12 19h8",
  wm: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  cpu: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M5 5h14v14H5zM9 9h6v6H9z",
  gpu: "M2 7h20v10H2zM6 11h.01M10 11h4M6 17v3M18 17v3",
  memory: "M3 7h18v10H3zM7 11v2M11 11v2M15 11v2M19 11v2",
  display: "M3 4h18v12H3zM8 20h8M12 16v4",
  locale: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  uptime: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  battery: "M2 8h16v8H2zM22 11v2M5 11h6v2H5z",
};

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

export function FastfetchApp({ maximized, handle }: AppRenderProps) {
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

  const groups: { key: string; icon: string; colour: string; value: string | null }[][] = [
    [
      { key: "OS", icon: icons.os, colour: ANSI.red, value: hints.os ?? info.os },
      { key: "Device", icon: icons.device, colour: ANSI.yellow, value: hints.model ?? info.device },
      { key: "Kernel", icon: icons.kernel, colour: ANSI.green, value: hints.engine ?? info.engine },
      { key: "Packages", icon: icons.packages, colour: ANSI.cyan, value: `${info.packages} (loaded by this page)` },
      // kitty is the terminal; jīzǐ is the file manager that runs inside it.
      { key: "Terminal", icon: icons.terminal, colour: ANSI.blue, value: "kitty" },
      { key: "WM", icon: icons.wm, colour: ANSI.magenta, value: "Hyprland" },
    ],
    [
      { key: "CPU", icon: icons.cpu, colour: ANSI.red, value: cpu || null },
      { key: "GPU", icon: icons.gpu, colour: ANSI.yellow, value: info.gpu },
      { key: "Memory", icon: icons.memory, colour: ANSI.green, value: info.memory },
      { key: "Display", icon: icons.display, colour: ANSI.cyan, value: display },
      { key: "Locale", icon: icons.locale, colour: ANSI.blue, value: info.locale },
      { key: "Uptime", icon: icons.uptime, colour: ANSI.magenta, value: info.uptime },
      {
        key: "Battery",
        icon: icons.battery,
        colour: ANSI.red,
        value: battery
          ? `${Math.round(battery.level * 100)}% [${battery.charging ? "AC Connected" : "Discharging"}]`
          : null,
      },
    ],
  ];

  return (
    <div className={`ff${maximized ? "" : " ff--windowed"}`}>
      <div className="ff-topline">
        <span className="ff-host">tom@box</span>&nbsp;~
        <WindowButtons handle={handle} maximized={maximized} />
      </div>

      <div className="ff-scroll">
        <div className="ff-prompt">
          <span className="ff-arrow">❯</span> fastfetch
        </div>

        <div className="ff-body">
          {/* Tom's own logo, from his matugen template: the Arch mark as a
              single stroked outline in the theme's primary. The viewBox is
              the outline's own bounds, stroke included, rather than the
              template's 100×100 page, so the CSS margins either side of the
              logo are margins round the drawing itself. */}
          <svg className="ff-logo" viewBox="0.589 0.797 95.357 95.357" aria-hidden="true">
            <path
              transform="translate(-7.1503347,-6.4349856)"
              d="m 7.9893252,102.33945 c 0,0 19.2207708,-35.003357 33.3378308,-63.374852 1.162263,-2.066248 4.947689,2.601026 11.956677,4.674084 C 50.030098,39.781699 42.867753,34.948247 44.374189,32.236511 49.029646,21.332968 53.716899,12.478125 55.354611,7.4820665 59.554654,19.76364 79.425793,58.020522 91.7241,81.451336 c -0.906371,-0.289598 -5.834286,-3.084389 -9.819306,-3.732531 6.091464,4.099901 12.872781,9.504777 12.872781,9.504777 l 8.069135,15.115868 c 0,0 -27.812455,-15.368699 -37.156702,-15.598205 C 66.541242,74.326637 63.770811,62.937785 55.291203,62.900086 45.431351,62.856251 43.959713,80.559055 45.33625,86.61443 34.442634,87.891326 7.9893252,102.33945 7.9893252,102.33945 Z"
            />
          </svg>

          <div className="ff-info">
            <div className="ff-title">
              <Icon className="ff-icon" path={icons.title} />
              guest@{info.host}
            </div>
            {groups.map((group, g) => (
              <div key={g} className="ff-group">
                <div className="ff-rule">╭{"─".repeat(44)}╮</div>
                {group
                  .filter((row) => row.value !== null)
                  .map((row) => (
                    <div key={row.key} className="ff-row">
                      <Icon className="ff-icon" path={row.icon} />
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

        <div className="ff-prompt">
          <span className="ff-arrow">❯</span> <span className="ff-cursor" />
        </div>
      </div>
    </div>
  );
}
