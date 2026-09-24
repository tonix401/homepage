/**
 * A launcher submenu for picking one of a few things — the colour theme, or
 * what the wallpaper shows — laid out the way a rofi wallpaper menu is: a
 * preview on the left, the choices on the right.
 *
 * Moving the highlight only changes the preview, the wallpaper as it would be
 * with that choice, zoomed in on its subject; browsing the list leaves the
 * desktop alone until something is actually picked.
 */

import { useEffect, useRef, useState } from "react";

interface PickerMenuProps<T extends string> {
  /** What the list is called, for screen readers — "Themes", "Wallpapers". */
  label: string;
  items: readonly { id: T; name: string }[];
  /** The one that is on now, which the highlight starts on. */
  current: T;
  /** The wallpaper image for a choice. */
  preview: (id: T) => string;
  onPick: (id: T) => void;
  /** Esc or ←: back to the app list, not out of the launcher. */
  onBack: () => void;
}

export function PickerMenu<T extends string>({
  label,
  items,
  current,
  preview,
  onPick,
  onBack,
}: PickerMenuProps<T>) {
  // Starts on the one that is on, so Enter straight away changes nothing.
  const [active, setActive] = useState(() =>
    Math.max(0, items.findIndex((item) => item.id === current)),
  );
  const list = useRef<HTMLUListElement>(null);
  const highlighted = items[active].id;

  // The search box the keys went to is gone, so the list takes them instead.
  useEffect(() => list.current?.focus(), []);

  return (
    <div className="arch-picker">
      <div className="arch-picker-preview">
        <img src={preview(highlighted)} alt="" draggable={false} />
      </div>
      <ul
        ref={list}
        className="arch-picker-list"
        role="listbox"
        aria-label={label}
        tabIndex={0}
        aria-activedescendant={`arch-picker-${highlighted}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            setActive(Math.min(active + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            setActive(Math.max(active - 1, 0));
          } else if (event.key === "Enter") {
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
            {name.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}
