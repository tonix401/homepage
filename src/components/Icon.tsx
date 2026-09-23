import "./Icon.css";

/**
 * A 24x24 Feather-style stroke icon drawn from a single path. No Nerd Font is
 * loaded, so every glyph on the desktop chrome is inlined this way.
 *
 * Shared by the Waybar, the launcher and the app registry, which is why the
 * geometry lives here and the size lives on the caller's class.
 */
export function Icon({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg className={`ui-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
