/**
 * A terminal, as a window — running a ranger-style file manager over the open
 * folder, because a prompt with nothing to type into it is not much of an app.
 *
 * Three panes, left to right: the parent directory with the current one
 * highlighted, the current directory with the cursor, and a preview of
 * whatever the cursor is on — a folder's listing or a file's raw text. One
 * colour, one font, no icons: the look is a terminal's, not the editor's.
 *
 * The payload is the path under the cursor (see `utils/fileManager.ts`), so
 * every `j` and `k` goes through `setArg` and a reload restores the cursor.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import "./Terminal.css";
import folderFiles from "virtual:open-folder-files";
import {
  type Entry,
  cursorAt,
  enterFolder,
  homePath,
  listDir,
  moveCursor,
  parentOf,
} from "../../utils/fileManager";
import { type AppRenderProps } from "../types";

/** The name in the prompt and the root's parent pane — the bar says tom@box. */
const USER = "tom";
const HOST = "box";

/**
 * Keys typed into a text field belong to that field. Enter on a button or a
 * link belongs to it too — pressing it on another window's close button must
 * not also open a file here.
 */
function belongsToTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("input, textarea, select")) return true;
  return event.key === "Enter" && target.closest("button, a[href]") !== null;
}

export function TerminalApp({ arg, focused, maximized, handle }: AppRenderProps) {
  const { dir, entries, index } = cursorAt(folderFiles, arg);
  const cursor: Entry | undefined = entries[index];
  const parentEntries = dir === "" ? null : listDir(folderFiles, parentOf(dir));

  /**
   * The row each directory's cursor was last on, so leaving a folder with `h`
   * and coming back with `l` lands where you were — what ranger does. Only
   * this window's own trail, and only for as long as the window is open.
   */
  const remembered = useRef(new Map<string, string>());
  useEffect(() => {
    if (cursor) remembered.current.set(dir, cursor.path);
  }, [dir, cursor]);

  const pick = useCallback((entry: Entry) => handle.setArg(entry.path), [handle]);

  const activate = useCallback(
    (entry: Entry) => {
      if (entry.node.kind === "folder") {
        const inside = enterFolder(folderFiles, entry.path, remembered.current.get(entry.path));
        if (inside) handle.setArg(inside);
      } else {
        // A file manager hands a file to whatever opens that type: a page is
        // for looking at, so HTML goes to the browser, and the rest to $EDITOR.
        handle.open(entry.node.type === "html" ? "browser" : "editor", entry.path);
      }
    },
    [handle],
  );

  // Only the focused window answers the keyboard, like the editor's Ctrl+P:
  // with two terminals open, one `j` must not move both cursors.
  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (belongsToTarget(event)) return;

      let next: string | null | undefined;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          next = moveCursor(folderFiles, arg, 1);
          break;
        case "k":
        case "ArrowUp":
          next = moveCursor(folderFiles, arg, -1);
          break;
        case "g":
        case "Home":
          next = moveCursor(folderFiles, arg, -Infinity);
          break;
        case "G":
        case "End":
          next = moveCursor(folderFiles, arg, Infinity);
          break;
        case "h":
        case "ArrowLeft":
        case "Backspace":
          if (dir !== "") next = dir;
          break;
        case "l":
        case "ArrowRight":
        case "Enter":
          if (cursor) activate(cursor);
          event.preventDefault();
          return;
        default:
          return;
      }
      event.preventDefault();
      if (next !== undefined && next !== arg) handle.setArg(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, arg, dir, cursor, activate, handle]);

  // Keep the cursor's row inside its pane. Set by hand rather than with
  // `scrollIntoView`, which would also scroll every ancestor that can — the
  // desktop's strip included — and the strip only moves on a focus change.
  const currentPane = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pane = currentPane.current;
    const row = pane?.querySelector<HTMLElement>(".term-row--cursor");
    if (!pane || !row) return;
    if (row.offsetTop < pane.scrollTop) pane.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > pane.scrollTop + pane.clientHeight) {
      pane.scrollTop = row.offsetTop + row.offsetHeight - pane.clientHeight;
    }
  }, [arg]);

  return (
    <div className={`term${maximized ? "" : " term--windowed"}`}>
      <div className="term-topline">
        <span className="term-prompt">
          <span className="term-host">{USER}@{HOST}</span> {homePath(cursor?.path ?? dir)}
        </span>
        {/* A maximized window covers the bar, so its own restore button is the
            only way back to the strip. Every app has to carry one. */}
        <div className="term-winbtns">
          <button
            className="term-winbtn"
            onClick={handle.toggleFullscreen}
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M3.5 3.5v-2h7v7h-2" />
                <rect x="1.5" y="3.5" width="7" height="7" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="1.5" y="1.5" width="9" height="9" />
              </svg>
            )}
          </button>
          <button
            className="term-winbtn term-winbtn--close"
            onClick={handle.close}
            aria-label="Close"
            title="Close"
          >
            <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="term-panes">
        <div className="term-pane">
          {parentEntries ? (
            <Listing entries={parentEntries} selected={dir} onPick={pick} />
          ) : (
            // The open folder is home, so the pane beside it is /home, with
            // only us in it.
            <div className="term-row term-row--folder term-row--cursor">{USER}</div>
          )}
        </div>

        <div className="term-pane" ref={currentPane}>
          <Listing
            entries={entries}
            selected={cursor?.path}
            onPick={pick}
            onActivate={activate}
          />
        </div>

        <div className="term-pane term-pane--preview">
          {cursor && <Preview entry={cursor} onPick={pick} onActivate={activate} />}
        </div>
      </div>
    </div>
  );
}

interface ListingProps {
  entries: Entry[];
  selected: string | undefined;
  onPick: (entry: Entry) => void;
  onActivate?: (entry: Entry) => void;
}

function Listing({ entries, selected, onPick, onActivate }: ListingProps) {
  if (entries.length === 0) return <div className="term-empty">empty</div>;
  return (
    <ul className="term-list">
      {entries.map((entry) => (
        <li
          key={entry.path}
          className={
            "term-row" +
            (entry.node.kind === "folder" ? " term-row--folder" : "") +
            (entry.path === selected ? " term-row--cursor" : "")
          }
          onClick={() => onPick(entry)}
          onDoubleClick={onActivate && (() => onActivate(entry))}
        >
          {entry.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * A folder previews as its listing, and picking a row in it goes in, cursor
 * on that row; a file previews as its raw text. Raw even for markdown and
 * HTML — this is `cat`, not a renderer; the editor and browser do rendering.
 */
function Preview({ entry, onPick, onActivate }: {
  entry: Entry;
  onPick: (entry: Entry) => void;
  onActivate: (entry: Entry) => void;
}) {
  if (entry.node.kind === "file") {
    return <pre className="term-preview-text">{entry.node.content}</pre>;
  }
  return (
    <Listing
      entries={listDir(folderFiles, entry.path) ?? []}
      selected={undefined}
      onPick={onPick}
      onActivate={onActivate}
    />
  );
}
