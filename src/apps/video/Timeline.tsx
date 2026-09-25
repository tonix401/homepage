/**
 * Kdenlive's timeline, as a Gantt chart of reading the open folder: a track
 * per folder, a clip per file as long as it takes to read, laid end to end in
 * the Explorer's order, and the red playhead where the monitor is scrolled to.
 *
 * It fits the whole project to its width until the zoom slider says
 * otherwise; zoomed in, it scrolls sideways and keeps the playhead in view.
 * Pressing anywhere on the ruler or the lanes seeks, and dragging scrubs.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { type Timeline as TimelineData, formatTimecode, rulerStep } from "../../utils/timeline";
import { Icon } from "../../components/Icon";
import { scrubHandlers } from "./scrub";

const icons = {
  menu: "M4 6h16M4 12h16M4 18h16",
  select: "M6 3l12 9-5.5 1L9.5 19z",
  razor: "M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8.5 7.5 20 19M8.5 16.5 20 5",
  spacer: "M12 4v16M8 8l-4 4 4 4M16 8l4 4-4 4",
  slip: "M4 5v14M20 5v14M8 12h8M11 9l-3 3 3 3M13 9l3 3-3 3",
  wand: "M4 20 16 8M14 4v2M19 9h2M18 5l-1.5 1.5M11 5l1 1",
  chevron: "M6 9l6 6 6-6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5M8 11h6",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5M8 11h6M11 8v6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};

/** The zoom slider's range, as powers of two over fit-to-width. */
const MAX_ZOOM = 6;
/** Room past the last clip, so its end is not flush with the edge. */
const END_PAD = 12;

interface TimelineProps {
  timeline: TimelineData;
  position: number;
  currentPath: string | null;
  onSeek: (t: number) => void;
}

export function Timeline({ timeline, position, currentPath, onSeek }: TimelineProps) {
  const { tracks, total } = timeline;
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // log2 of the zoom over fit-to-width: 0 shows the whole project.
  const [zoom, setZoom] = useState(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = total > 0 && width > END_PAD ? (width - END_PAD) / total : 1;
  const pps = fit * 2 ** zoom;
  const canvasWidth = total * pps + END_PAD;
  const x = position * pps;

  // Zoomed in, the playhead drags the view along rather than leaving it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - END_PAD) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
    }
  }, [x]);

  const step = rulerStep(pps, 96);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const currentTrack = timeline.clips.find((c) => c.file.path === currentPath)?.track;

  const scrub = scrubHandlers(
    (clientX, el) => (clientX - el.getBoundingClientRect().left) / pps,
    onSeek,
  );

  return (
    <section className="kd-timeline" aria-label="Timeline">
      <div className="kd-tl-title">Timeline</div>
      <div className="kd-tl-toolbar">
        <Icon className="kd-tool-icon kd-tl-menu" path={icons.menu} />
        <span className="kd-select" aria-hidden="true">
          <span className="kd-select-mark" />
          Normal Mode
          <Icon className="kd-select-caret" path={icons.chevron} />
        </span>
        <span className="kd-tl-tools" aria-hidden="true">
          <Icon className="kd-tool-icon kd-tool-icon--on" path={icons.select} />
          <Icon className="kd-tool-icon" path={icons.razor} />
          <Icon className="kd-tool-icon" path={icons.spacer} />
          <Icon className="kd-tool-icon" path={icons.slip} />
        </span>
        <span className="kd-tl-timecode">
          {formatTimecode(position)} / {formatTimecode(total)}
        </span>
      </div>

      <div className="kd-tl-body">
        <div className="kd-tl-headers">
          <div className="kd-tl-corner">
            <Icon className="kd-tool-icon" path={icons.wand} />
            <span>Sequence</span>
          </div>
          {tracks.map((track, i) => (
            <div
              key={track.id}
              className={`kd-track-head${track.id === currentTrack ? " kd-track-head--current" : ""}`}
            >
              <Icon className="kd-track-chevron" path={icons.chevron} />
              <span className="kd-track-badge">V{tracks.length - i}</span>
              <span className="kd-track-name" title={track.label}>{track.label}</span>
              <Icon className="kd-track-icon" path={icons.film} />
              <Icon className="kd-track-icon" path={icons.lock} />
            </div>
          ))}
        </div>

        <div className="kd-tl-scroll" ref={scroller}>
          <div className="kd-tl-canvas" style={{ width: canvasWidth }} {...scrub}>
            <div
              className="kd-ruler"
              style={{ "--kd-tick": `${(step * pps) / 5}px` } as CSSProperties}
            >
              {ticks.map((t) => (
                <span key={t} className="kd-ruler-tick" style={{ left: t * pps }}>
                  {formatTimecode(t)}
                </span>
              ))}
            </div>
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`kd-lane${track.id === currentTrack ? " kd-lane--current" : ""}`}
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.file.path}
                    className={`kd-clip${clip.file.path === currentPath ? " kd-clip--current" : ""}`}
                    style={{ left: clip.start * pps, width: Math.max(clip.duration * pps - 1, 2) }}
                    title={`${clip.file.name} — ${formatTimecode(clip.duration)}`}
                  >
                    <span className="kd-clip-name">{clip.file.name}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="kd-playhead" style={{ transform: `translateX(${x}px)` }} />
          </div>
        </div>
      </div>

      <div className="kd-tl-status">
        <span className="kd-tl-status-mode">Select</span>
        <button className="kd-icon-btn" onClick={() => setZoom(Math.max(0, zoom - 0.5))} aria-label="Zoom out" title="Zoom out">
          <Icon className="kd-tool-icon" path={icons.zoomOut} />
        </button>
        <input
          className="kd-zoom"
          type="range"
          min={0}
          max={MAX_ZOOM}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Timeline zoom"
        />
        <button className="kd-icon-btn" onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + 0.5))} aria-label="Zoom in" title="Zoom in">
          <Icon className="kd-tool-icon" path={icons.zoomIn} />
        </button>
        <button className="kd-icon-btn" onClick={() => setZoom(0)} aria-label="Fit the project" title="Fit the project">
          <Icon className="kd-tool-icon" path={icons.fit} />
        </button>
      </div>
    </section>
  );
}
