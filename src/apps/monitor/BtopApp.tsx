/**
 * btop, as a window — running in a terminal, so it draws in the theme's
 * colours the way jīzǐ does, and the way btop draws with the matugen theme.
 *
 * Four boxes, as btop lays them out. cpu, mem and net show what a page can
 * actually measure about itself — the tab's main-thread load, its JS heap,
 * the bytes it has downloaded — and say so where a real btop would show the
 * machine; nothing in them is invented. proc is the point: the desktop's own
 * window model as a process tree — systemd, Hyprland, each workspace, and
 * the windows on it — live, so a window opening or closing anywhere shows
 * here at once.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./Btop.css";
import folderFiles from "virtual:open-folder-files";
import { defaultFile } from "virtual:open-folder-config";
import { type AppId } from "../ids";
import { type WindowRecord } from "../../utils/desktop";
import { findDefaultFile } from "../../utils/files";
import { homePath } from "../../utils/fileManager";
import { readHeap, useSystemStats } from "../../utils/systemStats";
import { sessionStart } from "../../utils/sessionStart";
import {
  type ProcNode,
  type WindowProcess,
  allNodes,
  buildProcessTree,
  flattenTree,
} from "../../utils/processTree";
import { brailleGraph } from "../../utils/brailleGraph";
import { WindowButtons } from "../../components/WindowButtons";
import { type AppRenderProps } from "../types";

/** How many readings the graphs keep: more than any window is wide. */
const HISTORY = 400;
const MB = 1024 * 1024;

/**
 * What each app's process is called and claims to use. The thread and memory
 * figures are decoration, as the bar's volume module is — a page cannot see
 * other processes, so there is nothing real to show. btop's own row is the
 * exception: its cpu is the tab's real main-thread load.
 */
const PROCESSES: Record<AppId, { name: string; threads: number; mem: number; inKitty?: boolean }> = {
  editor: { name: "codium", threads: 28, mem: 382 * MB },
  browser: { name: "chromium", threads: 34, mem: 412 * MB },
  terminal: { name: "jizi", threads: 3, mem: 38 * MB, inKitty: true },
  notes: { name: "obsidian", threads: 22, mem: 291 * MB },
  monitor: { name: "btop", threads: 1, mem: 6.2 * MB, inKitty: true },
  fetch: { name: "fastfetch", threads: 1, mem: 4.1 * MB, inKitty: true },
  video: { name: "kdenlive", threads: 41, mem: 468 * MB },
};

/** The terminal the TUI programs run in, and what it claims to use. */
const KITTY = { name: "kitty", threads: 10, memBytes: 58 * MB };

/** The apps whose payload is a file, and that show the default file for none. */
const FILE_APPS: readonly AppId[] = ["editor", "browser", "notes", "video"];

/** btop's own byte formatting: "382M", "6.2M", "1.4G". */
function formatMem(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)}G`;
  const mb = bytes / MB;
  return mb >= 10 ? `${Math.round(mb)}M` : `${mb.toFixed(1)}M`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} Byte`;
}

/** `02:52:11`, as btop prints its uptime. */
function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Every byte this page has fetched, as far as resource timing can tell. */
function downloaded(): number {
  const entries = [
    ...performance.getEntriesByType("navigation"),
    ...performance.getEntriesByType("resource"),
  ] as PerformanceResourceTiming[];
  return entries.reduce((sum, e) => sum + (e.transferSize || 0), 0);
}

/** A btop meter: `■■■■■■■····` in `width` cells. */
function Meter({ value, width, className = "" }: { value: number; width: number; className?: string }) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * width);
  return (
    <span className={`btop-meter ${className}`}>
      <span className="btop-meter-on">{"■".repeat(filled)}</span>
      <span className="btop-meter-off">{"■".repeat(width - filled)}</span>
    </span>
  );
}

/**
 * A braille graph that fills its box: it measures how many characters fit
 * across and how many lines down, and asks for exactly that many.
 */
function Graph({ values, className }: { values: readonly number[]; className: string }) {
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ cols: 0, rows: 0 });

  useLayoutEffect(() => {
    const el = box.current;
    const ch = probe.current;
    if (!el || !ch) return;
    const measure = () => {
      const cell = ch.getBoundingClientRect();
      if (!cell.width || !cell.height) return;
      setSize({
        cols: Math.max(1, Math.floor(el.clientWidth / (cell.width / 10))),
        rows: Math.max(1, Math.floor(el.clientHeight / cell.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`btop-graph ${className}`} ref={box} aria-hidden="true">
      {/* Ten braille cells, measured once for the width of one. */}
      <span className="btop-graph-probe" ref={probe}>
        {"⣿".repeat(10)}
      </span>
      {size.cols > 0 &&
        brailleGraph(values, size.cols, size.rows).map((line, i) => <div key={i}>{line}</div>)}
    </div>
  );
}

/** One of btop's boxes: a rounded frame with its title set into the top edge. */
function Box({
  area,
  n,
  title,
  aside,
  children,
}: {
  area: string;
  n: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`btop-box btop-box--${area}`} aria-label={title}>
      <div className="btop-box-title">
        <span className="btop-box-n">{"¹²³⁴"[n - 1]}</span>
        {title}
      </div>
      {aside && <div className="btop-box-aside">{aside}</div>}
      {children}
    </section>
  );
}

export function BtopApp({ focused, maximized, handle, desktop }: AppRenderProps) {
  const { cpu } = useSystemStats();

  // History, sampled once a second — `useSystemStats` only redraws when a
  // reading changes, and a flat line has to keep scrolling all the same.
  const latest = useRef({ cpu, bytes: 0 });
  useLayoutEffect(() => {
    latest.current.cpu = cpu;
  }, [cpu]);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  // Starts from what the page has already fetched, not from zero: loading
  // the site is most of what it will ever download.
  const [net, setNet] = useState(() => ({ rate: 0, top: 0, total: downloaded(), history: [] as number[] }));
  const [heap, setHeap] = useState(readHeap);
  // Counted from this tab's session start, as fastfetch counts it.
  const [uptime, setUptime] = useState(() => Date.now() - sessionStart());

  useEffect(() => {
    latest.current.bytes = downloaded();
    const id = setInterval(() => {
      if (document.hidden) return;
      setCpuHistory((h) => [...h.slice(-HISTORY + 1), latest.current.cpu]);
      const total = downloaded();
      const rate = Math.max(0, total - latest.current.bytes);
      latest.current.bytes = total;
      setNet((n) => ({
        rate,
        top: Math.max(n.top, rate),
        total,
        history: [...n.history.slice(-HISTORY + 1), rate],
      }));
      setHeap(readHeap());
      setUptime(Date.now() - sessionStart());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── The process tree ──────────────────────────────────────────────────
  const describe = (window: WindowRecord): WindowProcess => {
    const proc = PROCESSES[window.app];
    // The command line: the file a file app shows (the default file, for none),
    // jīzǐ's directory, and nothing for a program that takes no argument.
    const args = FILE_APPS.includes(window.app)
      ? (window.arg ?? findDefaultFile(folderFiles, defaultFile)?.path)
      : window.app === "terminal"
        ? homePath(window.arg ?? "")
        : undefined;
    return {
      name: proc.name,
      args,
      threads: proc.threads,
      memBytes: proc.mem,
      cpu: window.id === handle.id ? cpu : 0,
      host: proc.inKitty ? KITTY : undefined,
    };
  };
  const tree = buildProcessTree(desktop, describe);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = flattenTree(tree, collapsed);
  const processes = allNodes(tree).filter((n) => n.pid !== null).length;

  // Selection starts on btop itself, as a real one opens on its own process.
  const [selectedKey, setSelectedKey] = useState(handle.id);
  const index = Math.max(0, rows.findIndex((r) => r.node.key === selectedKey));
  const selected = rows[index];

  const toggle = (node: ProcNode, open?: boolean) => {
    if (node.children.length === 0) return;
    const next = new Set(collapsed);
    const fold = open === undefined ? !next.has(node.key) : !open;
    if (fold) next.add(node.key);
    else next.delete(node.key);
    setCollapsed(next);
  };

  // Keys for the focused window only, as jīzǐ answers them. The listener is
  // installed once per focus and reads the current rows through a ref, which
  // is brought up to date after every render, before any key can arrive.
  const keys = useRef({ rows, index, collapsed, toggle });
  useLayoutEffect(() => {
    keys.current = { rows, index, collapsed, toggle };
  });
  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      // Keys typed into a text field belong to it. The target is not always an
      // element — a key sent to the window has the window itself — so check.
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]")) return;
      const { rows, index, collapsed, toggle } = keys.current;
      const node = rows[index]?.node;
      const move = (to: number) => setSelectedKey(rows[Math.min(Math.max(to, 0), rows.length - 1)].node.key);
      switch (event.key) {
        case "j":
        case "ArrowDown":
          move(index + 1);
          break;
        case "k":
        case "ArrowUp":
          move(index - 1);
          break;
        case "g":
        case "Home":
          move(0);
          break;
        case "G":
        case "End":
          move(rows.length - 1);
          break;
        case "l":
        case "ArrowRight":
          if (node) toggle(node, true);
          break;
        case "h":
        case "ArrowLeft":
          // Fold an open node; on anything else, climb to its parent.
          if (node && node.children.length > 0 && !collapsed.has(node.key)) toggle(node, false);
          else {
            const parent = rows.findIndex((r) => r.node.children.includes(node!));
            if (parent >= 0) move(parent);
          }
          break;
        case " ":
        case "Enter":
          if (node) toggle(node);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  // Keep the selection in view by hand: `scrollIntoView` would also scroll
  // the desktop's strip, which only moves on a focus change.
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pane = list.current;
    const row = pane?.querySelector<HTMLElement>(".btop-proc-row--selected");
    if (!pane || !row) return;
    if (row.offsetTop < pane.scrollTop) pane.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > pane.scrollTop + pane.clientHeight) {
      pane.scrollTop = row.offsetTop + row.offsetHeight - pane.clientHeight;
    }
  }, [selectedKey, rows.length]);

  const cores = navigator.hardwareConcurrency || 0;
  // Used is a share of what the heap has allocated, and allocated a share of
  // the limit. Against the multi-GB limit alone both meters sit at 0%.
  const heapUsed = heap ? heap.usedJSHeapSize / heap.totalJSHeapSize : 0;
  const heapAlloc = heap ? heap.totalJSHeapSize / heap.jsHeapSizeLimit : 0;
  const netScale = Math.max(net.top, 1);
  const netHistory = useMemo(() => net.history.map((r) => r / netScale), [net.history, netScale]);

  return (
    <div className={`btop${maximized ? "" : " btop--windowed"}`}>
      <div className="btop-topline">
        <span className="btop-prompt">
          <span className="btop-host">tom@box</span> btop
        </span>
        <WindowButtons handle={handle} maximized={maximized} />
      </div>

      <div className="btop-grid">
        <Box area="cpu" n={1} title="cpu" aside={<span className="btop-accent">1000ms</span>}>
          <div className="btop-cpu">
            <Graph values={cpuHistory} className="btop-graph--cpu" />
            <div className="btop-panel">
              <div className="btop-panel-head">
                <span className="btop-accent">this tab</span>
                {cores > 0 && <span>{cores} threads</span>}
              </div>
              <div className="btop-panel-row">
                <span className="btop-label">CPU</span>
                <Meter value={cpu} width={16} />
                <span className="btop-num">{Math.round(cpu * 100)}%</span>
              </div>
              <p className="btop-note">
                main-thread load of this page — a page cannot see the machine&apos;s cores
              </p>
            </div>
          </div>
          <div className="btop-up">up {formatUptime(uptime)}</div>
        </Box>

        <Box area="mem" n={2} title="mem">
          {heap ? (
            <div className="btop-mem">
              <div className="btop-mem-row">
                <span className="btop-accent">JS heap limit:</span>
                <span className="btop-num">{formatBytes(heap.jsHeapSizeLimit)}</span>
              </div>
              <div className="btop-mem-row">
                <span>Used (of allocated):</span>
                <span className="btop-num">{formatBytes(heap.usedJSHeapSize)}</span>
              </div>
              <div className="btop-mem-bar">
                <Meter value={heapUsed} width={24} className="btop-meter--used" />
                <span className="btop-num">{Math.round(heapUsed * 100)}%</span>
              </div>
              <div className="btop-mem-row">
                <span>Allocated (of limit):</span>
                <span className="btop-num">{formatBytes(heap.totalJSHeapSize)}</span>
              </div>
              <div className="btop-mem-bar">
                <Meter value={heapAlloc} width={24} className="btop-meter--alloc" />
                <span className="btop-num">{Math.round(heapAlloc * 100)}%</span>
              </div>
              <div className="btop-mem-row">
                <span>Free:</span>
                <span className="btop-num">
                  {formatBytes(heap.jsHeapSizeLimit - heap.usedJSHeapSize)}
                </span>
              </div>
            </div>
          ) : (
            <p className="btop-note">this browser does not report its memory to a page</p>
          )}
        </Box>

        <Box area="net" n={3} title="net" aside={<span>{navigator.onLine ? "online" : "offline"}</span>}>
          <div className="btop-net">
            <Graph values={netHistory} className="btop-graph--net" />
            <div className="btop-net-stats">
              <div className="btop-accent">download</div>
              <div>▼ {formatBytes(net.rate)}/s</div>
              <div>▼ Top: {formatBytes(net.top)}/s</div>
              <div>▼ Total: {formatBytes(net.total)}</div>
              <div className="btop-note">▲ upload: not visible to a page</div>
            </div>
          </div>
        </Box>

        <Box area="proc" n={4} title="proc" aside={<span className="btop-accent">tree</span>}>
          <div className="btop-proc-head">
            <span>Tree:</span>
            <span className="btop-col">Threads:</span>
            <span className="btop-col">User:</span>
            <span className="btop-col">MemB</span>
            <span className="btop-col">Cpu%</span>
          </div>
          <div className="btop-proc-list" ref={list} role="tree" aria-label="Processes">
            {rows.map(({ node, prefix }) => (
              <div
                key={node.key}
                role="treeitem"
                aria-selected={node.key === selected?.node.key}
                aria-expanded={node.children.length > 0 ? !collapsed.has(node.key) : undefined}
                className={
                  "btop-proc-row" +
                  (node.key === selected?.node.key ? " btop-proc-row--selected" : "") +
                  (node.current ? " btop-proc-row--current" : "") +
                  (node.pid === null ? " btop-proc-row--group" : "")
                }
                onClick={() => setSelectedKey(node.key)}
                onDoubleClick={() => toggle(node)}
              >
                <span className="btop-proc-tree">
                  <span className="btop-proc-guides">{prefix}</span>
                  {node.pid !== null && <span className="btop-proc-pid">{node.pid} </span>}
                  <span className="btop-proc-name">{node.name}</span>
                  {node.args && <span className="btop-proc-args"> {node.args}</span>}
                </span>
                <span className="btop-col">{node.threads ?? ""}</span>
                <span className="btop-col btop-col--user">{node.user ?? ""}</span>
                <span className="btop-col">{node.memBytes !== null ? formatMem(node.memBytes) : ""}</span>
                <span className="btop-col">{node.cpu !== null ? (node.cpu * 100).toFixed(1) : ""}</span>
              </div>
            ))}
          </div>
          <div className="btop-proc-foot">
            <span>
              <span className="btop-accent">↑↓</span> select <span className="btop-accent">←→</span> fold
            </span>
            <span className="btop-num">
              {index + 1}/{rows.length} · {processes} processes
            </span>
          </div>
        </Box>
      </div>
    </div>
  );
}
