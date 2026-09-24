import { useState, type ReactNode } from "react";
import "./ArchDesktop.css";
import { HOST_LABEL, NO_WINDOW_LABEL, Waybar } from "./Waybar";
import { Launcher } from "./Launcher";
import { Icon } from "./Icon";
import { type WorkspaceLanguage } from "../utils/desktop";
import { type AppId } from "../apps/ids";
import { type ThemeId } from "../themes/theme";
import { type SubjectId } from "../themes/subjects";
import { wallpaperUrl } from "../themes/wallpaper";

interface ArchDesktopProps {
  workspace: number;
  language: WorkspaceLanguage;
  /** Picks the wallpaper; every other colour follows the theme through CSS. */
  theme: ThemeId;
  /** From the launcher's Themes submenu. */
  onThemeChange: (theme: ThemeId) => void;
  /** What the wallpaper shows, from the launcher's Wallpapers submenu. */
  subject: SubjectId;
  onSubjectChange: (subject: SubjectId) => void;
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
  /** True when this workspace holds no windows, which is what the hint is for. */
  empty: boolean;
  /** The strips: the one on this workspace, and any still sliding away. */
  children?: ReactNode;
}

export function ArchDesktop({
  workspace,
  language,
  theme,
  onThemeChange,
  subject,
  onSubjectChange,
  workspaceApps,
  onWorkspaceChange,
  onLanguageChange,
  onLaunch,
  onHome,
  focusedApp,
  focusedTitle,
  empty,
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
      <Wallpaper url={wallpaperUrl(theme, subject)} />
      {children}
      {empty && <EmptyHint />}
      <Launcher
        open={launcherOpen}
        theme={theme}
        onThemeChange={onThemeChange}
        subject={subject}
        onSubjectChange={onSubjectChange}
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

/**
 * The wallpaper, revealed by a growing circle whenever it changes — a new
 * theme or a new subject. The colours around it fade because they are
 * registered custom properties (see `theme.ts`), but a wallpaper is an image
 * and can only be swapped — so the old one stays underneath while the new one
 * is uncovered from the middle outward, and is dropped once the circle has
 * reached the corners.
 *
 * Keyed by the image's URL, which `wallpaperUrl` memoizes per theme and
 * subject, so the same wallpaper is always the same string.
 */
function Wallpaper({ url }: { url: string }) {
  const [layers, setLayers] = useState<{ top: string; under: string | null }>({
    top: url,
    under: null,
  });
  // Adjusted during the render that notices the change, rather than in an
  // effect, so there is never a frame with the new image and nothing under it.
  if (layers.top !== url) setLayers({ top: url, under: layers.top });
  // The reveal waits for the new image: an SVG with a blur this size takes a
  // moment to rasterize, and a circle that started first would be empty.
  const [loaded, setLoaded] = useState<string | null>(null);

  return (
    <div className="arch-wallpaper">
      {layers.under && (
        <img
          key={layers.under}
          src={layers.under}
          alt=""
          className="arch-wallpaper-img"
          draggable={false}
        />
      )}
      <img
        key={layers.top}
        src={layers.top}
        alt=""
        className={
          "arch-wallpaper-img" +
          (layers.under ? " arch-wallpaper-img--in" : "") +
          (loaded === layers.top ? " arch-wallpaper-img--loaded" : "")
        }
        draggable={false}
        onLoad={() => setLoaded(layers.top)}
        onAnimationEnd={() => setLayers((current) => ({ ...current, under: null }))}
      />
    </div>
  );
}
