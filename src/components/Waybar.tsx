import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./Waybar.css";
import { WORKSPACE_LANGUAGES, type WorkspaceLanguage } from "../utils/desktop";
import { useSystemStats } from "../utils/systemStats";
import { holdOutline, snakeAround } from "../utils/snake";
import { type Point } from "../utils/menuPlacement";
import { Icon } from "./Icon";
import { APP_ICONS } from "../apps/icons";
import { type AppId } from "../apps/ids";

interface WaybarProps {
  workspace: number;
  language: WorkspaceLanguage;
  /** Which apps each workspace holds, in strip order. Missing means empty. */
  workspaceApps: ReadonlyMap<number, readonly AppId[]>;
  onWorkspaceChange: (workspace: number) => void;
  onLanguageChange: (language: WorkspaceLanguage) => void;
  /** The Arch segment: the editor, maximized, on its default page. */
  onHome: () => void;
  /** What the window-title segment reports; clicking it opens the launcher. */
  focusedApp: AppId | null;
  focusedTitle: string | null;
  /** Opens the launcher menu at a point: here, just under this segment. */
  onAppMenu: (at: Point) => void;
  /** Nothing open on this workspace: the launcher segment pulses to say so. */
  empty: boolean;
  /** The launcher menu is open, so the segment has nothing left to ask for. */
  menuOpen: boolean;
}

/**
 * How many app icons one workspace pill names individually. A strip may hold
 * more (see `MAX_WINDOWS`), and past this it stops naming them at all: showing
 * the first three of five would claim the workspace holds three. One
 * "several windows" glyph says what is true instead, and the pill's
 * aria-label gives the count.
 */
const WS_MAX_ICONS = 3;

const HOST_LABEL = "tom@box";
/** What the window-title segment says while no window is focused. */
const NO_WINDOW_LABEL = "App Launcher";

/** What the music module is "playing". */
const RICKROLL_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/** How long the bell segment stays lit and swinging after a click, in ms. */
const RING_MS = 700;

/**
 * The notification chime, synthesised rather than shipped as an audio file so
 * the site stays a pile of static text. Two sine partials an octave apart per
 * note, two notes a fifth apart (G5 -> D6), each with a plucked exponential
 * decay — a bell is a struck body, so the attack is immediate and only the
 * tail is long.
 *
 * The context is created on the click that plays the first chime: browsers
 * refuse to start one without a gesture, and a suspended context would stay
 * silent for the rest of the page's life.
 */
let audioCtx: AudioContext | null = null;

function playRing() {
  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  // A context can be suspended again when the tab is backgrounded.
  void ctx.resume();

  const start = ctx.currentTime + 0.01;
  for (const [note, freq] of [[0, 783.99], [1, 1174.66]] as const) {
    const at = start + note * 0.12;
    for (const [partial, gain] of [[1, 0.045], [2, 0.015]] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = freq * partial;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(gain, at + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(env).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.95);
    }
  }
}

/**
 * Segment fills, mirroring ~/.config/waybar/style.css. Values are matugen
 * Material-You roles — see the palette comment in Waybar.css.
 */
const FILL = {
  primary: "var(--wb-primary)",
  secondary: "var(--wb-secondary)",
  tertiary: "var(--wb-tertiary)",
  container: "var(--wb-surface-container)",
  containerHigh: "var(--wb-surface-container-highest)",
  none: "transparent",
} as const;

type Fill = (typeof FILL)[keyof typeof FILL];

/** Feather-style 24x24 stroke icons — no Nerd Font is loaded, so glyphs are inline. */
const icons = {
  cpu: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M5 5h14v14H5zM9 9h6v6H9z",
  memory: "M3 7h18v10H3zM7 11v2M11 11v2M15 11v2M19 11v2",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  window: "M3 5h18v14H3zM3 9h18",
  bell: "M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10 20a2 2 0 0 0 4 0",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 15h8",
  // More windows than a pill can name: a strip of columns, which is what the
  // workspace actually looks like. Overlapping window outlines were the other
  // candidate and turn to mush at the 14px the pill draws them at.
  windows: "M3 5h4v14H3zM10 5h4v14h-4zM17 5h4v14h-4z",
  bluetooth: "M7 7l10 10-5 4V3l5 4L7 17",
  wifi: "M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0M8.5 16.5a6 6 0 0 1 7 0M12 20h.01",
  vpn: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  volume: "M4 9h4l5-4v14l-5-4H4zM17 8.5a5 5 0 0 1 0 7",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v3",
  brightness: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
} as const;

/**
 * Workspace glyph sets, one glyph per workspace (see `WORKSPACE_COUNT`), one
 * entry per `WORKSPACE_LANGUAGES` name. Clicking the keyboard segment — the
 * real bar's layout switcher — cycles between them, which is a route change,
 * so the choice survives a reload and a shared link; `label` is what that
 * segment shows.
 */
/**
 * How long a workspace glyph spins when the numerals change, in ms — must
 * match `wb-ws-spin` in Waybar.css, since the glyphs are swapped at the
 * halfway mark, where the animation has scaled them to nothing.
 */
const WS_SPIN_MS = 420;

/** How far below the launcher segment, in px, its menu opens. */
const LAUNCHER_DROP = 6;

/** How often, in ms, a line runs round the launcher while the workspace is empty. */
const SNAKE_EVERY = 5000;

/** How close, in px, a side cluster may come to the pill before it is crowded. */
const CROWD_GAP = 12;

const WS_LANGUAGES: Record<WorkspaceLanguage, { label: string; glyphs: string[] }> = {
  en: { label: "Eng", glyphs: ["1", "2", "3", "4", "5"] },
  cn: { label: "中文", glyphs: ["一", "二", "三", "四", "五"] },
  roman: { label: "Rom", glyphs: ["I", "II", "III", "IV", "V"] },
};

/**
 * The Arch "A" from public/general/white_arch.svg, inlined so it can take the
 * segment's on_* colour — the asset itself is white and vanishes on the
 * light primary fill.
 */
function ArchIcon() {
  return (
    <svg className="ui-icon ui-icon--filled wb-icon" viewBox="53 96 106 104" aria-hidden="true">
      <path d="m 57.35468,196.22952 c 0,0 19.22077,-35.00336 33.33783,-63.37485 1.162263,-2.06625 4.947689,2.60102 11.95668,4.67408 -3.253738,-3.85698 -10.416083,-8.69044 -8.909647,-11.40217 4.655457,-10.90354 9.342707,-19.75839 10.980427,-24.75445 4.20004,12.28158 24.07118,50.53846 36.36948,73.96927 -0.90637,-0.28959 -5.83428,-3.08439 -9.8193,-3.73253 6.09146,4.0999 12.87278,9.50478 12.87278,9.50478 l 8.06913,15.11587 c 0,0 -27.81245,-15.3687 -37.1567,-15.59821 0.85124,-12.41461 -1.91919,-23.80346 -10.3988,-23.84116 -9.859855,-0.0438 -11.331493,17.65897 -9.954956,23.71435 -10.893616,1.27689 -37.346924,15.72502 -37.346924,15.72502 z" />
    </svg>
  );
}

/**
 * A powerline separator. `from` is the fill on its left, `to` the fill on its
 * right; the triangle is drawn in whichever side it points at.
 */
function Arrow({ from, to, dir }: { from: Fill; to: Fill; dir: "r" | "l" }) {
  const style = { "--wb-from": from, "--wb-to": to } as CSSProperties;
  return <span className={`wb-arrow wb-arrow-${dir}`} style={style} aria-hidden="true" />;
}

function Cap({ fill, side }: { fill: Fill; side: "l" | "r" }) {
  const style = { "--wb-from": fill } as CSSProperties;
  return <span className={`wb-cap wb-cap-${side}`} style={style} aria-hidden="true" />;
}

export function Waybar({
  workspace,
  language,
  workspaceApps,
  onWorkspaceChange,
  onLanguageChange,
  onHome,
  focusedApp,
  focusedTitle,
  onAppMenu,
  empty,
  menuOpen,
}: WaybarProps) {
  const [now, setNow] = useState(() => new Date());
  const [ringing, setRinging] = useState(false);
  const [shownLanguage, setShownLanguage] = useState(language);
  const [crowded, setCrowded] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const ringTimer = useRef<number | undefined>(undefined);
  const { cpu, cpuTitle, memory, memoryTitle } = useSystemStats();

  const cycleWsLanguage = () =>
    onLanguageChange(
      WORKSPACE_LANGUAGES[
        (WORKSPACE_LANGUAGES.indexOf(language) + 1) % WORKSPACE_LANGUAGES.length
      ],
    );

  const ring = () => {
    playRing();
    setRinging(true);
    clearTimeout(ringTimer.current);
    ringTimer.current = window.setTimeout(() => setRinging(false), RING_MS);
  };

  useEffect(() => () => clearTimeout(ringTimer.current), []);

  /*
   * A language change spins every glyph once and exchanges it mid-spin. The
   * class is taken off and put back around a forced reflow rather than keyed
   * onto the element, so a change arriving during a spin restarts it, and so
   * nothing spins on mount or on the clock's re-render every second.
   */
  useEffect(() => {
    if (language === shownLanguage) return;
    const el = wsRef.current;
    el?.classList.remove("wb-ws-spinning");
    void el?.offsetWidth;
    el?.classList.add("wb-ws-spinning");
    const id = window.setTimeout(() => setShownLanguage(language), WS_SPIN_MS / 2);
    return () => clearTimeout(id);
  }, [language, shownLanguage]);

  /*
   * On an empty workspace a line runs round the launcher segment every
   * `SNAKE_EVERY`, on top of its pulse. The first waits a whole interval: the
   * close that emptied the workspace has just run one as the window landed.
   * A hidden tab skips its turn rather than queue a line for when it returns.
   * With less motion asked for, each run is skipped and the outline is simply
   * held round the segment for as long as the workspace stays empty.
   *
   * All of it stops while the launcher menu is open, a lap already under way
   * included: the segment is asking to be clicked, and it has been.
   */
  const nudging = empty && !menuOpen;
  useEffect(() => {
    if (!nudging) return;
    let stopLap = () => {};
    const id = window.setInterval(() => {
      if (!document.hidden) stopLap = snakeAround(launcherRef.current);
    }, SNAKE_EVERY);
    const release = holdOutline(launcherRef.current);
    return () => {
      clearInterval(id);
      stopLap();
      release();
    };
  }, [nudging]);

  /*
   * The pill sits above both side clusters, so a long window title runs under
   * it rather than into it. Once either cluster comes within `CROWD_GAP` of
   * it, the pill casts a shadow over what passes beneath; with room to spare
   * there is nothing to cast it on, and it would only be a halo on the
   * wallpaper. Every box involved is observed: the title changes the left
   * cluster's width, a window opening changes the pill's, a resize the bar's.
   */
  useEffect(() => {
    const center = wsRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!center || !left || !right) return;
    const measure = () => {
      const c = center.getBoundingClientRect();
      setCrowded(
        left.getBoundingClientRect().right > c.left - CROWD_GAP ||
          right.getBoundingClientRect().left < c.right + CROWD_GAP,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const el of [center, left, right, center.parentElement!]) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = now.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <header className="waybar">
      <div className="wb-side" ref={leftRef}>
        <Cap fill={FILL.primary} side="l" />
        <button
          className="wb-seg wb-on-primary wb-clickable"
          onClick={onHome}
          // The label names the action rather than the visible host name,
          // which is decoration. Same for the keyboard segment below.
          aria-label="Open Codium"
        >
          <ArchIcon />
          {HOST_LABEL}
        </button>

        <Arrow from={FILL.primary} to={FILL.secondary} dir="r" />
        <div className="wb-seg wb-on-secondary">
          {/* `role="img"` because a bare span takes no accessible name: the
              stats and the clock are the three labels in the bar that are not
              on a button. */}
          <span className="wb-mod wb-stat" role="img" aria-label={cpuTitle}>
            <Icon className="wb-icon" path={icons.cpu} />
            <span className="wb-stat-value">{Math.round(cpu * 100)}%</span>
          </span>
          {memory !== null && (
            <span className="wb-mod wb-stat" role="img" aria-label={memoryTitle}>
              <Icon className="wb-icon" path={icons.memory} />
              <span className="wb-stat-value wb-stat-value-mem">{memory}</span>
            </span>
          )}
        </div>

        <Arrow from={FILL.secondary} to={FILL.tertiary} dir="r" />
        <button
          className="wb-seg wb-on-tertiary wb-clickable"
          onClick={() =>
            window.open(RICKROLL_URL, "_blank", "noopener,noreferrer")
          }
          aria-label="Never gonna give you up"
        >
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.music} /> Never gonna …
          </span>
        </button>

        <Arrow from={FILL.tertiary} to={FILL.containerHigh} dir="r" />
        <button
          // On an empty workspace this is the way to open something, so it
          // pulses — the only thing on screen asking to be clicked — until
          // its menu is open.
          className={`wb-seg wb-on-surface wb-window wb-clickable${nudging ? " wb-window--pulse" : ""}`}
          onClick={(event) => {
            // Hung from the segment's bottom-left corner, clear of the bar.
            const { left, bottom } = event.currentTarget.getBoundingClientRect();
            onAppMenu({ x: left, y: bottom + LAUNCHER_DROP });
          }}
          // Where a closing window goes: see `genieInto`.
          data-launcher
          ref={launcherRef}
          // It opens the launcher, so the label leads with that; the focused
          // window is on screen but would otherwise not be announced at all.
          aria-label={focusedTitle ? `Applications — ${focusedTitle}` : "Applications"}
        >
          <Icon className="wb-icon" path={focusedApp ? APP_ICONS[focusedApp] : icons.window} />
          {focusedTitle ?? NO_WINDOW_LABEL}
        </button>
        <Arrow from={FILL.containerHigh} to={FILL.none} dir="r" />
      </div>

      {/* A data attribute rather than a class: the spin effect above edits the
          class list by hand, and a className change would drop its class. */}
      <div className="wb-center" ref={wsRef} data-crowded={crowded || undefined}>
        {WS_LANGUAGES[shownLanguage].glyphs.map((glyph, idx) => {
          const ws = idx + 1;
          const apps = workspaceApps.get(ws) ?? [];
          const paths =
            apps.length > WS_MAX_ICONS
              ? [icons.windows]
              : apps.map((app) => APP_ICONS[app]);
          const state = ws === workspace
            ? "wb-ws-active"
            : apps.length > 0
              ? "wb-ws-occupied"
              : "wb-ws-empty";
          return (
            <button
              key={idx}
              className={`wb-ws wb-clickable ${state}`}
              onClick={() => onWorkspaceChange(ws)}
              // The count matters most where the icons stop naming the apps —
              // and under `cn` or `roman` numerals this is the only place the
              // workspace's number exists at all.
              aria-label={
                apps.length
                  ? `Workspace ${ws} — ${apps.length} window${apps.length > 1 ? "s" : ""}`
                  : `Workspace ${ws}`
              }
            >
              <span className="wb-ws-glyph">{glyph}</span>
              <span
                className="wb-ws-apps"
                style={{ "--ws-apps": paths.length } as CSSProperties}
                aria-hidden="true"
              >
                {paths.map((path, i) => (
                  <Icon key={i} className="wb-ws-app" path={path} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="wb-side" ref={rightRef}>
        <Arrow from={FILL.none} to={FILL.container} dir="l" />
        <button
          className="wb-seg wb-on-surface wb-clickable"
          onClick={ring}
          aria-label="Notifications"
        >
          <span className={`wb-mod wb-bell${ringing ? " wb-bell-ringing" : ""}`}>
            <Icon className="wb-icon" path={icons.bell} />
          </span>
        </button>

        <Arrow from={FILL.container} to={FILL.containerHigh} dir="l" />
        <button
          className="wb-seg wb-on-surface wb-kbd wb-clickable"
          onClick={cycleWsLanguage}
          aria-label="Change workspace numerals"
        >
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.keyboard} />
            {WS_LANGUAGES[language].label}
          </span>
        </button>

        <Arrow from={FILL.containerHigh} to={FILL.tertiary} dir="l" />
        <div className="wb-seg wb-on-tertiary">
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.bluetooth} />up
          </span>
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.wifi} />up
          </span>
        </div>

        <Arrow from={FILL.tertiary} to={FILL.secondary} dir="l" />
        <div className="wb-seg wb-on-secondary">
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.volume} />55%
          </span>
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.brightness} />100%
          </span>
        </div>

        <Arrow from={FILL.secondary} to={FILL.primary} dir="l" />
        {/* The date alone would drop the time that is actually on screen. */}
        <div className="wb-seg wb-on-primary" role="img" aria-label={`${time} — ${date}`}>
          <span className="wb-mod">
            <Icon className="wb-icon" path={icons.clock} />
            {time}
          </span>
        </div>
        <Cap fill={FILL.primary} side="r" />
      </div>
    </header>
  );
}
