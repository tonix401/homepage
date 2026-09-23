/**
 * The VSCode-like editor, as a window.
 *
 * This is the whole of what `App.tsx` used to render directly. Everything that
 * describes *one* editor now lives here — which panel is open, what the quick
 * open box has been typed into, which folders the explorer has expanded — so
 * two editors side by side are genuinely two editors rather than one state
 * shared by both. The file it shows is its window's payload, and opening
 * another one is `handle.setArg`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import folderFiles from "virtual:open-folder-files";
import { activities } from "virtual:open-folder-config";
import { type FileNode } from "../../services/types";
import { Header } from "../../components/Header";
import { ActivityBar, type Panel } from "../../components/ActivityBar";
import { Sidebar } from "../../components/Sidebar";
import { Explorer } from "../../components/Explorer";
import { CustomPanel } from "../../components/CustomPanel";
import { Content } from "../../components/Content";
import { Footer } from "../../components/Footer";
import { flattenFiles } from "../../utils/search";
import { findFirstFile, findFileByPath, resolvePath } from "../../utils/files";
import { type AppRenderProps } from "../types";

export function EditorApp({ arg, focused, maximized, handle }: AppRenderProps) {
  const [activePanel, setActivePanel] = useState<Panel>("explorer");
  /** Bumped by Ctrl/Cmd+P; QuickOpen focuses its input when it changes. */
  const [focusSignal, setFocusSignal] = useState(0);

  const files = useMemo(() => flattenFiles(folderFiles), []);
  /** A payload naming a file that is not in the tree falls back to the first. */
  const selectedFile = useMemo(
    () => (arg ? findFileByPath(folderFiles, arg) : null) ?? findFirstFile(folderFiles),
    [arg],
  );

  // Only the focused window answers the shortcut: with three editors open,
  // one keystroke must not put the caret in all three search boxes.
  useEffect(() => {
    if (!focused) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "p" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setFocusSignal((signal) => signal + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused]);

  const handleSelect = useCallback((file: FileNode) => handle.setArg(file.path), [handle]);

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
      />
      <div className="vscode-body">
        <ActivityBar
          activities={activities}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
        />
        <Sidebar>
          {activePanel === "explorer" && (
            <Explorer nodes={folderFiles} selectedFile={selectedFile} onSelect={handleSelect} />
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
}
