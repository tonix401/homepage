/**
 * The bookmarks bar, with dropdowns.
 *
 * The open folder's own shape is the left-hand half — root files sit on the bar
 * and folders are dropdowns listing what is inside them, nested as deeply as
 * the folder is — and the configured `menuItems` keep the right-hand end.
 * `bookmarksFromTree` and `bookmarksFromMenu` do the deriving; this file is
 * only the chrome around it.
 *
 * **The menus are portalled to `document.body`** rather than drawn inside the
 * bar. `.brw-bookmarks` is `overflow: hidden`, so a menu rendered in place
 * would be clipped to a 30px strip, and `position: fixed` alone does not save
 * it: `.arch-column`'s open animation uses a `transform`, which makes the
 * column a containing block for fixed children while it runs. A portal is out
 * of reach of both, which is what lets the bar keep clipping its own row.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SetiIcon } from "../../components/SetiIcon";
import { Icon } from "../../components/Icon";
import { type Bookmark } from "../../utils/bookmarks";

const icons = {
  folder: "M3 7a1 1 0 0 1 1-1h4.6l1.7 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  caret: "M6 9l6 6 6-6",
  chevron: "M9 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

/** Which dropdown is open, and the trigger it hangs off. */
interface Opened {
  path: string;
  rect: DOMRect;
}

interface BookmarkBarProps {
  /** The open folder, as bookmarks. */
  tree: Bookmark[];
  /** The configured menu items, as bookmarks. */
  menu: Bookmark[];
  /** Never called with a folder — those are dropdowns, not destinations. */
  onOpen: (bookmark: Bookmark) => void;
}

export function BookmarkBar({ tree, menu, onOpen }: BookmarkBarProps) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!opened) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpened(null);
    };
    // Capture, so a press closes the menu before whatever is underneath acts
    // on it. The triggers live in the bar and the menus are portalled out of
    // it, so both have to be excused by hand.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (bar.current?.contains(target ?? null)) return;
      if (target?.closest?.(".brw-menu")) return;
      setOpened(null);
    };
    // A stored rect is only true where it was measured, so anything that moves
    // the trigger closes rather than leaving a menu stranded beside nothing.
    const onMoved = () => setOpened(null);

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onMoved);
    window.addEventListener("scroll", onMoved, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onMoved);
      window.removeEventListener("scroll", onMoved, true);
    };
  }, [opened]);

  const choose = (bookmark: Bookmark) => {
    setOpened(null);
    onOpen(bookmark);
  };

  const renderRow = (bookmark: Bookmark, key: string) => {
    if (bookmark.kind !== "folder") {
      return <BarButton key={key} bookmark={bookmark} onClick={() => choose(bookmark)} />;
    }
    const isOpen = opened?.path === bookmark.path;
    return (
      <div className="brw-bookmark-folder" key={key}>
        <button
          className={`brw-bookmark${isOpen ? " brw-bookmark--open" : ""}`}
          aria-expanded={isOpen}
          title={bookmark.label}
          onClick={(event) =>
            setOpened(
              isOpen ? null : { path: bookmark.path, rect: rectOf(event.currentTarget) },
            )
          }
          // Once one dropdown is open the bar behaves like a menu bar: moving
          // along it switches. With none open, hovering does nothing.
          onMouseEnter={(event) => {
            if (opened && !isOpen) {
              setOpened({ path: bookmark.path, rect: rectOf(event.currentTarget) });
            }
          }}
        >
          <Icon className="brw-icon brw-bookmark-glyph" path={icons.folder} />
          {bookmark.label}
          <Icon className="brw-icon brw-bookmark-caret" path={icons.caret} />
        </button>
        {isOpen && (
          <BookmarkMenu
            items={bookmark.children}
            rect={opened.rect}
            placement="below"
            onChoose={choose}
          />
        )}
      </div>
    );
  };

  return (
    <div className="brw-bookmarks" ref={bar}>
      {tree.map((bookmark, i) => renderRow(bookmark, `tree-${i}`))}
      {tree.length > 0 && menu.length > 0 && <span className="brw-bookmark-sep" />}
      {menu.map((bookmark, i) => renderRow(bookmark, `menu-${i}`))}
    </div>
  );
}

function BarButton({ bookmark, onClick }: { bookmark: Bookmark; onClick: () => void }) {
  if (bookmark.kind === "folder") return null;
  return (
    <button
      className="brw-bookmark"
      onClick={onClick}
      title={bookmark.kind === "link" ? bookmark.url : (bookmark.path ?? "")}
    >
      {bookmark.kind === "page" ? (
        <SetiIcon type={bookmark.type} size={14} />
      ) : (
        <Icon className="brw-icon brw-bookmark-glyph" path={icons.external} />
      )}
      {bookmark.label}
    </button>
  );
}

interface BookmarkMenuProps {
  items: Bookmark[];
  /** The trigger this menu hangs off, in viewport coordinates. */
  rect: DOMRect;
  /** `below` for a bar trigger, `right` for a submenu flying out of an item. */
  placement: "below" | "right";
  onChoose: (bookmark: Bookmark) => void;
}

function BookmarkMenu({ items, rect, placement, onChoose }: BookmarkMenuProps) {
  const menu = useRef<HTMLUListElement>(null);
  const [sub, setSub] = useState<Opened | null>(null);
  // Measured rather than guessed: the menu is as wide as its longest label, so
  // whether it runs off the edge is not known until it is laid out.
  const [shift, setShift] = useState<{ left: number; top: number } | null>(null);

  const wanted =
    placement === "below"
      ? { left: rect.left, top: rect.bottom + 2 }
      : { left: rect.right - 4, top: rect.top - 4 };

  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left =
      wanted.left + width > window.innerWidth - 8
        ? Math.max(8, (placement === "below" ? rect.right : rect.left) - width)
        : wanted.left;
    const top = Math.max(8, Math.min(wanted.top, window.innerHeight - height - 8));
    setShift({ left, top });
    // `rect` is a fresh object per open, so this runs once per opening.
  }, [rect, placement, wanted.left, wanted.top]);

  return createPortal(
    <ul
      ref={menu}
      className="brw-menu"
      style={{ left: shift?.left ?? wanted.left, top: shift?.top ?? wanted.top }}
    >
      {items.length === 0 && <li className="brw-menu-empty">Empty</li>}
      {items.map((item, i) => {
        if (item.kind !== "folder") {
          return (
            <li key={i}>
              <button
                className="brw-menu-item"
                onClick={() => onChoose(item)}
                // A sibling flyout is still open if the pointer came from one.
                onMouseEnter={() => setSub(null)}
                title={item.kind === "link" ? item.url : (item.path ?? "")}
              >
                {item.kind === "page" ? (
                  <SetiIcon type={item.type} size={14} />
                ) : (
                  <Icon className="brw-icon brw-bookmark-glyph" path={icons.external} />
                )}
                <span className="brw-menu-label">{item.label}</span>
              </button>
            </li>
          );
        }
        const isOpen = sub?.path === item.path;
        return (
          <li key={i}>
            <button
              className={`brw-menu-item${isOpen ? " brw-menu-item--open" : ""}`}
              aria-expanded={isOpen}
              onMouseEnter={(event) =>
                setSub({ path: item.path, rect: rectOf(event.currentTarget) })
              }
              onClick={(event) =>
                setSub(isOpen ? null : { path: item.path, rect: rectOf(event.currentTarget) })
              }
            >
              <Icon className="brw-icon brw-bookmark-glyph" path={icons.folder} />
              <span className="brw-menu-label">{item.label}</span>
              <Icon className="brw-icon brw-menu-chevron" path={icons.chevron} />
            </button>
            {isOpen && (
              <BookmarkMenu
                items={item.children}
                rect={sub.rect}
                placement="right"
                onChoose={onChoose}
              />
            )}
          </li>
        );
      })}
    </ul>,
    document.body,
  );
}

/** Where a trigger is, at the moment it was pressed or hovered. */
function rectOf(element: Element): DOMRect {
  return element.getBoundingClientRect();
}
