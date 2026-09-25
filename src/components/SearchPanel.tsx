/**
 * VSCode's Search view: a find box with its three toggles, then every match
 * in the open folder grouped by file. It searches contents only — the header's
 * quick open is the one that finds files by name — and there is no replace,
 * since nothing here can be written.
 *
 * The query and its toggles belong to the editor window (`EditorApp`), so
 * switching to the explorer and back finds them still there; which files are
 * collapsed is this panel's own.
 */
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { type FileNode } from "../services/types";
import { type FindOptions, type FindQuery, type MatchRange, findInFiles } from "../utils/search";
import { SetiIcon } from "./SetiIcon";
import "./SearchPanel.css";

/** Each toggle, its codicon, and the Alt shortcut VSCode gives it. */
const TOGGLES: { option: keyof FindOptions; label: string; icon: string; key: string }[] = [
  { option: "matchCase", label: "Match Case", icon: "case-sensitive", key: "c" },
  { option: "wholeWord", label: "Match Whole Word", icon: "whole-word", key: "w" },
  { option: "regex", label: "Use Regular Expression", icon: "regex", key: "r" },
];

interface SearchPanelProps {
  title: string;
  files: FileNode[];
  search: FindQuery;
  /** Given updaters, so a toggle and a keystroke in one tick cannot undo each other. */
  onSearchChange: Dispatch<SetStateAction<FindQuery>>;
  onOpen: (file: FileNode) => void;
  /** Incremented by Ctrl/Cmd+Shift+F to focus the input. */
  focusSignal: number;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function renderRanges(text: string, ranges: MatchRange[]) {
  const pieces = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (range.start > cursor) pieces.push(text.slice(cursor, range.start));
    pieces.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return pieces;
}

export function SearchPanel({
  title,
  files,
  search,
  onSearchChange,
  onOpen,
  focusSignal,
}: SearchPanelProps) {
  const { query, options } = search;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => findInFiles(files, query, options), [files, query, options]);
  const found = result.ok ? result.files : [];
  const allCollapsed = found.length > 0 && found.every(({ file }) => collapsed.has(file.path));

  // Opening the view puts the caret in the box, as VSCode does; so does
  // Ctrl+Shift+F when the view is already open.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const toggleOption = (option: keyof FindOptions) =>
    onSearchChange((current) => ({
      ...current,
      options: { ...current.options, [option]: !current.options[option] },
    }));

  const toggleFile = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const toggle = TOGGLES.find(({ key }) => key === event.key.toLowerCase());
    if (!toggle) return;
    event.preventDefault();
    toggleOption(toggle.option);
  };

  return (
    <div className="vscode-search">
      <div className="vscode-explorer-heading vscode-search-heading">
        {title}
        <div className="vscode-search-actions">
          <button
            className="vscode-search-action"
            title="Clear Search Results"
            aria-label="Clear Search Results"
            disabled={query === ""}
            onClick={() => {
              onSearchChange((current) => ({ ...current, query: "" }));
              inputRef.current?.focus();
            }}
          >
            <i className="codicon codicon-clear-all" aria-hidden="true" />
          </button>
          <button
            className="vscode-search-action"
            title={allCollapsed ? "Expand All" : "Collapse All"}
            aria-label={allCollapsed ? "Expand All" : "Collapse All"}
            disabled={found.length === 0}
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(found.map(({ file }) => file.path)))
            }
          >
            <i
              className={`codicon codicon-${allCollapsed ? "expand-all" : "collapse-all"}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div className={`vscode-search-box${result.ok ? "" : " vscode-search-box--error"}`}>
        <input
          ref={inputRef}
          className="vscode-search-input"
          type="text"
          value={query}
          placeholder="Search"
          aria-label="Search"
          aria-invalid={!result.ok}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const value = event.target.value;
            onSearchChange((current) => ({ ...current, query: value }));
          }}
          onKeyDown={handleKeyDown}
        />
        {TOGGLES.map(({ option, label, icon, key }) => (
          <button
            key={option}
            className="vscode-search-toggle"
            title={`${label} (Alt+${key.toUpperCase()})`}
            aria-label={label}
            aria-pressed={options[option]}
            onClick={() => toggleOption(option)}
          >
            <i className={`codicon codicon-${icon}`} aria-hidden="true" />
          </button>
        ))}
      </div>

      {!result.ok && <p className="vscode-search-error">{result.error}</p>}

      {result.ok && query !== "" && (
        <p className="vscode-search-summary" role="status">
          {result.total === 0
            ? "No results found."
            : `${plural(result.total, "result")} in ${plural(found.length, "file")}`}
          {result.truncated &&
            " — only the first matches are shown. Be more specific to narrow them down."}
        </p>
      )}

      <ul className="vscode-search-results" role="tree" aria-label="Search results">
        {found.map(({ file, lines, count }) => {
          const open = !collapsed.has(file.path);
          const dir = file.path.slice(0, Math.max(0, file.path.lastIndexOf("/")));
          return (
            <li key={file.path} role="treeitem" aria-expanded={open}>
              <button
                className="vscode-search-file"
                title={file.path}
                onClick={() => toggleFile(file.path)}
              >
                <i
                  className={`codicon codicon-chevron-${open ? "down" : "right"}`}
                  aria-hidden="true"
                />
                <SetiIcon type={file.type} name={file.name} size={16} />
                <span className="vscode-search-file-name">{file.name}</span>
                {dir !== "" && <span className="vscode-search-file-dir">{dir}</span>}
                <span className="vscode-search-count">{count}</span>
              </button>
              {open && (
                <ul role="group">
                  {lines.map(({ line, text, ranges }) => (
                    <li key={line} role="treeitem">
                      <button
                        className="vscode-search-match"
                        title={`${file.path}, line ${line}`}
                        onClick={() => onOpen(file)}
                      >
                        {renderRanges(text, ranges)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
