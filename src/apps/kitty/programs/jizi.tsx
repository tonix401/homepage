/**
 * jīzǐ, a yazi-style file manager over the open folder — a full-screen
 * program in kitty, run as `jizi` (or `yazi`, `ranger`) and left with `q`.
 *
 * Three panes, left to right: the parent directory with the current one
 * highlighted, the current directory with the cursor, and a preview of
 * whatever the cursor is on — a folder's listing or a file's raw text. One
 * colour, one font, no icons: the look is a terminal's, not the editor's.
 *
 * Its one argument is the path under the cursor (see `utils/fileManager.ts`),
 * kept in the window's payload, so every `j` and `k` goes through `setArgs`
 * and a reload restores the cursor.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./Jizi.css";
import {
  type Entry,
  cursorAt,
  enterFolder,
  listDir,
  moveCursor,
  parentOf,
} from "../../../utils/fileManager";
import { type TreeNode } from "../../../services/types";
import { addFile, useTree } from "../../../utils/fileStore";
import { carriesFiles, readDropped } from "../../../utils/drop";
import { USER, appFor } from "../../../utils/shell";
import { type ScreenProps } from "./types";

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

export function JiziScreen({ args, setArgs, exit, focused, open }: ScreenProps) {
  const arg = args[0] ?? null;
  const tree = useTree();
  const { dir, entries, index } = cursorAt(tree, arg);
  const cursor: Entry | undefined = entries[index];
  const parentEntries = dir === "" ? null : listDir(tree, parentOf(dir));

  /**
   * The row each directory's cursor was last on, so leaving a folder with `h`
   * and coming back with `l` lands where you were — what ranger does. Only
   * this window's own trail, and only for as long as the window is open.
   */
  const remembered = useRef(new Map<string, string>());
  useEffect(() => {
    if (cursor) remembered.current.set(dir, cursor.path);
  }, [dir, cursor]);

  const setArg = useCallback((path: string | null) => setArgs(path === null ? [] : [path]), [setArgs]);
  const pick = useCallback((entry: Entry) => setArg(entry.path), [setArg]);

  const activate = useCallback(
    (entry: Entry) => {
      if (entry.node.kind === "folder") {
        const inside = enterFolder(tree, entry.path, remembered.current.get(entry.path));
        if (inside) setArg(inside);
      } else {
        // A file manager hands a file to whatever opens that type.
        open(appFor(entry.node), entry.path);
      }
    },
    [setArg, open, tree],
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
          next = moveCursor(tree, arg, 1);
          break;
        case "k":
        case "ArrowUp":
          next = moveCursor(tree, arg, -1);
          break;
        case "g":
        case "Home":
          next = moveCursor(tree, arg, -Infinity);
          break;
        case "G":
        case "End":
          next = moveCursor(tree, arg, Infinity);
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
        case "q":
        case "Escape":
          exit();
          event.preventDefault();
          return;
        default:
          return;
      }
      event.preventDefault();
      if (next !== undefined && next !== arg) setArg(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, arg, dir, cursor, activate, setArg, exit, tree]);

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

  // Files dropped on it are added to the folder being listed, and the cursor
  // goes to the first; what could not be added is reported for a moment, as
  // yazi reports a failed paste.
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const receive = async (files: FileList) => {
    const errors: string[] = [];
    let first: string | null = null;
    for (const { name, bytes } of await readDropped(files)) {
      const path = dir ? `${dir}/${name}` : name;
      const added = addFile(path, bytes);
      if ("error" in added) errors.push(`${name}: ${added.error}`);
      else first ??= path;
    }
    if (first) setArg(first);
    setNotice(errors.length ? errors.join("; ") : null);
  };

  return (
    <div
      className={`term${dropping ? " term--dropping" : ""}`}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!carriesFiles(event)) return;
        event.preventDefault();
        void receive(event.dataTransfer.files);
      }}
    >
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
          {cursor && <Preview entry={cursor} tree={tree} onPick={pick} onActivate={activate} />}
        </div>
      </div>
      {notice && <div className="term-notice">{notice}</div>}
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
 * An image is the exception, as it is in yazi under kitty: the picture, fit
 * to the pane.
 */
function Preview({ entry, tree, onPick, onActivate }: {
  entry: Entry;
  tree: TreeNode[];
  onPick: (entry: Entry) => void;
  onActivate: (entry: Entry) => void;
}) {
  if (entry.node.kind === "file") {
    if (entry.node.type === "image") {
      return <img
          className="term-preview-image"
          src={entry.node.src}
          alt={entry.node.name}
          draggable={false}
          referrerPolicy="no-referrer"
        />;
    }
    return <pre className="term-preview-text">{entry.node.content}</pre>;
  }
  return (
    <Listing
      entries={listDir(tree, entry.path) ?? []}
      selected={undefined}
      onPick={onPick}
      onActivate={onActivate}
    />
  );
}
