/**
 * The application launcher, as a context menu: every app the registry can
 * run, and below them Themes › and Wallpapers ›, each of which opens its
 * picker as a submenu beside it. It opens where it was asked for — at the
 * pointer for a right-click on the desktop, just under the bar's launcher
 * segment for a click on that — and is moved back inside wherever it would
 * run off the screen (`placeMenu`).
 *
 * It is a native `<dialog>` opened with `showModal()`, which is where Escape,
 * the focus trap and the inertness of the desktop behind it come from. The
 * dialog itself is a transparent sheet over the whole screen, with the menus
 * placed on it, so a click anywhere off them lands on the dialog and closes it.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import "./Launcher.css";
import { Icon } from "./Icon";
import { APP_ICONS } from "../apps/icons";
import { LAUNCHABLE } from "../apps/registry";
import { type AppId } from "../apps/ids";
import { PALETTES } from "../themes/palettes";
import { type ThemeId } from "../themes/theme";
import { SUBJECTS, type SubjectId } from "../themes/subjects";
import { wallpaperUrl } from "../themes/wallpaper";
import { placeMenu, type Point } from "../utils/menuPlacement";
import { PickerMenu, type SubmenuAnchor } from "./PickerMenu";

interface LauncherProps {
  /** Where the menu opens, before it is kept on screen; `null` when it is closed. */
  at: Point | null;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  subject: SubjectId;
  onSubjectChange: (subject: SubjectId) => void;
  onLaunch: (app: AppId) => void;
  onClose: () => void;
}

type Submenu = "themes" | "wallpapers";

/** The rows below the apps, each a way into a submenu rather than an app. */
const SUBMENUS: readonly { id: Submenu; name: string; icon: string }[] = [
  {
    id: "themes",
    name: "Themes",
    // A palette.
    icon: "M12 3a9 9 0 1 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11.5h.01",
  },
  {
    id: "wallpapers",
    name: "Wallpapers",
    // A framed picture.
    icon: "M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15.5 9h.01",
  },
];

/** One row of the menu: an app, or the way into a submenu. */
type Entry =
  | { kind: "app"; id: AppId; name: string; icon: string }
  | { kind: "submenu"; id: Submenu; name: string; icon: string };

const ENTRIES: readonly Entry[] = [
  ...LAUNCHABLE.map((app): Entry => ({
    kind: "app",
    id: app.id,
    name: app.name,
    icon: APP_ICONS[app.id],
  })),
  ...SUBMENUS.map((menu): Entry => ({ kind: "submenu", ...menu })),
];

/**
 * Lower case with accents and tone marks taken off, for type-ahead: "j" finds
 * jīzǐ. NFD splits a marked letter into the letter and a combining mark, and
 * the marks are then dropped.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const rowId = (entry: Entry) => `arch-menu-${entry.id}`;

export function Launcher({ at, onClose, ...menu }: LauncherProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = at !== null;

  // `close()` on the way out matters: StrictMode double-invokes the effect,
  // and `showModal()` on an already-open dialog throws.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) el.showModal();
    return () => el.close();
  }, [open]);

  // A context menu belongs to the layout it opened over, so it goes when the
  // window changes shape rather than being left somewhere that no longer fits.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, [open, onClose]);

  return (
    <dialog
      ref={dialog}
      className="arch-launcher"
      aria-label="Applications"
      onCancel={(event) => {
        // Escape: closing is ours to do, so the flag and the dialog agree.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      // A right-click off the menu closes it too, rather than bringing up the
      // browser's menu over the desktop.
      onContextMenu={(event) => {
        if (event.target !== dialog.current) return;
        event.preventDefault();
        onClose();
      }}
    >
      {/* Mounted only while open, and keyed by where, so the highlight and
          any open submenu start fresh each time. */}
      {at && <LauncherMenu key={`${at.x},${at.y}`} at={at} onClose={onClose} {...menu} />}
    </dialog>
  );
}

function LauncherMenu({
  at,
  theme,
  onThemeChange,
  subject,
  onSubjectChange,
  onLaunch,
  onClose,
}: LauncherProps & { at: Point }) {
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Point>(at);
  // Which submenu is open and where it hangs from; `focus` when the keyboard
  // opened it, so the keys go on into it. Hovering opens one without taking
  // the keys away from this menu.
  const [submenu, setSubmenu] = useState<{
    id: Submenu;
    anchor: SubmenuAnchor;
    focus: boolean;
  } | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // Measured once it is laid out and moved inside the screen before the first
  // paint, so it never shows overlapping an edge.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    setPlace(
      placeMenu(
        at,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [at]);

  useEffect(() => list.current?.focus(), []);

  const openSubmenu = (id: Submenu, row: Element | null, focus: boolean) => {
    const menu = list.current;
    if (!menu || !row) return;
    // Hovering the other submenu's row while the keys are in this one: they
    // come back here, rather than being lost with the submenu that closes.
    if (!focus && submenu?.focus) menu.focus();
    const { left, right } = menu.getBoundingClientRect();
    setSubmenu({ id, anchor: { left, right, rowTop: row.getBoundingClientRect().top }, focus });
  };

  const closeSubmenu = () => {
    // The keys come back here if they had gone into it.
    if (submenu?.focus) list.current?.focus();
    setSubmenu(null);
  };

  const choose = (entry: Entry, row: Element | null, focus: boolean) => {
    if (entry.kind === "submenu") {
      openSubmenu(entry.id, row, focus);
      return;
    }
    onLaunch(entry.id);
    onClose();
  };

  const rowOf = (entry: Entry) => document.getElementById(rowId(entry));
  const selected = ENTRIES[active];

  const hover = (i: number, event: MouseEvent<HTMLLIElement>) => {
    setActive(i);
    const entry = ENTRIES[i];
    if (entry.kind === "submenu") {
      if (submenu?.id !== entry.id) openSubmenu(entry.id, event.currentTarget, false);
    } else if (submenu) {
      closeSubmenu();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = ENTRIES.length - 1;
    const move = (to: number) => {
      setActive(to);
      if (submenu) setSubmenu(null);
    };
    if (event.key === "ArrowDown") move(active === last ? 0 : active + 1);
    else if (event.key === "ArrowUp") move(active === 0 ? last : active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else if (event.key === "Enter" || event.key === " ") choose(selected, rowOf(selected), true);
    else if (event.key === "ArrowRight" && selected.kind === "submenu") {
      choose(selected, rowOf(selected), true);
    } else if (event.key.length === 1 && /\p{L}|\p{N}/u.test(event.key)) {
      // Type-ahead, as menus have: the next row whose name starts with it.
      const key = fold(event.key);
      const next = [...ENTRIES.slice(active + 1), ...ENTRIES.slice(0, active + 1)].find((e) =>
        fold(e.name).startsWith(key),
      );
      if (!next) return;
      move(ENTRIES.indexOf(next));
    } else {
      return;
    }
    event.preventDefault();
  };

  const pick =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      apply(value);
      onClose();
    };

  return (
    <>
      <ul
        ref={list}
        className="arch-menu"
        role="menu"
        aria-label="Applications"
        tabIndex={-1}
        aria-activedescendant={rowId(selected)}
        style={{ left: place.x, top: place.y }}
        onKeyDown={onKeyDown}
      >
        {ENTRIES.map((entry, i) => (
          <MenuRow
            key={entry.id}
            entry={entry}
            // Only the first submenu row has the hairline above it.
            separated={entry.kind === "submenu" && ENTRIES[i - 1]?.kind !== "submenu"}
            active={i === active}
            expanded={submenu?.id === entry.id}
            onMouseMove={(event) => hover(i, event)}
            onClick={(event) => choose(entry, event.currentTarget, false)}
          />
        ))}
      </ul>

      {/* Each preview is the wallpaper as that choice would leave it: a theme
          shown with the current subject, a subject in the current theme. */}
      {submenu?.id === "themes" && (
        <PickerMenu
          label="Themes"
          items={PALETTES}
          current={theme}
          preview={(id) => wallpaperUrl(id, subject)}
          anchor={submenu.anchor}
          autoFocus={submenu.focus}
          onPick={pick(onThemeChange)}
          onBack={closeSubmenu}
        />
      )}
      {submenu?.id === "wallpapers" && (
        <PickerMenu
          label="Wallpapers"
          items={SUBJECTS}
          current={subject}
          preview={(id) => wallpaperUrl(theme, id)}
          anchor={submenu.anchor}
          autoFocus={submenu.focus}
          onPick={pick(onSubjectChange)}
          onBack={closeSubmenu}
        />
      )}
    </>
  );
}

function MenuRow({
  entry,
  separated,
  active,
  expanded,
  onMouseMove,
  onClick,
}: {
  entry: Entry;
  separated: boolean;
  active: boolean;
  expanded: boolean;
  onMouseMove: (event: MouseEvent<HTMLLIElement>) => void;
  onClick: (event: MouseEvent<HTMLLIElement>) => void;
}) {
  const submenu = entry.kind === "submenu";
  return (
    <>
      {separated && <li className="arch-menu-separator" role="separator" />}
      <li
        id={rowId(entry)}
        role="menuitem"
        aria-haspopup={submenu ? "menu" : undefined}
        aria-expanded={submenu ? expanded : undefined}
        className={`arch-menu-item${active ? " arch-menu-item--active" : ""}`}
        onMouseMove={onMouseMove}
        onClick={onClick}
      >
        <Icon className="arch-menu-icon" path={entry.icon} />
        <span>{entry.name}</span>
        {submenu && (
          <span className="arch-menu-chevron" aria-hidden="true">
            ›
          </span>
        )}
      </li>
    </>
  );
}
