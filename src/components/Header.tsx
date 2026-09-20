import "./Header.css";
import { searchBarText } from "virtual:open-folder-config";
import { resolveSearchBarText } from "../utils/searchBarText";
import { type FileNode } from "../services/types";
import { QuickOpen } from "./QuickOpen";

const MENU_ITEMS: { label: string; href?: string }[] = [
  { label: "Home", href: "/" },
  { label: "Github", href: "https://github.com/tonix401" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Resume", href: "/resume" },
  { label: "Impressum", href: "/#legal%2Fimpressum.md" },
];

interface HeaderProps {
  fileName?: string;
  filePath?: string;
  files: FileNode[];
  onOpen: (file: FileNode, line?: number) => void;
  focusSignal: number;
  onClose?: () => void;
  onMinimize?: () => void;
}

export function Header({
  fileName,
  filePath,
  files,
  onOpen,
  focusSignal,
  onClose,
  onMinimize,
}: HeaderProps) {
  return (
    <header className="vscode-header">
      <div className="vscode-header-left">
        <svg className="vscode-appicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#007ACC" /></svg>
        <nav className="vscode-menu-bar">
          {MENU_ITEMS.map(({ label, href }) =>
            href ? (
              <a
                key={label}
                className="vscode-menu-item"
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noreferrer" : undefined}
              >
                {label}
              </a>
            ) : (
              <span key={label} className="vscode-menu-item">{label}</span>
            )
          )}
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
