/**
 * Kdenlive, as a window: the open folder as a video project you read.
 *
 * Every file is a clip as long as it takes to read, every folder a track, and
 * the clips run end to end in the Explorer's order — so the timeline is a
 * Gantt chart of reading the whole folder. The Project Monitor shows the file
 * under the playhead, and the playhead follows the monitor's scroll: scroll a
 * file and the red line moves through its clip, press the timeline and the
 * monitor jumps to that file and that far down it. ▶ reads for you, scrolling
 * at reading speed and rolling on into the next clip.
 *
 * It keeps Breeze Dark rather than the desktop theme, as Codium and Obsidian
 * keep their own looks. The payload is the file under the playhead; the
 * position within it, playback, the bin and the zoom are the window's own.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import "./Kdenlive.css";
import folderFiles from "virtual:open-folder-files";
import { rootFolderName } from "virtual:open-folder-config";
import { type FileNode } from "../../services/types";
import { findFileByPath, findFirstFile, resolvePath } from "../../utils/files";
import { type Clip, buildTimeline, clipAt, formatTimecode, timeOf } from "../../utils/timeline";
import { FileView } from "../../components/FileView";
import { Icon } from "../../components/Icon";
import { WindowButtons } from "../../components/WindowButtons";
import { type AppRenderProps } from "../types";
import { ProjectBin } from "./ProjectBin";
import { Timeline } from "./Timeline";
import { scrubHandlers } from "./scrub";

const MENUS = ["File", "Edit", "View", "Media", "Sequence", "Tool", "Monitor", "Markers", "Settings", "Help"];
const LAYOUTS = ["Logging", "Editing", "Audio", "Effects", "Color"];

const icons = {
  new: "M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6",
  open: "M3 6h6l2 2h10v11H3z",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  undo: "M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10h-3",
  redo: "M15 5l5 5-5 5M20 10H10a5 5 0 0 0 0 10h3",
  cut: "M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8.5 7.5 20 19M8.5 16.5 20 5",
  copy: "M8 8h12v12H8zM4 16V4h12",
  paste: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2",
  prev: "M6 5v14M18 5l-9 7 9 7z",
  rewind: "M11 5l-8 7 8 7zM21 5l-8 7 8 7z",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  forward: "M13 5l8 7-8 7zM3 5l8 7-8 7z",
  next: "M18 5v14M6 5l9 7-9 7z",
  caret: "M6 9l6 6 6-6",
};

/** The fastest ◀◀ and ▶▶ shuttle, doubling from 1× with every press. */
const MAX_RATE = 16;
/** The longest step playback takes in one frame, so a stalled tab does not leap. */
const MAX_FRAME = 0.1;

interface MonitorViewProps {
  file: FileNode;
  seekRef: Ref<((fraction: number) => void) | null>;
  onScroll: (path: string, fraction: number) => void;
  onNavigate: (fromPath: string, href: string) => void;
}

/**
 * The file in the monitor's frame. Memoized, and handed only stable callbacks,
 * because the playhead re-renders the app every frame while it plays and a
 * markdown body is far too expensive to rebuild at that rate.
 */
const MonitorView = memo(function MonitorView({ file, seekRef, onScroll, onNavigate }: MonitorViewProps) {
  return (
    <FileView
      key={file.path}
      file={file}
      mode="preview"
      seekRef={seekRef}
      onScrollFraction={(fraction) => onScroll(file.path, fraction)}
      onNavigate={(href) => onNavigate(file.path, href)}
      resolveFile={resolveFile}
    />
  );
});

function resolveFile(fromPath: string, href: string) {
  return findFileByPath(folderFiles, resolvePath(fromPath, href));
}

export function KdenliveApp({ arg, focused, maximized, handle }: AppRenderProps) {
  const timeline = useMemo(() => buildTimeline(folderFiles, rootFolderName), []);
  const file = (arg ? findFileByPath(folderFiles, arg) : null) ?? findFirstFile(folderFiles);
  const clip = file ? (timeline.clips.find((c) => c.file.path === file.path) ?? null) : null;

  const [position, setPosition] = useState(() => clip?.start ?? 0);
  // Playback speed, as Kdenlive's shuttle: 0 is paused, 1 is ▶, a negative
  // rate plays backwards, and ◀◀ / ▶▶ double it in their direction.
  const [rate, setRate] = useState(0);
  const playing = rate !== 0;

  // A file opened from outside the timeline — a link followed in the monitor,
  // a restored session — puts the playhead at the start of its clip. Adjusted
  // during the render that notices it, as Obsidian reveals a note; a seek
  // that changed the file itself has already put the playhead inside it.
  const [shownPath, setShownPath] = useState(file?.path ?? null);
  if (clip && clip.file.path !== shownPath) {
    setShownPath(clip.file.path);
    if (position < clip.start || position > clip.start + clip.duration) setPosition(clip.start);
  }

  const seekRef = useRef<((fraction: number) => void) | null>(null);
  // A seek into another file waits for that file's view to mount.
  const pendingSeek = useRef<number | null>(null);
  // What the callbacks below need of the latest render, without being rebuilt
  // by it — they are the monitor's props, and must stay stable.
  const live = useRef({ position, playing, path: file?.path ?? null, handle });
  useLayoutEffect(() => {
    live.current = { position, playing, path: file?.path ?? null, handle };
  });

  const seek = useCallback(
    (t: number) => {
      const at = clipAt(timeline, t);
      if (!at) return;
      setPosition(Math.min(Math.max(t, 0), timeline.total));
      if (at.clip.file.path !== live.current.path) {
        pendingSeek.current = at.fraction;
        live.current.path = at.clip.file.path;
        live.current.handle.setArg(at.clip.file.path);
      } else {
        seekRef.current?.(at.fraction);
      }
    },
    [timeline],
  );

  useEffect(() => {
    if (pendingSeek.current === null) return;
    seekRef.current?.(pendingSeek.current);
    pendingSeek.current = null;
  }, [file?.path]);

  // Scrolling the monitor moves the playhead. Not while playing: playback's
  // own seeks echo back here a frame late, rounded to whole pixels, and would
  // drag the playhead back and stall it on a long file.
  const onMonitorScroll = useCallback(
    (path: string, fraction: number) => {
      if (live.current.playing || path !== live.current.path) return;
      const t = timeOf(timeline, path, fraction);
      if (t !== null) setPosition(t);
    },
    [timeline],
  );

  const onMonitorNavigate = useCallback((fromPath: string, href: string) => {
    const target = findFileByPath(folderFiles, resolvePath(fromPath, href));
    if (target) live.current.handle.setArg(target.path);
  }, []);

  // Playing: advance the playhead by the time that passed times the rate,
  // frame by frame. At 1× that scrolls the monitor at reading speed and rolls
  // on into the next clip; backwards, it rolls into the previous one.
  useEffect(() => {
    if (rate === 0) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      const next = live.current.position + dt * rate;
      if (next >= timeline.total || next <= 0) {
        seek(next);
        setRate(0);
        return;
      }
      seek(next);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [rate, seek, timeline]);

  const togglePlay = useCallback(() => {
    if (live.current.playing) {
      setRate(0);
      return;
    }
    // Pressing play at the end starts again from the top, as a player does.
    if (live.current.position >= timeline.total) seek(0);
    setRate(1);
  }, [seek, timeline]);

  // ▶▶ plays forwards, and each press while it does doubles the speed; from
  // pause or from rewinding it starts at 1×. ◀◀ is the same, backwards.
  const shuttle = useCallback(
    (direction: 1 | -1) => {
      if (direction === -1 && live.current.position <= 0) return;
      if (direction === 1 && live.current.position >= timeline.total) return;
      setRate((r) => (Math.sign(r) === direction ? direction * Math.min(Math.abs(r) * 2, MAX_RATE) : direction));
    },
    [timeline],
  );

  const clipIndex = clip ? timeline.clips.indexOf(clip) : -1;
  const prevClip = () => {
    // Back to the start of this clip, unless the playhead is already there.
    const target: Clip | undefined =
      clip && position - clip.start > 1 ? clip : timeline.clips[Math.max(clipIndex - 1, 0)];
    if (target) seek(target.start);
  };
  const nextClip = () => {
    const target = timeline.clips[clipIndex + 1];
    seek(target ? target.start : timeline.total);
  };

  // Kdenlive's keys: Space plays, J / K / L rewind, pause and play forwards
  // (J and L speeding up with each press, like ◀◀ and ▶▶), Home and End go to
  // either end of the project, ↑ and ↓ step between clips. Only the focused
  // window listens.
  const keys = useRef({ togglePlay, shuttle, prevClip, nextClip, seek, total: timeline.total });
  useEffect(() => {
    keys.current = { togglePlay, shuttle, prevClip, nextClip, seek, total: timeline.total };
  });
  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, [contenteditable]")) return;
      const k = keys.current;
      switch (event.key) {
        case " ":
          k.togglePlay();
          break;
        case "j":
          k.shuttle(-1);
          break;
        case "k":
          setRate(0);
          break;
        case "l":
          k.shuttle(1);
          break;
        case "Home":
          k.seek(0);
          break;
        case "End":
          k.seek(k.total);
          break;
        case "ArrowUp":
          k.prevClip();
          break;
        case "ArrowDown":
          k.nextClip();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  const monitorScrub = scrubHandlers((clientX, el) => {
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * timeline.total;
  }, seek);

  const openClip = (c: Clip) => seek(c.start);
  const progress = timeline.total > 0 ? position / timeline.total : 0;

  return (
    <div className={`kd${maximized ? "" : " kd--windowed"}`}>
      <div className="kd-menubar">
        <nav className="kd-menus" aria-hidden="true">
          {MENUS.map((m) => (
            <span key={m} className="kd-menu">
              <u>{m[0]}</u>
              {m.slice(1)}
            </span>
          ))}
        </nav>
        <div className="kd-layouts" aria-hidden="true">
          {LAYOUTS.map((l) => (
            <span key={l} className={`kd-layout${l === "Editing" ? " kd-layout--on" : ""}`}>
              {l}
            </span>
          ))}
        </div>
        <WindowButtons handle={handle} maximized={maximized} />
      </div>

      <div className="kd-toolbar" aria-hidden="true">
        <span className="kd-tb"><Icon className="kd-tb-icon" path={icons.new} />New</span>
        <span className="kd-tb"><Icon className="kd-tb-icon" path={icons.open} />Open</span>
        <span className="kd-tb"><Icon className="kd-tb-icon" path={icons.save} />Save</span>
        <span className="kd-tb kd-tb--off"><Icon className="kd-tb-icon" path={icons.undo} />Undo</span>
        <span className="kd-tb kd-tb--off"><Icon className="kd-tb-icon" path={icons.redo} />Redo</span>
        <span className="kd-tb kd-tb--off"><Icon className="kd-tb-icon" path={icons.cut} />Cut</span>
        <span className="kd-tb kd-tb--off"><Icon className="kd-tb-icon" path={icons.copy} />Copy</span>
        <span className="kd-tb"><Icon className="kd-tb-icon" path={icons.paste} />Paste</span>
        <span className="kd-tb kd-tb-render"><span className="kd-render-dot" />Render</span>
      </div>

      <div className="kd-upper">
        <section className="kd-dock kd-dock--bin">
          <ProjectBin tree={folderFiles} timeline={timeline} currentPath={file?.path ?? null} onOpen={openClip} />
          <div className="kd-dock-tabs" aria-hidden="true">
            <span className="kd-dock-tab kd-dock-tab--on">Project Bin</span>
            <span className="kd-dock-tab">Compositions</span>
            <span className="kd-dock-tab">Effects</span>
          </div>
        </section>

        <section className="kd-dock kd-dock--monitor" aria-label="Project Monitor">
          <div
            className="kd-monitor"
            // A hand on the monitor takes over from playback.
            onWheel={() => playing && setRate(0)}
            onPointerDown={() => playing && setRate(0)}
          >
            <div className="kd-frame">
              {file ? (
                <MonitorView file={file} seekRef={seekRef} onScroll={onMonitorScroll} onNavigate={onMonitorNavigate} />
              ) : (
                <div className="kd-frame-empty">No clip</div>
              )}
            </div>
          </div>
          <div className="kd-monitor-ruler" {...monitorScrub}>
            <div className="kd-monitor-handle" style={{ left: `${progress * 100}%` }} />
          </div>
          <div className="kd-monitor-controls">
            <span className="kd-select" aria-hidden="true">
              1080p
              <Icon className="kd-select-caret" path={icons.caret} />
            </span>
            <div className="kd-transport">
              <button className="kd-icon-btn" onClick={prevClip} aria-label="Previous clip" title="Previous clip">
                <Icon className="kd-transport-icon" path={icons.prev} />
              </button>
              <button className="kd-icon-btn" onClick={() => shuttle(-1)} aria-label="Rewind" title="Rewind (J)">
                <Icon className="kd-transport-icon" path={icons.rewind} />
              </button>
              <button className="kd-icon-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
                <Icon className="kd-transport-icon" path={playing ? icons.pause : icons.play} />
              </button>
              <button className="kd-icon-btn" onClick={() => shuttle(1)} aria-label="Forward" title="Forward (L)">
                <Icon className="kd-transport-icon" path={icons.forward} />
              </button>
              <button className="kd-icon-btn" onClick={nextClip} aria-label="Next clip" title="Next clip">
                <Icon className="kd-transport-icon" path={icons.next} />
              </button>
            </div>
            <span className="kd-timecode">{formatTimecode(position)}</span>
            {rate !== 0 && rate !== 1 && (
              <span className="kd-rate" aria-live="polite">
                {rate < 0 ? "−" : ""}
                {Math.abs(rate)}×
              </span>
            )}
          </div>
          <div className="kd-dock-tabs" aria-hidden="true">
            <span className="kd-dock-tab kd-dock-tab--on">Project Monitor</span>
            <span className="kd-dock-tab">Speech Editor</span>
            <span className="kd-dock-tab">Project Notes</span>
          </div>
        </section>
      </div>

      <Timeline timeline={timeline} position={position} currentPath={file?.path ?? null} onSeek={seek} />
    </div>
  );
}
