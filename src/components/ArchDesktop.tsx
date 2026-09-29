import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import { Launcher } from "./Launcher";
import { type WorkspaceLanguage } from "../utils/desktop";
import { type Point } from "../utils/menuPlacement";
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
  /** True when this workspace holds no windows: the bar's launcher segment pulses. */
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
  // Where the launcher menu is open, or `null`. Desktop chrome and nothing
  // else: it is not worth a history entry, and a reload should not reopen it.
  const [launcherAt, setLauncherAt] = useState<Point | null>(null);

  /*
   * Right-clicking the background opens the launcher at the pointer, as a
   * desktop's own menu would — anywhere the wallpaper shows, on an empty workspace or between
   * windows. The strip lies over all of it, so the test is what the click was
   * *not* on: a window, the bar and the launcher keep the browser's menu. The
   * DOM check comes first because React bubbles events through portals, and
   * the browser's bookmark menus are portalled to <body>, outside every window.
   */
  const openOnBackground = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (target.closest(".arch-column, .waybar, dialog")) return;
    event.preventDefault();
    setLauncherAt({ x: event.clientX, y: event.clientY });
  };

  // Stable, since the launcher listens for resizes with it while it is open.
  const closeLauncher = useCallback(() => setLauncherAt(null), []);

  return (
    <div className="arch-desktop" onContextMenu={openOnBackground}>
      <Waybar
        workspace={workspace}
        language={language}
        workspaceApps={workspaceApps}
        onWorkspaceChange={onWorkspaceChange}
        onLanguageChange={onLanguageChange}
        onHome={onHome}
        focusedApp={focusedApp}
        focusedTitle={focusedTitle}
        onAppMenu={setLauncherAt}
        empty={empty}
      />
      <Wallpaper url={wallpaperUrl(theme, subject)} />
      {children}
      <Launcher
        at={launcherAt}
        theme={theme}
        onThemeChange={onThemeChange}
        subject={subject}
        onSubjectChange={onSubjectChange}
        onLaunch={onLaunch}
        onClose={closeLauncher}
      />
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
