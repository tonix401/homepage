import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { type FileNode, type TreeNode } from "./services/types";
import folderFiles from "virtual:open-folder-files";
import { activities, showDesktop } from "virtual:open-folder-config";
import { Header } from "./components/Header";
import { ArchDesktop } from "./components/ArchDesktop";
import { ActivityBar, type Panel } from "./components/ActivityBar";
import { Sidebar } from "./components/Sidebar";
import { Explorer } from "./components/Explorer";
import { CustomPanel } from "./components/CustomPanel";
import { Content } from "./components/Content";
import { Footer } from "./components/Footer";
import { flattenFiles } from "./utils/search";
import {
  parseRoute,
  formatRoute,
  DEFAULT_STATE,
  type Route,
  type WindowState,
} from "./utils/route";

function findFirstFile(nodes: TreeNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") return node;
    const found = findFirstFile(node.children);
    if (found) return found;
  }
  return null;
}

function findFileByPath(nodes: TreeNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.path === path) return node;
    if (node.kind === "folder") {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function resolvePath(fromPath: string, href: string): string {
  const dir = fromPath.split("/").slice(0, -1);
  for (const part of href.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  return dir.join("/");
}

/** The file path a legacy `/#projects%2FHomelab.md` link points at. */
function pathFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  try {
    return decodeURIComponent(hash);
  } catch {
    return null;
  }
}

/** What a window on the current workspace is showing. */
interface OpenWindow {
  state: WindowState;
  filePath: string | null;
}

/**
 * Without the desktop there is nothing to be windowed against, so every route
 * collapses onto the maximized editor.
 */
function routeFromLocation(): Route {
  const route = parseRoute(window.location.search);
  // A legacy `/#projects%2FHomelab.md` link names its file in the hash.
  const filePath = route.filePath ?? (route.state ? pathFromHash() : null);
  // Without the desktop there is nothing to be windowed against, so every
  // route collapses onto the maximized editor.
  return showDesktop
    ? { ...route, filePath }
    : { ...route, filePath, state: DEFAULT_STATE };
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [activePanel, setActivePanel] = useState<Panel>("explorer");
  /** Bumped by Ctrl/Cmd+P; QuickOpen focuses its input when it changes. */
  const [focusSignal, setFocusSignal] = useState(0);
  /**
   * The window open on each workspace, so leaving a workspace and coming back
   * finds the editor as it was. An entry is dropped when its window is closed.
   */
  const [windows, setWindows] = useState<ReadonlyMap<number, OpenWindow>>(() =>
    route.state
      ? new Map([[route.workspace, { state: route.state, filePath: route.filePath }]])
      : new Map(),
  );
  /** Defaults for re-opening a closed window. */
  const lastWindow = useRef<OpenWindow>(
    route.state
      ? { state: route.state, filePath: route.filePath }
      : { state: DEFAULT_STATE, filePath: null },
  );

  const files = useMemo(() => flattenFiles(folderFiles), []);
  /** A route naming a file that is not in the tree falls back to the first one. */
  const selectedFile = useMemo(
    () =>
      (route.filePath ? findFileByPath(folderFiles, route.filePath) : null) ??
      findFirstFile(folderFiles),
    [route.filePath],
  );

  /** Moves to a route and records what the workspace it leaves behind held. */
  const applyRoute = useCallback((next: Route) => {
    setRoute(next);
    const { workspace, state, filePath } = next;
    if (!state) return;
    const open: OpenWindow = { state, filePath };
    lastWindow.current = open;
    setWindows((prev) => new Map(prev).set(workspace, open));
  }, []);

  const navigate = useCallback(
    (next: Route, replace = false) => {
      const url = formatRoute(next);
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      applyRoute(next);
    },
    [applyRoute],
  );

  // Keeps the address bar honest about routes it did not produce itself: a
  // legacy hash link, or a file that has since left the tree. A no-op after
  // `navigate`, which has already written the same URL — and on `/`, whose
  // missing `file` already means the first file.
  useEffect(() => {
    const shown =
      route.state && route.filePath
        ? { ...route, filePath: selectedFile?.path ?? null }
        : route;
    const url = formatRoute(shown);
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (url !== current) window.history.replaceState(null, "", url);
  }, [route, selectedFile]);

  useEffect(() => {
    const handler = () => applyRoute(routeFromLocation());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [applyRoute]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "p" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setFocusSignal((signal) => signal + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelect = useCallback(
    (file: FileNode) => {
      navigate({
        workspace: route.workspace,
        state: route.state ?? lastWindow.current.state,
        filePath: file.path,
      });
    },
    [navigate, route.workspace, route.state],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      if (!selectedFile) return;
      const target = findFileByPath(folderFiles, resolvePath(selectedFile.path, href));
      if (target) handleSelect(target);
    },
    [selectedFile, handleSelect],
  );

  const resolveFile = useCallback((fromPath: string, href: string) => {
    return findFileByPath(folderFiles, resolvePath(fromPath, href));
  }, []);

  const handleOpenWindow = useCallback(() => {
    const { state, filePath } = lastWindow.current;
    navigate({
      workspace: route.workspace,
      state,
      filePath: filePath ?? findFirstFile(folderFiles)?.path ?? null,
    });
  }, [navigate, route.workspace]);

  const handleCloseWindow = useCallback(() => {
    setWindows((prev) => {
      if (!prev.has(route.workspace)) return prev;
      const next = new Map(prev);
      next.delete(route.workspace);
      return next;
    });
    navigate({ workspace: route.workspace, state: null, filePath: null });
  }, [navigate, route.workspace]);

  const handleToggleFullscreen = useCallback(() => {
    if (!route.state) return;
    navigate({ ...route, state: route.state === "fullscreen" ? "window" : "fullscreen" });
  }, [navigate, route]);

  const handleWorkspaceChange = useCallback(
    (workspace: number) => {
      if (workspace === route.workspace) return;
      const open = windows.get(workspace);
      navigate({
        workspace,
        state: open?.state ?? null,
        filePath: open?.filePath ?? null,
      });
    },
    [navigate, route.workspace, windows],
  );

  const occupiedWorkspaces = useMemo(() => new Set(windows.keys()), [windows]);
  const activeActivity = typeof activePanel === "number" ? activities[activePanel] : null;

  const editor = (
    <div className={`vscode-layout${route.state === "window" ? " vscode-layout--windowed" : ""}`}>
      <Header
        fileName={selectedFile?.name}
        filePath={selectedFile?.path}
        files={files}
        onOpen={handleSelect}
        focusSignal={focusSignal}
        isFullscreen={route.state === "fullscreen"}
        onToggleFullscreen={showDesktop ? handleToggleFullscreen : undefined}
        onClose={showDesktop ? handleCloseWindow : undefined}
        onMinimize={showDesktop ? handleCloseWindow : undefined}
      />
      <div className="vscode-body">
        <ActivityBar
          activities={activities}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
        />
        <Sidebar>
          {activePanel === "explorer" && (
            <Explorer
              nodes={folderFiles}
              selectedFile={selectedFile}
              onSelect={handleSelect}
            />
          )}
          {activeActivity && (
            <CustomPanel title={activeActivity.title} text={activeActivity.text} />
          )}
        </Sidebar>
        <Content file={selectedFile} onNavigate={handleNavigate} resolveFile={resolveFile} />
      </div>
      <Footer file={selectedFile} />
    </div>
  );

  if (route.state === "fullscreen") return editor;

  return (
    <ArchDesktop
      workspace={route.workspace}
      occupiedWorkspaces={occupiedWorkspaces}
      onWorkspaceChange={handleWorkspaceChange}
      onOpen={handleOpenWindow}
    >
      {route.state === "window" && <div className="arch-window">{editor}</div>}
    </ArchDesktop>
  );
}

export default App;
