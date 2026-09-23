import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { ArchDesktop } from "./components/ArchDesktop";
import { ArchStrip } from "./components/ArchStrip";
import { APPS } from "./apps/registry";
import { DEFAULT_APP, type AppId } from "./apps/ids";
import { type WindowHandle } from "./apps/types";
import {
  closeWindow,
  defaultDesktop,
  focusWindow,
  focusedWindow,
  openWindow,
  setArg,
  setFullscreen,
  setLanguage,
  switchWorkspace,
  windowsOf,
  type Desktop,
  type WindowId,
  type WindowRecord,
  type WorkspaceLanguage,
} from "./utils/desktop";
import { loadDesktop, saveDesktop } from "./utils/session";

/**
 * Runs every restored payload past its app. `session.ts` deliberately knows
 * nothing about the file tree, so this is where a window pointing at a file
 * that has left it degrades to that app's default instead of coming back blank.
 */
function normalize(desktop: Desktop): Desktop {
  const windows: Record<WindowId, WindowRecord> = {};
  for (const [id, window] of Object.entries(desktop.windows)) {
    const arg = APPS[window.app].normalizeArg(window.arg);
    windows[id] = arg === window.arg ? window : { ...window, arg };
  }
  return { ...desktop, windows };
}

/** This tab's desktop as it was left, or a fresh one on a first visit. */
function initialDesktop(): Desktop {
  const stored = loadDesktop();
  return stored ? normalize(stored) : defaultDesktop();
}

function App() {
  const [desktop, setDesktop] = useState(initialDesktop);

  const windows = useMemo(() => windowsOf(desktop), [desktop]);
  const focused = focusedWindow(desktop);

  // The desktop is nowhere else — there is no URL carrying any of it — so it
  // is mirrored on every change. A few hundred bytes, nothing to debounce.
  useEffect(() => {
    saveDesktop(desktop);
  }, [desktop]);

  const handleWorkspaceChange = useCallback((workspace: number) => {
    setDesktop((current) => switchWorkspace(current, workspace));
  }, []);

  const handleLanguageChange = useCallback((language: WorkspaceLanguage) => {
    setDesktop((current) => setLanguage(current, language));
  }, []);

  const handleLaunch = useCallback((app: AppId) => {
    setDesktop((current) => openWindow(current, { app, arg: null }));
  }, []);

  /**
   * The bar's Arch mark: Codium, maximized, on its default page.
   *
   * The one place that opens maximized. `openWindow` deliberately leaves the
   * strip tiled, so the flag is set after it rather than by it — the rule
   * stands, this is the single exception, and the editor carries its own
   * restore button so the bar is one click away again.
   */
  const handleHome = useCallback(() => {
    setDesktop((current) => {
      const window = focusedWindow(current);
      // Reuse a focused editor rather than stacking up windows. `setArg`
      // returns the same object when the payload already matches, so a second
      // press changes nothing but the fullscreen flag.
      const next =
        window?.app === DEFAULT_APP
          ? setArg(current, window.id, null)
          : openWindow(current, { app: DEFAULT_APP, arg: null });
      return setFullscreen(next, true);
    });
  }, []);

  const handleFocus = useCallback((id: WindowId) => {
    setDesktop((current) => focusWindow(current, id));
  }, []);

  /**
   * One handle per window, rebuilt only when the desktop changes, so an app
   * can keep it in a dependency list without re-running on every render. Each
   * closes over its own id, so a button always acts on the window it is in —
   * never on whichever one happens to have focus.
   */
  const handles = useMemo(
    () =>
      new Map(
        windows.map((window): [WindowId, WindowHandle] => [
          window.id,
          {
            id: window.id,
            setArg: (arg) =>
              setDesktop((current) => setArg(focusWindow(current, window.id), window.id, arg)),
            close: () => setDesktop((current) => closeWindow(current, window.id)),
            toggleFullscreen: () =>
              setDesktop((current) =>
                setFullscreen(focusWindow(current, window.id), !current.fullscreen),
              ),
            focus: () => handleFocus(window.id),
            open: (app, arg = null) => setDesktop((current) => openWindow(current, { app, arg })),
          },
        ]),
      ),
    [windows, handleFocus],
  );

  const renderWindow = useCallback(
    (window: WindowRecord) => {
      const handle = handles.get(window.id);
      if (!handle) return null;
      return APPS[window.app].render({
        arg: window.arg,
        focused: window.id === focused?.id,
        maximized: desktop.fullscreen,
        handle,
      });
    },
    [handles, focused?.id, desktop.fullscreen],
  );

  /** What each workspace holds, for the icons in its Waybar pill. */
  const workspaceApps = useMemo(
    () =>
      new Map(
        Object.entries(desktop.workspaces).map(([workspace, record]) => [
          Number(workspace),
          record.windows
            .map((id) => desktop.windows[id]?.app)
            .filter((app): app is AppId => app !== undefined),
        ]),
      ),
    [desktop],
  );

  // A maximized window renders bare, covering the bar, which is why every app
  // has to carry a restore button of its own.
  if (desktop.fullscreen && focused) return <>{renderWindow(focused)}</>;

  return (
    <ArchDesktop
      workspace={desktop.workspace}
      language={desktop.language}
      workspaceApps={workspaceApps}
      onWorkspaceChange={handleWorkspaceChange}
      onLanguageChange={handleLanguageChange}
      onLaunch={handleLaunch}
      onHome={handleHome}
      focusedApp={focused?.app ?? null}
      focusedTitle={focused ? APPS[focused.app].title(focused.arg) : null}
    >
      {windows.length > 0 && (
        <ArchStrip
          windows={windows}
          focusedId={focused?.id ?? null}
          onFocus={handleFocus}
          renderWindow={renderWindow}
        />
      )}
    </ArchDesktop>
  );
}

export default App;
