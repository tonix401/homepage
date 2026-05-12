import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./CustomPanel.css";

interface CustomPanelProps {
  title: string;
  text: string;
}

export function CustomPanel({ title, text }: CustomPanelProps) {
  return (
    <div className="vscode-custom-panel">
      <div className="vscode-explorer-heading">{title}</div>
      <div className="vscode-md-area">
        <div className="vscode-md-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
