import { type ReactNode } from "react";
import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import wallpaper from "/arch_background.svg";

interface ArchDesktopProps {
  workspace: number;
  occupiedWorkspaces: ReadonlySet<number>;
  onWorkspaceChange: (workspace: number) => void;
  onOpen: () => void;
  /** The window shown on this workspace, if any. */
  children?: ReactNode;
}

export function ArchDesktop({
  workspace,
  occupiedWorkspaces,
  onWorkspaceChange,
  onOpen,
  children,
}: ArchDesktopProps) {
  return (
    <div className="arch-desktop">
      <Waybar
        workspace={workspace}
        occupiedWorkspaces={occupiedWorkspaces}
        onWorkspaceChange={onWorkspaceChange}
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
