import "./Header.css";
import { useEffect, useRef, useState } from "react";
import { menuItems, searchBarText } from "virtual:open-folder-config";
import { resolveSearchBarText } from "../utils/searchBarText";
import { type FileNode } from "../services/types";
import { QuickOpen } from "./QuickOpen";

interface HeaderProps {
  fileName?: string;
  filePath?: string;
  files: FileNode[];
  onOpen: (file: FileNode) => void;
  /** Follows a configured menu item, in this window. */
  onNavigate: (path: string | null) => void;
  focusSignal: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

/** The configured menu, as a bar or as the phone dropdown's rows. */
function MenuItems({ onNavigate, onPick }: { onNavigate: (path: string | null) => void; onPick?: () => void }) {
  return menuItems.map(({ label, file, url }, i) => {
    // A file opens in this window rather than loading a page, so it is
    // a button; only a destination off the site is a real link.
    if (url !== undefined) {
      return (
        <a key={i} className="vscode-menu-item" href={url} target="_blank" rel="noreferrer" onClick={onPick}>
          {label}
        </a>
      );
    }
    if (file !== undefined) {
      return (
        <button
          key={i}
          className="vscode-menu-item"
          onClick={() => {
            onPick?.();
            onNavigate(file);
          }}
        >
          {label}
        </button>
      );
    }
    return <span key={i} className="vscode-menu-item">{label}</span>;
  });
}

/**
 * The menu bar folded behind a button, for a phone: the labels alone are
 * wider than its screen. Both are always rendered and the stylesheet shows
 * one (Header.css), so the bar's markup is the same everywhere. A tap
 * anywhere else, or Escape, puts it away, and so does following an item.
 */
function PhoneMenu({ onNavigate }: { onNavigate: (path: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="vscode-phone-menu" ref={root}>
      <button
        className="vscode-phone-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <i className="codicon codicon-menu" />
      </button>
      {open && (
        <nav className="vscode-phone-menu-list">
          <MenuItems onNavigate={onNavigate} onPick={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}

export function Header({
  fileName,
  filePath,
  files,
  onOpen,
  onNavigate,
  focusSignal,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  sidebarOpen,
  onToggleSidebar,
}: HeaderProps) {
  return (
    <header className="vscode-header">
      <div className="vscode-header-left">
        <svg className="vscode-appicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#007ACC" /></svg>
        <nav className="vscode-menu-bar">
          <MenuItems onNavigate={onNavigate} />
        </nav>
        <PhoneMenu onNavigate={onNavigate} />
      </div>

      <div className="vscode-header-center">
        <QuickOpen
          files={files}
          placeholder={resolveSearchBarText(searchBarText, fileName, filePath)}
          onOpen={onOpen}
          focusSignal={focusSignal}
        />
      </div>

      <div className="vscode-header-right">
        <button
          className="vscode-layout-btn"
          aria-label="Toggle Primary Side Bar"
          aria-pressed={sidebarOpen}
          title="Toggle Primary Side Bar (Ctrl+B)"
          onClick={onToggleSidebar}
        >
          <i className={`codicon codicon-layout-sidebar-left${sidebarOpen ? "" : "-off"}`} />
        </button>
        <button
          className="vscode-winbtn vscode-winbtn--max"
          aria-label={isFullscreen ? "Restore" : "Maximize"}
          title={isFullscreen ? "Restore" : "Maximize"}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? (
            // Two offset squares: the standard "restore down" glyph.
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
        <button className="vscode-winbtn vscode-winbtn--close" aria-label="Close" title="Close" onClick={onClose}>
          <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
        </button>
      </div>
    </header>
  );
}
