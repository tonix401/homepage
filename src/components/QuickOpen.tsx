import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "./QuickOpen.css";
import { type FileNode } from "../services/types";
import {
  type MatchRange,
  type SearchHit,
  searchFiles,
} from "../utils/search";
import { SetiIcon } from "./SetiIcon";

interface QuickOpenProps {
  files: FileNode[];
  placeholder: string;
  onOpen: (file: FileNode) => void;
  /** Incremented by a Ctrl/Cmd+P elsewhere in the app to focus the input. */
  focusSignal: number;
}

/** Split `text` into marked and unmarked pieces for rendering. */
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

/** `a/b/file.md` -> `{ dir: "a/b/", name: "file.md" }`, with ranges split too. */
function splitPath(path: string, ranges: MatchRange[]) {
  const cut = path.lastIndexOf("/") + 1;
  return {
    dir: path.slice(0, cut),
    name: path.slice(cut),
    dirRanges: ranges.filter((r) => r.end <= cut),
    nameRanges: ranges
      .filter((r) => r.start >= cut)
      .map((r) => ({ start: r.start - cut, end: r.end - cut })),
  };
}

export function QuickOpen({ files, placeholder, onOpen, focusSignal }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [storedIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const hits = useMemo(() => searchFiles(files, query), [files, query]);

  // Derived rather than stored: the list shrinks as the query narrows, and an
  // index left pointing past the end would select nothing on Enter.
  const activeIndex = Math.min(storedIndex, Math.max(0, hits.length - 1));

  useEffect(() => {
    if (focusSignal === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const open = useCallback(
    (hit: SearchHit) => {
      onOpen(hit.file);
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onOpen],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (isOpen) setIsOpen(false);
      else setQuery("");
      return;
    }
    if (hits.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(hits[activeIndex]);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, hits.length]);

  const showPanel = isOpen && query.trim() !== "";

  return (
    <div className="vscode-quickopen">
      <div className="vscode-title-search">
        <svg
          className="vscode-title-search-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <circle cx="6.5" cy="6.5" r="4.5" />
          <line x1="10" y1="10" x2="14" y2="14" />
        </svg>
        <input
          ref={inputRef}
          className="vscode-title-search-input"
          type="text"
          value={query}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={
            showPanel && hits.length > 0 ? `${listId}-${activeIndex}` : undefined
          }
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showPanel && (
        // Keep focus in the input so onBlur does not close the panel before a
        // click on a row registers.
        <div
          className="vscode-quickopen-panel"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul className="vscode-quickopen-list" id={listId} role="listbox" ref={listRef}>
            {hits.length === 0 && (
              <li className="vscode-quickopen-empty">No matching results</li>
            )}
            {hits.map((hit, index) => (
              <Row
                key={`${hit.kind}-${hit.file.path}-${"line" in hit ? hit.line : "name"}-${index}`}
                id={`${listId}-${index}`}
                hit={hit}
                active={index === activeIndex}
                onHover={() => setActiveIndex(index)}
                onSelect={() => open(hit)}
              />
            ))}
          </ul>
          <div className="vscode-quickopen-status">
            <span>
              {hits.length} result{hits.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  id: string;
  hit: SearchHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}

function Row({ id, hit, active, onHover, onSelect }: RowProps) {
  const { dir, name, dirRanges, nameRanges } =
    hit.kind === "name"
      ? splitPath(hit.file.path, hit.ranges)
      : splitPath(hit.file.path, []);

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={`vscode-quickopen-row${active ? " vscode-quickopen-row--active" : ""}`}
      onMouseMove={onHover}
      onClick={onSelect}
    >
      <SetiIcon type={hit.file.type} name={hit.file.name} size={16} />
      <span className="vscode-quickopen-name">{renderRanges(name, nameRanges)}</span>
      {dir !== "" && (
        <span className="vscode-quickopen-dir">
          {renderRanges(dir.slice(0, -1), dirRanges)}
        </span>
      )}
      {hit.kind === "content" && (
        <>
          <span className="vscode-quickopen-line">:{hit.line}</span>
          <span className="vscode-quickopen-snippet">
            {renderRanges(hit.text, hit.ranges)}
          </span>
        </>
      )}
    </li>
  );
}
