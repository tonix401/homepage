/**
 * The application launcher, in the middle of the screen the way rofi and wofi
 * put it: a filter box over a list of everything the registry can run.
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

interface LauncherProps {
  open: boolean;
  onLaunch: (app: AppId) => void;
  onClose: () => void;
}

export function Launcher({ open, onLaunch, onClose }: LauncherProps) {
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
      {open && <LauncherPanel onLaunch={onLaunch} onClose={onClose} />}
    </dialog>
  );
}

function LauncherPanel({ onLaunch, onClose }: Omit<LauncherProps, "open">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? LAUNCHABLE.filter((app) => app.name.toLowerCase().includes(needle))
    : LAUNCHABLE;
  // Derived rather than stored, so a shrinking list can never leave the
  // selection pointing past the end.
  const selected = Math.min(active, Math.max(0, matches.length - 1));

  const launch = (app: AppId) => {
    onLaunch(app);
    onClose();
  };

  return (
    <div className="arch-launcher-panel">
      <input
        className="arch-launcher-input"
        autoFocus
        value={query}
        placeholder="Search applications…"
        aria-label="Search applications"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(selected + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(selected - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const app = matches[selected];
            if (app) launch(app.id);
          }
        }}
      />
      <ul className="arch-launcher-list">
        {matches.map((app, i) => (
          <li key={app.id}>
            <button
              className={`arch-launcher-app${i === selected ? " arch-launcher-app--active" : ""}`}
              onMouseMove={() => setActive(i)}
              onClick={() => launch(app.id)}
            >
              <Icon className="arch-launcher-icon" path={APP_ICONS[app.id]} />
              <span>{app.name}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="arch-launcher-empty">No applications</li>
        )}
      </ul>
    </div>
  );
}
