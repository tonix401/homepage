import { useState, useEffect } from "react";
import "./Explorer.css";
import {
  type FileNode,
  type FolderNode,
  type TreeNode,
} from "../services/types";
import { SetiIcon } from "./SetiIcon";
import { rootFolderName, foldersFirst } from "virtual:open-folder-config";
import chevronRightIcon from "@vscode/codicons/src/icons/chevron-right.svg";

interface ExplorerProps {
  nodes: TreeNode[];
  selectedFile: FileNode | null;
  onSelect: (file: FileNode) => void;
}

function collectOpenFolderPaths(
  nodes: TreeNode[],
  prefix: string,
  out: Set<string>,
) {
  for (const node of nodes) {
    if (node.kind === "folder") {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.defaultOpen !== false) {
        out.add(path);
      }
      collectOpenFolderPaths(node.children, path, out);
    }
  }
}

export function Explorer({ nodes, selectedFile, onSelect }: ExplorerProps) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    const paths = new Set(["__root__"]);
    collectOpenFolderPaths(nodes, "", paths);
    return paths;
  });

  useEffect(() => {
    if (!selectedFile) return;
    const parts = selectedFile.path.split("/");
    if (parts.length <= 1) return;
    setOpenFolders(prev => {
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join("/"));
      }
      return next;
    });
  }, [selectedFile]);

  const toggle = (path: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const rootOpen = openFolders.has("__root__");

  return (
    <div className="vscode-explorer">
      <div className="vscode-explorer-heading">EXPLORER</div>
      <ul className="vscode-file-list">
        <li className="vscode-folder-item" onClick={() => toggle("__root__")}>
          <img
            src={chevronRightIcon}
            alt=""
            className={`vscode-caret${rootOpen ? " vscode-caret--open" : ""}`}
          />
          <span className="vscode-file-name">{rootFolderName}</span>
        </li>
        {rootOpen &&
          [...nodes]
            .sort((a, b) => {
              if (!foldersFirst || a.kind === b.kind) return 0;
              return a.kind === "folder" ? -1 : 1;
            })
            .map((node) => (
              <TreeItem
                key={node.name}
                node={node}
                path={node.name}
                depth={1}
                selectedFile={selectedFile}
                onSelect={onSelect}
                openFolders={openFolders}
                onToggle={toggle}
              />
            ))}
      </ul>
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  path: string;
  depth: number;
  selectedFile: FileNode | null;
  onSelect: (file: FileNode) => void;
  openFolders: Set<string>;
  onToggle: (path: string) => void;
}

function TreeItem({
  node,
  path,
  depth,
  selectedFile,
  onSelect,
  openFolders,
  onToggle,
}: TreeItemProps) {
  const indent = depth * 12;

  if (node.kind === "file") {
    const active = selectedFile === node;
    return (
      <li
        className={`vscode-file-item${active ? " vscode-file-item--active" : ""}`}
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => onSelect(node)}
      >
        <SetiIcon type={node.type} name={node.name} />
        <span className="vscode-file-name">{node.name}</span>
      </li>
    );
  }

  return (
    <FolderItem
      node={node}
      path={path}
      depth={depth}
      selectedFile={selectedFile}
      onSelect={onSelect}
      openFolders={openFolders}
      onToggle={onToggle}
    />
  );
}

interface FolderItemProps {
  node: FolderNode;
  path: string;
  depth: number;
  selectedFile: FileNode | null;
  onSelect: (file: FileNode) => void;
  openFolders: Set<string>;
  onToggle: (path: string) => void;
}

function FolderItem({
  node,
  path,
  depth,
  selectedFile,
  onSelect,
  openFolders,
  onToggle,
}: FolderItemProps) {
  const isOpen = openFolders.has(path);
  const indent = depth * 12;

  return (
    <>
      <li
        className="vscode-folder-item"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => onToggle(path)}
      >
        <img
          src={chevronRightIcon}
          alt=""
          className={`vscode-caret${isOpen ? " vscode-caret--open" : ""}`}
        />
        <span className="vscode-file-name">{node.name}</span>
      </li>
      {isOpen &&
        [...node.children]
          .sort((a, b) => {
            if (a.kind === b.kind) return 0;
            return a.kind === "folder" ? -1 : 1;
          })
          .map((child) => (
            <TreeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
              openFolders={openFolders}
              onToggle={onToggle}
            />
          ))}
    </>
  );
}
