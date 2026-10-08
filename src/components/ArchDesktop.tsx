import { useCallback, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import "./ArchDesktop.css";
import { Waybar } from "./Waybar";
import { Launcher } from "./Launcher";
import { type WorkspaceLanguage } from "../utils/desktop";
import { type Point } from "../utils/menuPlacement";
import { type AppId } from "../apps/ids";
import { WallpaperCat } from "./WallpaperCat";
import { type ThemeId, themeTokens } from "../themes/theme";
import { type SubjectId } from "../themes/subjects";
import { backgroundUrl, wallpaperUrl } from "../themes/wallpaper";

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
  // Followed live, so turning on reduced motion stops the cat at once.
  const still = useSyncExternalStore(watchReducedMotion, prefersReducedMotion);

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
        menuOpen={launcherAt !== null}
      />
      <Wallpaper layer={wallpaperLayer(theme, subject, still)} still={still} />
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
 * One wallpaper as it is shown: the image, and the colour of the animated cat
 * drawn over it, if any.
 */
interface WallpaperLayer {
  url: string;
  cat: string | null;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function watchReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The cat moves (src/cat): its wallpaper is the gradient alone, with the cat
 * drawn over it live in the theme's primary. With reduced motion it is the
 * still drawing, as every other subject is.
 */
function wallpaperLayer(theme: ThemeId, subject: SubjectId, still: boolean): WallpaperLayer {
  if (subject === "cat" && !still) return { url: backgroundUrl(theme), cat: themeTokens(theme).primary };
  return { url: wallpaperUrl(theme, subject), cat: null };
}

/**
 * The wallpaper, revealed by a growing circle whenever it changes — a new
 * theme or a new subject. The colours around it fade because they are
 * registered custom properties (see `theme.ts`), but a wallpaper is an image
 * and can only be swapped — so the old one stays underneath while the new one
 * is uncovered from the middle outward, and is dropped once the circle has
 * reached the corners. The animated cat belongs to its layer, so it is
 * uncovered with it, and the old layer keeps its own cat in the old colour.
 *
 * Keyed by the image's URL, which `wallpaperUrl` and `backgroundUrl` memoize
 * per theme and subject, so the same wallpaper is always the same string.
 */
function Wallpaper({ layer, still }: { layer: WallpaperLayer; still: boolean }) {
  const [layers, setLayers] = useState<{ top: WallpaperLayer; under: WallpaperLayer | null }>({
    top: layer,
    under: null,
  });
  // Adjusted during the render that notices the change, rather than in an
  // effect, so there is never a frame with the new image and nothing under it.
  if (layers.top.url !== layer.url) setLayers({ top: layer, under: layers.top });
  // The reveal waits for the new image: an SVG with a blur this size takes a
  // moment to rasterize, and a circle that started first would be empty.
  const [loaded, setLoaded] = useState<string | null>(null);
  const { top, under } = layers;

  return (
    <div className="arch-wallpaper">
      {under && (
        <div key={under.url} className="arch-wallpaper-layer">
          <img src={under.url} alt="" className="arch-wallpaper-img" draggable={false} />
          {/* With reduced motion there is no reveal to end and drop this layer:
              it stays, covered, until the next change, and its cat must not
              keep running unseen. */}
          {under.cat && !still && <WallpaperCat color={under.cat} />}
        </div>
      )}
      <div
        key={top.url}
        className={
          "arch-wallpaper-layer" +
          (under ? " arch-wallpaper-layer--in" : "") +
          (loaded === top.url ? " arch-wallpaper-layer--loaded" : "")
        }
        onAnimationEnd={() => setLayers((current) => ({ ...current, under: null }))}
      >
        <img
          src={top.url}
          alt=""
          className="arch-wallpaper-img"
          draggable={false}
          onLoad={() => setLoaded(top.url)}
        />
        {top.cat && <WallpaperCat color={top.cat} />}
      </div>
    </div>
  );
}
