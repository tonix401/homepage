import "./Header.css";
import { searchBarText } from "virtual:open-folder-config";
import { resolveSearchBarText } from "../utils/searchBarText";

const MENU_ITEMS = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];

interface HeaderProps {
  fileName?: string;
  filePath?: string;
  onClose?: () => void;
  onMinimize?: () => void;
}

export function Header({ fileName, filePath, onClose, onMinimize }: HeaderProps) {
  return (
    <header className="vscode-header">
      <div className="vscode-header-left">
        <svg className="vscode-appicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#007ACC" /></svg>
        <nav className="vscode-menu-bar">
          {MENU_ITEMS.map((item) => (
            <span key={item} className="vscode-menu-item">{item}</span>
          ))}
        </nav>
      </div>

      <div className="vscode-header-center">
        <div className="vscode-title-search">
          <svg className="vscode-title-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
          <span className="vscode-title-search-text">
            {resolveSearchBarText(searchBarText, fileName, filePath)}
          </span>
        </div>
      </div>

      <div className="vscode-header-right">
        <button className="vscode-winbtn vscode-winbtn--min" aria-label="Minimize" title="Minimize" onClick={onMinimize}>
          <svg viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="5.5" width="10" height="1" /></svg>
        </button>
        <button className="vscode-winbtn vscode-winbtn--max" aria-label="Maximize" title="Maximize">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1"><rect x="1.5" y="1.5" width="9" height="9" /></svg>
        </button>
        <button className="vscode-winbtn vscode-winbtn--close" aria-label="Close" title="Close" onClick={onClose}>
          <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
        </button>
      </div>
    </header>
  );
}
