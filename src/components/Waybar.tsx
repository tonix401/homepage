import { useEffect, useState, type CSSProperties } from "react";
import "./Waybar.css";

interface WaybarProps {
  onOpen: () => void;
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
  bluetooth: "M7 7l10 10-5 4V3l5 4L7 17",
  wifi: "M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0M8.5 16.5a6 6 0 0 1 7 0M12 20h.01",
  vpn: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  volume: "M4 9h4l5-4v14l-5-4H4zM17 8.5a5 5 0 0 1 0 7",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v3",
  brightness: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
} as const;

/**
 * The Arch "A" from public/white_arch.svg, inlined so it can take the
 * segment's on_* colour — the asset itself is white and vanishes on the
 * light primary fill.
 */
function ArchIcon() {
  return (
    <svg className="wb-icon wb-icon-filled" viewBox="53 96 106 104" aria-hidden="true">
      <path d="m 57.35468,196.22952 c 0,0 19.22077,-35.00336 33.33783,-63.37485 1.162263,-2.06625 4.947689,2.60102 11.95668,4.67408 -3.253738,-3.85698 -10.416083,-8.69044 -8.909647,-11.40217 4.655457,-10.90354 9.342707,-19.75839 10.980427,-24.75445 4.20004,12.28158 24.07118,50.53846 36.36948,73.96927 -0.90637,-0.28959 -5.83428,-3.08439 -9.8193,-3.73253 6.09146,4.0999 12.87278,9.50478 12.87278,9.50478 l 8.06913,15.11587 c 0,0 -27.81245,-15.3687 -37.1567,-15.59821 0.85124,-12.41461 -1.91919,-23.80346 -10.3988,-23.84116 -9.859855,-0.0438 -11.331493,17.65897 -9.954956,23.71435 -10.893616,1.27689 -37.346924,15.72502 -37.346924,15.72502 z" />
    </svg>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg className="wb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
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

export function Waybar({ onOpen }: WaybarProps) {
  const WORKSPACES = ["一", "二", "三", "四", "五"];
  const [activeWorkspace, setActiveWorkspace] = useState("一");
  const [now, setNow] = useState(() => new Date());

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
      <div className="wb-side">
        <Cap fill={FILL.primary} side="l" />
        <button className="wb-seg wb-on-primary wb-clickable" onClick={onOpen} title="Open portfolio">
          <ArchIcon />
          tom@box
        </button>

        <Arrow from={FILL.primary} to={FILL.secondary} dir="r" />
        <div className="wb-seg wb-on-secondary">
          <span className="wb-mod">
            <Icon path={icons.cpu} />5%
          </span>
          <span className="wb-mod">
            <Icon path={icons.memory} />2GB
          </span>
        </div>

        <Arrow from={FILL.secondary} to={FILL.tertiary} dir="r" />
        <div className="wb-seg wb-on-tertiary">
          <span className="wb-mod">
            <Icon path={icons.music} /> Never gon…
          </span>
        </div>

        <Arrow from={FILL.tertiary} to={FILL.containerHigh} dir="r" />
        <button
          className="wb-seg wb-on-surface wb-window wb-clickable"
          onClick={onOpen}
          title="Open portfolio"
        >
          <Icon path={icons.window} />
          Codium
        </button>
        <Arrow from={FILL.containerHigh} to={FILL.none} dir="r" />
      </div>

      <div className="wb-center">
        {WORKSPACES.map((ws) => (
          <span
            key={ws}
            className={ws === activeWorkspace ? "wb-ws wb-ws-active" : "wb-ws wb-ws-empty"}
            onClick={() => setActiveWorkspace(ws)}
          >
            {ws}
          </span>
        ))}
      </div>

      <div className="wb-side">
        <Arrow from={FILL.none} to={FILL.container} dir="l" />
        <div className="wb-seg wb-on-surface">
          <span className="wb-mod">
            <Icon path={icons.bell} />
          </span>
        </div>

        <Arrow from={FILL.container} to={FILL.containerHigh} dir="l" />
        <div className="wb-seg wb-on-surface wb-kbd">
          <span className="wb-mod">
            <Icon path={icons.keyboard} />Eng
          </span>
        </div>

        <Arrow from={FILL.containerHigh} to={FILL.tertiary} dir="l" />
        <div className="wb-seg wb-on-tertiary">
          <span className="wb-mod">
            <Icon path={icons.bluetooth} />up
          </span>
          <span className="wb-mod">
            <Icon path={icons.wifi} />up
          </span>
        </div>

        <Arrow from={FILL.tertiary} to={FILL.secondary} dir="l" />
        <div className="wb-seg wb-on-secondary">
          <span className="wb-mod">
            <Icon path={icons.volume} />55%
          </span>
          <span className="wb-mod">
            <Icon path={icons.brightness} />100%
          </span>
        </div>

        <Arrow from={FILL.secondary} to={FILL.primary} dir="l" />
        <div className="wb-seg wb-on-primary" title={date}>
          <span className="wb-mod">
            <Icon path={icons.clock} />
            {time}
          </span>
        </div>
        <Cap fill={FILL.primary} side="r" />
      </div>
    </header>
  );
}
