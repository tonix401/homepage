import { useState, type ReactNode } from "react";
import "./ArchDesktop.css";
import { HOST_LABEL, NO_WINDOW_LABEL, Waybar } from "./Waybar";
import { Launcher } from "./Launcher";
import { Icon } from "./Icon";
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
  /**
   * The strip of windows on this workspace, or nothing when it holds none —
   * an empty workspace shows the hint below instead.
   */
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
      {children || <EmptyHint />}
      <Launcher
        open={launcherOpen}
        onLaunch={onLaunch}
        onClose={() => setLauncherOpen(false)}
      />
    </div>
  );
}

/**
 * What an empty workspace says.
 *
 * Closing the last window leaves the bare wallpaper, and both ways out of it
 * are segments in the bar — easy to miss when there is nothing else on screen
 * to look at. It sits under the *left* end of the bar because that is where
 * both of those segments are; centred on the desktop it would be pointing at
 * nothing. The labels come from `Waybar` rather than being retyped, so the
 * hint cannot end up naming a segment that no longer reads that way.
 */
function EmptyHint() {
  return (
    <div className="arch-hint">
      <Icon className="arch-hint-caret" path="M6 15l6-6 6 6" />
      <div className="arch-hint-card">
        <p className="arch-hint-lead">Nothing open on this workspace</p>
        {/* A description list, so the labels form a column and their meanings
            line up beside it — and in the order the bar reads, left to right,
            so the caret above lands on the first one named. */}
        <dl className="arch-hint-keys">
          <dt>
            <span className="arch-hint-key">{HOST_LABEL}</span>
          </dt>
          <dd>reopens Codium</dd>
          <dt>
            <span className="arch-hint-key">{NO_WINDOW_LABEL}</span>
          </dt>
          <dd>opens the launcher</dd>
        </dl>
      </div>
    </div>
  );
}
