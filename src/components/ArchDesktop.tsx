import { useState, type ReactNode } from "react";
import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import { Launcher } from "./Launcher";
import { type WorkspaceLanguage } from "../utils/desktop";
import { type AppId } from "../apps/ids";
import wallpaper from "/arch_background.svg";

interface ArchDesktopProps {
  workspace: number;
  language: WorkspaceLanguage;
  /** Which apps each workspace holds, in strip order. */
  workspaceApps: ReadonlyMap<number, readonly AppId[]>;
  onWorkspaceChange: (workspace: number) => void;
  onLanguageChange: (language: WorkspaceLanguage) => void;
  /** Launch an app from the launcher's list. */
  onLaunch: (app: AppId) => void;
  /** The bar's Arch mark: the editor, maximized, on its default page. */
  onHome: () => void;
  focusedApp: AppId | null;
  focusedTitle: string | null;
  /** The strip of windows on this workspace. */
  children?: ReactNode;
}

export function ArchDesktop({
  workspace,
  language,
  workspaceApps,
  onWorkspaceChange,
  onLanguageChange,
  onLaunch,
  onHome,
  focusedApp,
  focusedTitle,
  children,
}: ArchDesktopProps) {
  // Whether the launcher is up is desktop chrome and nothing else: it is not
  // worth a history entry, and a shared link should not reopen it.
  const [launcherOpen, setLauncherOpen] = useState(false);

  return (
    <div className="arch-desktop">
      <Waybar
        workspace={workspace}
        language={language}
        workspaceApps={workspaceApps}
        onWorkspaceChange={onWorkspaceChange}
        onLanguageChange={onLanguageChange}
        onHome={onHome}
        focusedApp={focusedApp}
        focusedTitle={focusedTitle}
        onAppMenu={() => setLauncherOpen(true)}
      />
      <div className="arch-wallpaper">
        <img
          src={wallpaper}
          alt=""
          className="arch-wallpaper-img"
          draggable={false}
        />
      </div>
      {children}
      <Launcher
        open={launcherOpen}
        onLaunch={onLaunch}
        onClose={() => setLauncherOpen(false)}
      />
    </div>
  );
}
