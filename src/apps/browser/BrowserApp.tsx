/**
 * A browser, as a window.
 *
 * It shows the same `open_folder/` content the editor does, but as pages: the
 * window's payload is the current tab, the bookmarks bar carries the folder
 * itself — its folders as dropdowns — beside the configured `menuItems`, and
 * links inside a page are followed in place.
 *
 * Its payload is a file path and never a URL. Nothing outside this site can be
 * framed — `X-Frame-Options` sees to that — so a bookmark that leaves the site
 * opens a real tab instead, marked with an arrow so the difference is visible
 * before you click.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import "./Browser.css";
import folderFiles from "virtual:open-folder-files";
import { menuItems } from "virtual:open-folder-config";
import { findFileByPath, findFirstFile, resolvePath } from "../../utils/files";
import { flattenFiles, searchFiles } from "../../utils/search";
import { type Bookmark, bookmarksFromMenu, bookmarksFromTree } from "../../utils/bookmarks";
import { BookmarkBar } from "./BookmarkBar";
import { FileView } from "../../components/FileView";
import { SetiIcon } from "../../components/SetiIcon";
import { Icon } from "../../components/Icon";
import { type AppRenderProps } from "../types";

/** The site the fake omnibox claims to be showing — public/CNAME. */
const ORIGIN = "tomweise.dev";

const icons = {
  back: "M19 12H5M12 19l-7-7 7-7",
  forward: "M5 12h14M12 5l7 7-7 7",
  reload: "M20 11a8 8 0 1 0-.9 4.5M20 5v6h-6",
  star: "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z",
};

/** What the address bar reads for a page. */
function addressOf(path: string | null): string {
  return path ? `${ORIGIN}/${path}` : `${ORIGIN}/`;
}

export function BrowserApp({ arg, maximized, handle }: AppRenderProps) {
  const files = useMemo(() => flattenFiles(folderFiles), []);
  // The tree is a build-time constant, so both halves of the bar are derived
  // once per window rather than on every navigation.
  const treeBookmarks = useMemo(() => bookmarksFromTree(folderFiles), []);
  const menuBookmarks = useMemo(() => bookmarksFromMenu(menuItems, folderFiles), []);
  /** No payload means the home page, the same first file `/` opens. */
  const file = arg ? findFileByPath(folderFiles, arg) : findFirstFile(folderFiles);

  /**
   * This window's own back/forward, kept out of `window.history` on purpose.
   * The real history stack belongs to the whole desktop — a workspace, its
   * strip, every window's payload — so a browser pushing entries of its own
   * would make the real Back button step sometimes one tab and sometimes the
   * entire desktop, in an order nobody could predict. These buttons instead
   * replay this window's trail through `setArg`, which pushes one ordinary
   * desktop entry, so the real Back button keeps working one step at a time.
   */
  const [trail, setTrail] = useState<{ stack: (string | null)[]; at: number }>(() => ({
    stack: [arg],
    at: 0,
  }));
  // A payload that arrived from anywhere else — a bookmark, a link, a restored
  // URL — is a new navigation and truncates whatever was ahead of it. Adjusting
  // state during the render that notices it, rather than in an effect, keeps
  // the trail from lagging a frame behind the page.
  if (trail.stack[trail.at] !== arg) {
    setTrail({ stack: [...trail.stack.slice(0, trail.at + 1), arg], at: trail.at + 1 });
  }

  const [draft, setDraft] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  /** Bumped by the reload button; remounting the view re-renders the page. */
  const [reloads, setReloads] = useState(0);
  const omnibox = useRef<HTMLInputElement>(null);

  const go = useCallback((to: number) => {
    setTrail((t) => {
      const at = Math.min(Math.max(0, to), t.stack.length - 1);
      if (at === t.at) return t;
      handle.setArg(t.stack[at]);
      return { ...t, at };
    });
  }, [handle]);

  const submit = useCallback(() => {
    const typed = (draft ?? "").trim().replace(/^[a-z]+:\/\//i, "").replace(`${ORIGIN}/`, "");
    setDraft(null);
    if (!typed) return;
    // An exact path first, then whatever the site's own search would find, so
    // typing "homelab" lands on projects/Homelab.md the way an omnibox should.
    const target = findFileByPath(folderFiles, typed) ?? searchFiles(files, typed)[0]?.file;
    if (!target) {
      setMissed(true);
      return;
    }
    setMissed(false);
    handle.setArg(target.path);
    omnibox.current?.blur();
  }, [draft, files, handle]);

  const openBookmark = useCallback(
    (bookmark: Bookmark) => {
      // Nothing outside this site can be framed — `X-Frame-Options` sees to
      // that — so a bookmark that leaves the site opens a real tab instead,
      // marked with an arrow so the difference is visible before you click.
      if (bookmark.kind === "link") window.open(bookmark.url, "_blank", "noopener,noreferrer");
      else if (bookmark.kind === "page") handle.setArg(bookmark.path);
    },
    [handle],
  );

  const followLink = useCallback(
    (href: string) => {
      if (!file) return;
      const target = findFileByPath(folderFiles, resolvePath(file.path, href));
      if (target) handle.setArg(target.path);
    },
    [file, handle],
  );

  const resolveFile = useCallback((fromPath: string, href: string) => {
    return findFileByPath(folderFiles, resolvePath(fromPath, href));
  }, []);

  return (
    <div className={`brw-layout${maximized ? "" : " brw-layout--windowed"}`}>
      <div className="brw-tabstrip">
        <div className="brw-tab brw-tab--active">
          {file ? <SetiIcon type={file.type} /> : <span className="brw-tab-blank" />}
          <span className="brw-tab-title">{file?.name ?? "Problem loading page"}</span>
          <button className="brw-tab-close" onClick={handle.close} aria-label="Close tab" title="Close tab">
            <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
            </svg>
          </button>
        </div>
        {/* A maximized window covers the bar, so its own restore button is the
            only way back to the strip. Every app has to carry one. */}
        <div className="brw-winbtns">
          <button
            className="brw-winbtn"
            onClick={handle.toggleFullscreen}
            aria-label={maximized ? "Restore" : "Maximize"}
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M3.5 3.5v-2h7v7h-2" />
                <rect x="1.5" y="3.5" width="7" height="7" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="1.5" y="1.5" width="9" height="9" />
              </svg>
            )}
          </button>
          <button
            className="brw-winbtn brw-winbtn--close"
            onClick={handle.close}
            aria-label="Close"
            title="Close"
          >
            <svg viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="brw-toolbar">
        <button
          className="brw-nav-btn"
          onClick={() => go(trail.at - 1)}
          disabled={trail.at === 0}
          aria-label="Back"
          title="Back"
        >
          <Icon className="brw-icon" path={icons.back} />
        </button>
        <button
          className="brw-nav-btn"
          onClick={() => go(trail.at + 1)}
          disabled={trail.at >= trail.stack.length - 1}
          aria-label="Forward"
          title="Forward"
        >
          <Icon className="brw-icon" path={icons.forward} />
        </button>
        <button
          className="brw-nav-btn"
          onClick={() => setReloads((n) => n + 1)}
          aria-label="Reload"
          title="Reload"
        >
          <Icon className="brw-icon" path={icons.reload} />
        </button>

        <div className={`brw-omnibox${missed ? " brw-omnibox--missed" : ""}`}>
          <input
            ref={omnibox}
            className="brw-omnibox-input"
            value={draft ?? addressOf(file ? file.path : arg)}
            spellCheck={false}
            aria-label="Address"
            onChange={(e) => { setDraft(e.target.value); setMissed(false); }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              else if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
            }}
          />
          <Icon className="brw-icon brw-omnibox-star" path={icons.star} />
        </div>
      </div>

      <BookmarkBar tree={treeBookmarks} menu={menuBookmarks} onOpen={openBookmark} />

      {file ? (
        <div className="brw-page">
          <FileView
            key={`${file.path}#${reloads}`}
            file={file}
            mode="preview"
            onNavigate={followLink}
            resolveFile={resolveFile}
          />
        </div>
      ) : (
        <div className="brw-page brw-error">
          <h1>This site can’t be reached</h1>
          <p><code>{addressOf(arg)}</code> could not be found on this server.</p>
          <p className="brw-error-code">ERR_FILE_NOT_FOUND</p>
        </div>
      )}
    </div>
  );
}
