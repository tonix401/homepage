import { type FileNode } from "../services/types";
import "./Footer.css";

interface FooterProps {
  file: FileNode | null;
}

export function Footer({ file }: FooterProps) {
  const lineCount = file?.content.split("\n").length ?? 0;

  return (
    <footer className="vscode-footer">
      {file && (
        <>
          <span className="vscode-footer-item">{file.type.toUpperCase()}</span>
          <span className="vscode-footer-item">Ln {lineCount}</span>
          <span className="vscode-footer-item">UTF-8</span>
          <span className="vscode-footer-item">Read Only</span>
        </>
      )}
    </footer>
  );
}
