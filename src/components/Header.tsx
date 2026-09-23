import "./Header.css";
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
}: HeaderProps) {
  return (
    <header className="vscode-header">
      <div className="vscode-header-left">
        <svg className="vscode-appicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#007ACC" /></svg>
        <nav className="vscode-menu-bar">
          {menuItems.map(({ label, file, url }, i) => {
            // A file opens in this window rather than loading a page, so it is
            // a button; only a destination off the site is a real link.
            if (url !== undefined) {
              return (
                <a key={i} className="vscode-menu-item" href={url} target="_blank" rel="noreferrer">
                  {label}
                </a>
              );
            }
            if (file !== undefined) {
              return (
                <button key={i} className="vscode-menu-item" onClick={() => onNavigate(file)}>
                  {label}
                </button>
              );
            }
            return <span key={i} className="vscode-menu-item">{label}</span>;
          })}
        </nav>
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
