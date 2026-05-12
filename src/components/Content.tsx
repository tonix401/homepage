import { useState, useEffect, useRef } from "react";
import "./Content.css";
import type { ThemedToken } from "shiki";
import { type FileNode } from "../services/types";
import { highlighterReady, langFromType } from "../services/highlighter";
import { langHintToFileType } from "../utils/fileTypes";
import { SetiIcon } from "./SetiIcon";
import chevronRightIcon from "@vscode/codicons/src/icons/chevron-right.svg";
import openPreviewIcon from "@vscode/codicons/src/icons/open-preview.svg";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface ContentProps {
  file: FileNode | null;
  onNavigate?: (href: string) => void;
  resolveFile?: (fromPath: string, href: string) => FileNode | null;
}

// Accepts only relative paths — no scheme (javascript:, http:, etc.),
// no absolute paths, no same-page anchors.
function isSafeRelativeHref(href: string): boolean {
  return href.length > 0 && !href.startsWith("#") && !href.includes(":") && !href.startsWith("/");
}

// Replaces <link rel="stylesheet" href="..."> tags with inline <style> blocks
// so stylesheets load inside a null-origin srcDoc iframe.
function inlineCss(
  html: string,
  fromPath: string,
  resolveFile: (fromPath: string, href: string) => FileNode | null,
): string {
  return html.replace(/<link\b([^>]*)>/gi, (tag, attrs: string) => {
    if (!/\brel=["']stylesheet["']/i.test(attrs)) return tag;
    const m = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!m || !isSafeRelativeHref(m[1])) return tag;
    const f = resolveFile(fromPath, m[1]);
    return f ? `<style>\n${f.content}\n</style>` : tag;
  });
}

// Prepended to every HTML srcDoc so anchor clicks send a postMessage instead
// of trying to navigate the iframe or parent.
// The <style> block makes the html element transparent so the iframe element's
// dark background shows through before the page's own CSS is applied.
const HTML_NAV_SCRIPT =
  "<style>html{background:transparent}</style>" +
  "<script>document.addEventListener('click',function(e){" +
  "var a=e.target.closest('a[href]');if(!a)return;" +
  "var h=a.getAttribute('href');" +
  "if(!h||h.charAt(0)==='#'||h.indexOf(':')!==-1||h.charAt(0)==='/')return;" +
  "e.preventDefault();window.parent.postMessage({navigate:h},'*');" +
  "});</script>";


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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [tokenLines, setTokenLines] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fileType = langHintToFileType(lang);
    if (fileType === "unsupported") return;
    highlighterReady.then((hl) => {
      if (cancelled) return;
      try {
        const result = hl.codeToTokens(code, {
          lang: langFromType(fileType),
          theme: "dark-plus",
        });
        setTokenLines(result.tokens);
      } catch {
        // language not in bundle — plain text fallback
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lang, code]);

  const lines = code.trimEnd().split("\n");

  return (
    <code>
      {lines.map((line, i) => {
        const tokens = tokenLines?.[i];
        return (
          <div key={i}>
            {tokens && tokens.length > 0
              ? tokens.map((token, j) => (
                  <span key={j} style={tokenStyle(token)}>{token.content}</span>
                ))
              : (line || " ")}
          </div>
        );
      })}
    </code>
  );
}

function tokenStyle(token: ThemedToken): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (token.color) style.color = token.color;
  if (token.fontStyle) {
    if (token.fontStyle & 1) style.fontStyle = "italic";
    if (token.fontStyle & 2) style.fontWeight = "bold";
    if (token.fontStyle & 4) style.textDecoration = "underline";
  }
  return style;
}

export function Content({ file, onNavigate, resolveFile }: ContentProps) {
  const [tokenLines, setTokenLines] = useState<ThemedToken[][] | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!file) {
      setTokenLines(null);
      return;
    }
    let cancelled = false;
    highlighterReady.then((hl) => {
      if (cancelled) return;
      try {
        const result = hl.codeToTokens(file.content, {
          lang: langFromType(file.type),
          theme: "dark-plus",
        });
        setTokenLines(result.tokens);
      } catch {
        setTokenLines(null);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    setViewMode("preview");
  }, [file]);

  // Listen for navigation postMessages from the HTML iframe.
  // Validates source so only our iframe can trigger navigation.
  useEffect(() => {
    if (!onNavigate || file?.type !== "html") return;

    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const href = e.data?.navigate;
      if (typeof href === "string" && isSafeRelativeHref(href)) {
        onNavigate(href);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [file, onNavigate]);

  if (!file) {
    return (
      <main className="vscode-content vscode-content--empty">
        <span>Select a file to view its contents.</span>
      </main>
    );
  }

  const lines = file.content.split("\n");
  const isPreviewable = file.type === "md" || file.type === "html";

  const tabBar = (
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
  );

  const codeView = (
    <div className="vscode-editor-area">
      <div className="vscode-line-numbers" aria-hidden="true">
        {lines.map((_, i) => (
          <div key={i} className="vscode-line-number">{i + 1}</div>
        ))}
      </div>
      <div className="vscode-code-area" style={tokenLines ? undefined : { opacity: 0.35 }}>
        {lines.map((line, i) => {
          const tokens = tokenLines?.[i];
          return (
            <div key={i} className="vscode-line">
              {tokens && tokens.length > 0
                ? tokens.map((token, j) => (
                    <span key={j} style={tokenStyle(token)}>{token.content}</span>
                  ))
                : (line || " ")}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (file.type === "md") {
    return (
      <main className="vscode-content">
        {tabBar}
        <Breadcrumb file={file} />
        {viewMode === "code" ? codeView : (
          <div className="vscode-md-area">
            <div className="vscode-md-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  a({ href, children, ...props }) {
                    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                      if (!onNavigate || !href || !isSafeRelativeHref(href)) return;
                      e.preventDefault();
                      onNavigate(href);
                    };
                    return (
                      <a href={href} onClick={handleClick} {...props}>
                        {children}
                      </a>
                    );
                  },
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className ?? "");
                    if (match) {
                      return <CodeBlock lang={match[1]} code={String(children)} />;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {file.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (file.type === "html") {
    const processed = resolveFile
      ? inlineCss(file.content, file.path, resolveFile)
      : file.content;
    return (
      <main className="vscode-content">
        {tabBar}
        <Breadcrumb file={file} />
        {viewMode === "code" ? codeView : (
          <iframe
            ref={iframeRef}
            className="vscode-html-area"
            srcDoc={HTML_NAV_SCRIPT + processed}
            sandbox="allow-scripts"
            title={file.name}
          />
        )}
      </main>
    );
  }


  return (
    <main className="vscode-content">
      {tabBar}
      <Breadcrumb file={file} />
      {codeView}
    </main>
  );
}
