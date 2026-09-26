import { useState } from "react";
import "./Content.css";
import { type FileNode } from "../services/types";
import { SetiIcon } from "./SetiIcon";
import { FileView } from "./FileView";
import chevronRightIcon from "@vscode/codicons/src/icons/chevron-right.svg";
import openPreviewIcon from "@vscode/codicons/src/icons/open-preview.svg";

interface ContentProps {
  file: FileNode | null;
  onNavigate?: (href: string) => void;
  resolveFile?: (fromPath: string, href: string) => FileNode | null;
}

function Breadcrumb({ file }: { file: FileNode }) {
  const parts = file.path.split("/");
  return (
    <div className="vscode-breadcrumb">
      <span className="vscode-breadcrumb-item">WEBSITE</span>
      {parts.map((part, i) => {
        const isFile = i === parts.length - 1;
        return (
          <span key={i} className="vscode-breadcrumb-segment">
            <img src={chevronRightIcon} alt="" className="vscode-breadcrumb-sep" />
            {isFile && <SetiIcon type={file.type} size={16} />}
            <span className={isFile ? "vscode-breadcrumb-item vscode-breadcrumb-item--file" : "vscode-breadcrumb-item"}>
              {part}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function Content({ file, onNavigate, resolveFile }: ContentProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  // A new file opens in preview. Adjusted during render rather than in an
  // effect, so the new file never paints once in the old file's mode.
  const [shownFile, setShownFile] = useState(file);
  if (file !== shownFile) {
    setShownFile(file);
    setViewMode("preview");
  }

  if (!file) {
    return (
      <main className="vscode-content vscode-content--empty">
        <span>Select a file to view its contents.</span>
      </main>
    );
  }

  const isPreviewable = file.type === "md" || file.type === "html";

  return (
    <main className="vscode-content">
      <div className="vscode-tab-bar">
        <div className="vscode-tab vscode-tab--active">
          <SetiIcon type={file.type} />
          <span>{file.name}</span>
        </div>
        {isPreviewable && (
          <button
            className={`vscode-view-toggle${viewMode === "code" ? " vscode-view-toggle--active" : ""}`}
            onClick={() => setViewMode(v => v === "preview" ? "code" : "preview")}
            title={viewMode === "preview" ? "Show source code" : "Open preview"}
          >
            <img src={openPreviewIcon} alt="Open preview" width={16} height={16} />
          </button>
        )}
      </div>
      <Breadcrumb file={file} />
      <FileView
        file={file}
        mode={viewMode}
        onNavigate={onNavigate}
        resolveFile={resolveFile}
      />
    </main>
  );
}
