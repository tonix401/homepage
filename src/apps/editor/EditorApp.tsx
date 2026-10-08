/**
 * The VSCode-like editor, as a window.
 *
 * This is the whole of what `App.tsx` used to render directly. Everything that
 * describes *one* editor now lives here — which panel is open, what the quick
 * open box and the Search view have been typed into, which folders the
 * explorer has expanded — so
 * two editors side by side are genuinely two editors rather than one state
 * shared by both. The file it shows is its window's payload, and opening
 * another one is `handle.setArg`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import folderFiles from "virtual:open-folder-files";
import { activities, defaultFile } from "virtual:open-folder-config";
import { type FileNode } from "../../services/types";
import { Header } from "../../components/Header";
import { ActivityBar, type Panel } from "../../components/ActivityBar";
import { Sidebar } from "../../components/Sidebar";
import { Explorer } from "../../components/Explorer";
import { CustomPanel } from "../../components/CustomPanel";
import { RunAndDebug } from "../../components/RunAndDebug";
import { SearchPanel } from "../../components/SearchPanel";
import { SourceControl } from "../../components/SourceControl";
import { Content } from "../../components/Content";
import { Footer } from "../../components/Footer";
import { EMPTY_FIND, type FindQuery, flattenFiles } from "../../utils/search";
import { findDefaultFile, findFileByPath, resolvePath } from "../../utils/files";
import { isPhone } from "../../utils/phone";
import { type AppRenderProps } from "../types";

export function EditorApp({ arg, focused, maximized, handle }: AppRenderProps) {
  const [activePanel, setActivePanel] = useState<Panel>("explorer");
  // On a phone the sidebar is a drawer over the file (Sidebar.css), and a
  // window that opens with one already out shows the explorer, not the page.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isPhone());
  /** Bumped by Ctrl/Cmd+P; QuickOpen focuses its input when it changes. */
  const [focusSignal, setFocusSignal] = useState(0);
  /** Kept here, not in the panel, so it survives switching to another one. */
  const [search, setSearch] = useState<FindQuery>(EMPTY_FIND);
  /** Bumped by Ctrl/Cmd+Shift+F; the Search view focuses its input. */
  const [searchSignal, setSearchSignal] = useState(0);

  const files = useMemo(() => flattenFiles(folderFiles), []);
  /** A payload naming a file that is not in the tree falls back to the first. */
  const selectedFile = useMemo(
    () => (arg ? findFileByPath(folderFiles, arg) : null) ?? findDefaultFile(folderFiles, defaultFile),
    [arg],
  );

  // Only the focused window answers the shortcuts: with three editors open,
  // one keystroke must not put the caret in all three search boxes.
  useEffect(() => {
    if (!focused) return;
    const searchPanel = activities.findIndex((activity) => activity.panel === "search");
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey) {
        // VSCode's Find in Files: opens the Search view, or refocuses it.
        if (key !== "f" || searchPanel === -1) return;
        setActivePanel(searchPanel);
        setSidebarOpen(true);
        setSearchSignal((signal) => signal + 1);
      } else if (key === "p") setFocusSignal((signal) => signal + 1);
      else if (key === "b") setSidebarOpen((open) => !open);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused]);

  // VSCode's rule: the active panel's own icon hides the sidebar, and any icon
  // shows it again, opened on that panel.
  const handlePanelChange = useCallback(
    (panel: Panel) => {
      if (sidebarOpen && panel === activePanel) {
        setSidebarOpen(false);
      } else {
        setActivePanel(panel);
        setSidebarOpen(true);
      }
    },
    [sidebarOpen, activePanel],
  );

  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  // Picking a file on a phone is done with the drawer: what was picked is
  // behind it.
  const handleSelect = useCallback(
    (file: FileNode) => {
      if (isPhone()) setSidebarOpen(false);
      handle.setArg(file.path);
    },
    [handle],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      if (!selectedFile) return;
      const target = findFileByPath(folderFiles, resolvePath(selectedFile.path, href));
      if (target) handle.setArg(target.path);
    },
    [selectedFile, handle],
  );

  const resolveFile = useCallback((fromPath: string, href: string) => {
    return findFileByPath(folderFiles, resolvePath(fromPath, href));
  }, []);

  const activeActivity = typeof activePanel === "number" ? activities[activePanel] : null;

  return (
    <div className={`vscode-layout${maximized ? "" : " vscode-layout--windowed"}`}>
      <Header
        fileName={selectedFile?.name}
        filePath={selectedFile?.path}
        files={files}
        onOpen={handleSelect}
        onNavigate={handle.setArg}
        focusSignal={focusSignal}
        isFullscreen={maximized}
        onToggleFullscreen={handle.toggleFullscreen}
        onClose={handle.close}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
      <div className="vscode-body">
        <ActivityBar
          activities={activities}
          activePanel={sidebarOpen ? activePanel : null}
          onPanelChange={handlePanelChange}
        />
        {sidebarOpen && (
          <div className="vscode-drawer-scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar open={sidebarOpen}>
          {activePanel === "explorer" && (
            <Explorer nodes={folderFiles} selectedFile={selectedFile} onSelect={handleSelect} />
          )}
          {activeActivity?.panel === "search" && (
            <SearchPanel
              title={activeActivity.title}
              files={files}
              search={search}
              onSearchChange={setSearch}
              onOpen={handleSelect}
              focusSignal={searchSignal}
            />
          )}
          {activeActivity?.panel === "source-control" && (
            <SourceControl title={activeActivity.title} />
          )}
          {activeActivity?.panel === "run-and-debug" && (
            <RunAndDebug title={activeActivity.title} />
          )}
          {activeActivity && activeActivity.panel === undefined && (
            <CustomPanel title={activeActivity.title} text={activeActivity.text} />
          )}
        </Sidebar>
        <Content file={selectedFile} onNavigate={handleNavigate} resolveFile={resolveFile} />
      </div>
      <Footer file={selectedFile} />
    </div>
  );
}
