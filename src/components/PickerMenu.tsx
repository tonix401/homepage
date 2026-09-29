/**
 * A launcher submenu for picking one of a few things — the colour theme, or
 * what the wallpaper shows. It opens beside the row that leads to it, as a
 * context menu's submenu does, and each choice can carry a small picture of
 * itself at the end of its row: a theme its colours, a wallpaper its subject.
 *
 * Moving the highlight changes nothing; the desktop is left alone until
 * something is actually picked.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { placeSubmenu, type Point } from "../utils/menuPlacement";

/** Where a submenu hangs from: the menu's sides, and the top of its row. */
export interface SubmenuAnchor {
  left: number;
  right: number;
  rowTop: number;
}

interface PickerMenuProps<T extends string> {
  /** What the list is called, for screen readers — "Themes", "Wallpapers". */
  label: string;
  items: readonly { id: T; name: string }[];
  /** The one that is on now, which the highlight starts on. */
  current: T;
  /** What a choice shows at the end of its row, if anything. */
  aside?: (id: T) => ReactNode;
  anchor: SubmenuAnchor;
  /** Take the keys: it was opened from the keyboard rather than by hovering. */
  autoFocus: boolean;
  onPick: (id: T) => void;
  /** Esc or ←: back to the menu, not out of the launcher. */
  onBack: () => void;
}

export function PickerMenu<T extends string>({
  label,
  items,
  current,
  aside,
  anchor,
  autoFocus,
  onPick,
  onBack,
}: PickerMenuProps<T>) {
  // Starts on the one that is on, so Enter straight away changes nothing.
  const [active, setActive] = useState(() =>
    Math.max(0, items.findIndex((item) => item.id === current)),
  );
  const [place, setPlace] = useState<Point>({ x: anchor.right, y: anchor.rowTop });
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const highlighted = items[active].id;

  // Beside its row and inside the screen before the first paint. The inset
  // is how far the first choice sits below the submenu's top edge, so that
  // choice is what lines up with the row that opened it.
  useLayoutEffect(() => {
    const el = panel.current;
    const first = list.current?.firstElementChild;
    if (!el || !first) return;
    setPlace(
      placeSubmenu(
        anchor,
        anchor.rowTop,
        first.getBoundingClientRect().top - el.getBoundingClientRect().top,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor]);

  useEffect(() => {
    if (autoFocus) list.current?.focus();
  }, [autoFocus]);

  return (
    <div
      ref={panel}
      className="arch-menu arch-picker"
      style={{ left: place.x, top: place.y }}
    >
      <ul
        ref={list}
        className="arch-picker-list"
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={`arch-picker-${highlighted}`}
        onKeyDown={(event) => {
          const last = items.length - 1;
          if (event.key === "ArrowDown") {
            setActive(active === last ? 0 : active + 1);
          } else if (event.key === "ArrowUp") {
            setActive(active === 0 ? last : active - 1);
          } else if (event.key === "Home") {
            setActive(0);
          } else if (event.key === "End") {
            setActive(last);
          } else if (event.key === "Enter" || event.key === " ") {
            onPick(highlighted);
          } else if (event.key === "Escape" || event.key === "ArrowLeft") {
            // Stops the dialog's own Escape, which would close the launcher.
            onBack();
          } else {
            return;
          }
          event.preventDefault();
        }}
      >
        {items.map(({ id, name }, i) => (
          <li
            key={id}
            id={`arch-picker-${id}`}
            role="option"
            aria-selected={i === active}
            className={
              "arch-picker-item" +
              (i === active ? " arch-picker-item--active" : "") +
              (id === current ? " arch-picker-item--current" : "")
            }
            onMouseMove={() => setActive(i)}
            onClick={() => onPick(id)}
          >
            <span className="arch-picker-name">{name.toLowerCase()}</span>
            {aside && (
              <span className="arch-picker-aside" aria-hidden="true">
                {aside(id)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
