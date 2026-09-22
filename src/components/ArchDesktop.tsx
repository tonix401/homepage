import { type ReactNode } from "react";
import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import { type WorkspaceLanguage } from "../utils/route";
import wallpaper from "/arch_background.svg";

interface ArchDesktopProps {
  workspace: number;
  language: WorkspaceLanguage;
  occupiedWorkspaces: ReadonlySet<number>;
  onWorkspaceChange: (workspace: number) => void;
  onLanguageChange: (language: WorkspaceLanguage) => void;
  onOpen: () => void;
  /** The window shown on this workspace, if any. */
  children?: ReactNode;
}

export function ArchDesktop({
  workspace,
  language,
  occupiedWorkspaces,
  onWorkspaceChange,
  onLanguageChange,
  onOpen,
  children,
}: ArchDesktopProps) {
  return (
    <div className="arch-desktop">
      <Waybar
        workspace={workspace}
        language={language}
        occupiedWorkspaces={occupiedWorkspaces}
        onWorkspaceChange={onWorkspaceChange}
        onLanguageChange={onLanguageChange}
        onOpen={onOpen}
      />
      <div className="arch-wallpaper">
        <img
          src={wallpaper}
          alt=""
          className="arch-wallpaper-img"
        />
      </div>
      {children}
    </div>
  );
}
