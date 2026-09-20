import { useState, useCallback, useEffect, useMemo } from "react";
import "./App.css";
import { type FileNode, type TreeNode } from "./services/types";
import folderFiles from "virtual:open-folder-files";
import { activities, windowsDesktop } from "virtual:open-folder-config";
import { Header } from "./components/Header";
import { Win11Desktop } from "./components/Win11Desktop";
import { ActivityBar, type Panel } from "./components/ActivityBar";
import { Sidebar } from "./components/Sidebar";
import { Explorer } from "./components/Explorer";
import { CustomPanel } from "./components/CustomPanel";
import { Content } from "./components/Content";
import { Footer } from "./components/Footer";
import { flattenFiles } from "./utils/search";

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

function fileFromHash(): FileNode | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  return findFileByPath(folderFiles, decodeURIComponent(hash));
}

function App() {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(
    () => fileFromHash() ?? findFirstFile(folderFiles)
  );
  const [activePanel, setActivePanel] = useState<Panel>("explorer");
  /** Line to reveal and highlight after a search hit opens a file. */
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  /** Bumped by Ctrl/Cmd+P; QuickOpen focuses its input when it changes. */
  const [focusSignal, setFocusSignal] = useState(0);
  const [isWindowClosed, setIsWindowClosed] = useState(false);
  const handleWindowClose = windowsDesktop ? () => setIsWindowClosed(true) : undefined;

  const files = useMemo(() => flattenFiles(folderFiles), []);

  const handleSelect = useCallback((file: FileNode) => {
    window.location.hash = encodeURIComponent(file.path);
    setSelectedFile(file);
    setHighlightLine(null);
  }, []);

  const handleSearchOpen = useCallback((file: FileNode, line?: number) => {
    window.location.hash = encodeURIComponent(file.path);
    setSelectedFile(file);
    setHighlightLine(line ?? null);
  }, []);

  useEffect(() => {
    const handler = () => {
      const file = fileFromHash() ?? findFirstFile(folderFiles);
      setSelectedFile(file);
      setHighlightLine(null);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "p" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setFocusSignal((signal) => signal + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNavigate = useCallback((href: string) => {
    if (!selectedFile) return;
    const resolved = resolvePath(selectedFile.path, href);
    const target = findFileByPath(folderFiles, resolved);
    if (target) handleSelect(target);
  }, [selectedFile, handleSelect]);

  const resolveFile = useCallback((fromPath: string, href: string) => {
    return findFileByPath(folderFiles, resolvePath(fromPath, href));
  }, []);

  const activeActivity = typeof activePanel === "number" ? activities[activePanel] : null;

  if (windowsDesktop && isWindowClosed) {
    return <Win11Desktop onOpen={() => setIsWindowClosed(false)} />;
  }

  return (
    <div className="vscode-layout">
      <Header
        fileName={selectedFile?.name}
        filePath={selectedFile?.path}
        files={files}
        onOpen={handleSearchOpen}
        focusSignal={focusSignal}
        onClose={handleWindowClose}
        onMinimize={handleWindowClose}
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
        <Content
          file={selectedFile}
          highlightLine={highlightLine}
          onNavigate={handleNavigate}
          resolveFile={resolveFile}
        />
      </div>
      <Footer file={selectedFile} />
    </div>
  );
}

export default App;
