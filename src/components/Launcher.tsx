/**
 * The application launcher, in the middle of the screen the way rofi and wofi
 * put it: a filter box over a list of everything the registry can run, and
 * below the apps the Themes and Wallpapers entries, each of which opens its
 * picker in the list's place.
 *
 * It is a native `<dialog>` opened with `showModal()`, which is where Escape,
 * the focus trap, the inertness of the desktop behind it, the dimmed backdrop
 * and the centring all come from — none of that is worth hand-rolling.
 */

import { useEffect, useRef, useState } from "react";
import "./Launcher.css";
import { Icon } from "./Icon";
import { APP_ICONS } from "../apps/icons";
import { LAUNCHABLE } from "../apps/registry";
import { type AppId } from "../apps/ids";
import { PALETTES } from "../themes/palettes";
import { type ThemeId } from "../themes/theme";
import { SUBJECTS, type SubjectId } from "../themes/subjects";
import { wallpaperUrl } from "../themes/wallpaper";
import { PickerMenu } from "./PickerMenu";

interface LauncherProps {
  open: boolean;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  subject: SubjectId;
  onSubjectChange: (subject: SubjectId) => void;
  onLaunch: (app: AppId) => void;
  onClose: () => void;
}

type Submenu = "themes" | "wallpapers";

/** The rows below the apps, each a way into a submenu rather than an app. */
const SUBMENUS: readonly { id: Submenu; name: string; icon: string; keywords: string[] }[] = [
  {
    id: "themes",
    name: "Themes",
    // A palette.
    icon: "M12 3a9 9 0 1 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11.5h.01",
    keywords: ["themes", "colors", "colours"],
  },
  {
    id: "wallpapers",
    name: "Wallpapers",
    // A framed picture.
    icon: "M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15.5 9h.01",
    keywords: ["wallpapers", "background", "tux", "penguin", "linux", "hyprland", "arch", "cat"],
  },
];

/**
 * Lower case with accents and tone marks taken off, for matching: "jizi"
 * finds jīzǐ, and so does typing the tone marks. NFD splits a marked letter
 * into the letter and a combining mark, and the marks are then dropped.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** One row of the launcher: an app, or the way into a submenu. */
type Entry = { kind: "app"; id: AppId; name: string } | { kind: "submenu"; id: Submenu };

export function Launcher({
  open,
  theme,
  onThemeChange,
  subject,
  onSubjectChange,
  onLaunch,
  onClose,
}: LauncherProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  // `close()` on the way out matters: StrictMode double-invokes the effect,
  // and `showModal()` on an already-open dialog throws.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) el.showModal();
    return () => el.close();
  }, [open]);

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
    >
      {/* Mounted only while open, so the query and the selection start fresh
          each time rather than being reset by hand. */}
      {open && (
        <LauncherPanel
          theme={theme}
          onThemeChange={onThemeChange}
          subject={subject}
          onSubjectChange={onSubjectChange}
          onLaunch={onLaunch}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

function LauncherPanel({
  theme,
  onThemeChange,
  subject,
  onSubjectChange,
  onLaunch,
  onClose,
}: Omit<LauncherProps, "open">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // A submenu replaces the list in the same panel rather than opening a
  // second dialog, and the query survives the trip there and back.
  const [view, setView] = useState<"apps" | Submenu>("apps");

  const needle = fold(query.trim());
  const entries: Entry[] = [
    ...LAUNCHABLE.filter((app) => fold(app.name).includes(needle)).map(
      (app): Entry => ({ kind: "app", id: app.id, name: app.name }),
    ),
    ...SUBMENUS.filter((menu) => menu.keywords.some((word) => word.includes(needle))).map(
      (menu): Entry => ({ kind: "submenu", id: menu.id }),
    ),
  ];
  // Derived rather than stored, so a shrinking list can never leave the
  // selection pointing past the end.
  const selected = Math.min(active, Math.max(0, entries.length - 1));

  const choose = (entry: Entry) => {
    if (entry.kind === "submenu") {
      setView(entry.id);
      return;
    }
    onLaunch(entry.id);
    onClose();
  };

  const back = () => setView("apps");

  // Each preview is the wallpaper as that choice would leave it: a theme
  // shown with the current subject, a subject in the current theme.
  if (view === "themes") {
    return (
      <div className="arch-launcher-panel">
        <PickerMenu
          label="Themes"
          items={PALETTES}
          current={theme}
          preview={(id) => wallpaperUrl(id, subject)}
          onPick={(picked) => {
            onThemeChange(picked);
            onClose();
          }}
          onBack={back}
        />
      </div>
    );
  }

  if (view === "wallpapers") {
    return (
      <div className="arch-launcher-panel">
        <PickerMenu
          label="Wallpapers"
          items={SUBJECTS}
          current={subject}
          preview={(id) => wallpaperUrl(theme, id)}
          onPick={(picked) => {
            onSubjectChange(picked);
            onClose();
          }}
          onBack={back}
        />
      </div>
    );
  }

  return (
    <div className="arch-launcher-panel">
      <input
        className="arch-launcher-input"
        autoFocus
        value={query}
        placeholder="Search apps…"
        aria-label="Search applications"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(selected + 1, entries.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(selected - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const entry = entries[selected];
            if (entry) choose(entry);
          } else if (event.key === "ArrowRight" && entries[selected]?.kind === "submenu") {
            // → into a submenu, the way a menu opens one — but only on such a
            // row, so the caret still moves through the query everywhere else.
            event.preventDefault();
            choose(entries[selected]);
          }
        }}
      />
      <ul className="arch-launcher-list">
        {entries.map((entry, i) => {
          const menu = entry.kind === "submenu" ? SUBMENUS.find((m) => m.id === entry.id)! : null;
          // Only the first submenu row draws the hairline; the rest sit with it.
          const firstMenu = menu !== null && entries[i - 1]?.kind !== "submenu";
          return (
            <li key={entry.id} className={firstMenu ? "arch-launcher-submenu" : undefined}>
              <button
                className={`arch-launcher-app${i === selected ? " arch-launcher-app--active" : ""}`}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(entry)}
              >
                <Icon
                  className="arch-launcher-icon"
                  path={entry.kind === "app" ? APP_ICONS[entry.id] : menu!.icon}
                />
                <span>{entry.kind === "app" ? entry.name : menu!.name}</span>
                {menu && (
                  <span className="arch-launcher-chevron" aria-hidden="true">›</span>
                )}
              </button>
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="arch-launcher-empty">No applications</li>
        )}
      </ul>
    </div>
  );
}
