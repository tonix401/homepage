/**
 * A file's body, without any editor chrome: the syntax-highlighted source, the
 * rendered markdown, or the sandboxed HTML preview.
 *
 * Split out of `Content.tsx` so an app other than the editor — the browser —
 * can show the same page without inheriting the tab bar and breadcrumb.
 */

import { useState, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { ThemedToken } from "shiki";
import { type FileNode } from "../services/types";
import { highlighterReady, langFromType } from "../services/highlighter";
import { langHintToFileType } from "../utils/fileTypes";
import { isSafeRelativeHref } from "../utils/files";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

export interface FileViewProps {
  file: FileNode;
  /** `code` shows the source even for a file that has a preview. */
  mode: "preview" | "code";
  onNavigate?: (href: string) => void;
  resolveFile?: (fromPath: string, href: string) => FileNode | null;
  /**
   * How far down the body is scrolled, 0–1, whenever it scrolls — 0 for a body
   * too short to scroll. Kdenlive's playhead follows it.
   */
  onScrollFraction?: (fraction: number) => void;
  /** Receives a function that scrolls the body to a fraction of the way down. */
  seekRef?: Ref<((fraction: number) => void) | null>;
}

/** How far down an element is scrolled, 0–1, or 0 when it cannot scroll. */
function scrollFraction(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(el.scrollTop / max, 1) : 0;
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
// of trying to navigate the iframe or parent. Anything that leaves the site —
// an absolute URL, or a scheme such as mailto: — opens in a new tab: the
// sandbox blocks it from reaching the top frame, and left alone it would load
// over the preview itself (blank, for a site that refuses framing).
// The <style> block makes the html element transparent so the iframe element's
// dark background shows through before the page's own CSS is applied. It also
// repeats index.css's scrollbar: the frame is a document of its own, so the
// site's stylesheet never reaches it, and a long page scrolled with the
// browser's default light, arrowed bar down the side of a dark window.
const HTML_NAV_SCRIPT =
  "<style>html{background:transparent;scrollbar-width:thin;scrollbar-color:#424242 transparent}" +
  "::-webkit-scrollbar{width:10px;height:10px}" +
  "::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}" +
  "::-webkit-scrollbar-thumb{background:#424242;border:2px solid transparent;background-clip:padding-box;border-radius:2px}" +
  "::-webkit-scrollbar-thumb:hover{background:#555555}</style>" +
  "<script>document.addEventListener('click',function(e){" +
  "var a=e.target.closest('a[href]');if(!a)return;" +
  "var h=a.getAttribute('href');if(!h||h.charAt(0)==='#')return;" +
  "e.preventDefault();" +
  "if(h.charAt(0)==='/'||h.indexOf(':')!==-1){window.open(h,'_blank','noopener');return;}" +
  "window.parent.postMessage({navigate:h},'*');" +
  "});" +
  // Scroll position out and seeks in, for a host that follows the frame's
  // scroll (Kdenlive's playhead): the frame has a null origin, so the parent
  // cannot read or set its scroll itself. Seeks are taken only from the parent.
  "function se(){return document.scrollingElement||document.documentElement}" +
  "addEventListener('scroll',function(){var s=se(),m=s.scrollHeight-s.clientHeight;" +
  "window.parent.postMessage({scroll:m>0?Math.min(s.scrollTop/m,1):0},'*');},{passive:true});" +
  "addEventListener('message',function(e){if(e.source!==window.parent)return;" +
  "var f=e.data&&e.data.seek;if(typeof f!=='number')return;" +
  "var s=se();s.scrollTop=f*(s.scrollHeight-s.clientHeight);});" +
  "</script>";

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

export function FileView({ file, mode, onNavigate, resolveFile, onScrollFraction, seekRef }: FileViewProps) {
  const [tokenLines, setTokenLines] = useState<ThemedToken[][] | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The markdown or source body, whichever is showing: the element that scrolls.
  const scrollerRef = useRef<HTMLDivElement>(null);
  // A frame cannot take a seek before its document has loaded, so one asked
  // for earlier waits here for `onLoad`.
  const frameLoaded = useRef(false);
  const pendingSeek = useRef<number | null>(null);

  useImperativeHandle(seekRef, () => (fraction: number) => {
    const frame = iframeRef.current;
    if (frame) {
      if (frameLoaded.current) frame.contentWindow?.postMessage({ seek: fraction }, "*");
      else pendingSeek.current = fraction;
      return;
    }
    const el = scrollerRef.current;
    if (el) el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
  }, []);

  // A new srcDoc is a new document, which has to load before it takes a seek.
  useEffect(() => {
    frameLoaded.current = false;
  }, [file, mode]);

  const handleFrameLoad = () => {
    frameLoaded.current = true;
    if (pendingSeek.current !== null) {
      iframeRef.current?.contentWindow?.postMessage({ seek: pendingSeek.current }, "*");
      pendingSeek.current = null;
    }
  };

  const handleScroll = onScrollFraction
    ? (e: React.UIEvent<HTMLDivElement>) => onScrollFraction(scrollFraction(e.currentTarget))
    : undefined;

  useEffect(() => {
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

  // Listen for navigation and scroll postMessages from the HTML iframe.
  // Validates source so only our iframe can trigger navigation — several of
  // these are mounted at once as soon as the desktop holds several windows.
  useEffect(() => {
    if ((!onNavigate && !onScrollFraction) || file.type !== "html") return;

    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const href = e.data?.navigate;
      if (onNavigate && typeof href === "string" && isSafeRelativeHref(href)) {
        onNavigate(href);
      }
      const scroll = e.data?.scroll;
      if (onScrollFraction && typeof scroll === "number" && Number.isFinite(scroll)) {
        onScrollFraction(Math.min(Math.max(scroll, 0), 1));
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [file, onNavigate, onScrollFraction]);

  if (mode === "preview" && file.type === "md") {
    return (
      <div className="vscode-md-area" ref={scrollerRef} onScroll={handleScroll}>
        {/* Keyed by file so a switch rebuilds the note. Reused, a <video>
            takes the next note's poster but keeps playing the last note's
            source: media elements only read <source> when they are created. */}
        <div className="vscode-md-content" key={file.path}>
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
    );
  }

  if (mode === "preview" && file.type === "html") {
    const processed = resolveFile
      ? inlineCss(file.content, file.path, resolveFile)
      : file.content;
    return (
      <iframe
        ref={iframeRef}
        className="vscode-html-area"
        srcDoc={HTML_NAV_SCRIPT + processed}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        title={file.name}
        onLoad={handleFrameLoad}
      />
    );
  }

  const lines = file.content.split("\n");

  return (
    <div className="vscode-editor-area" ref={scrollerRef} onScroll={handleScroll}>
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
}
