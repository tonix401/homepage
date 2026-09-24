/**
 * The desktop's colour theme: which of the five palettes in `palettes.ts` is
 * on, remembering the choice, and putting it on screen.
 *
 * A theme is applied as custom properties on `<html>` — `--theme-primary` and
 * so on — rather than on `.arch-desktop` or `.waybar`. Everything that needs
 * the palette can then reach it: the bar, the launcher in the top layer, and a
 * maximized window, which renders outside the desktop altogether.
 *
 * Unlike the window layout, which lives in `sessionStorage` and ends with the
 * visit (see `session.ts`), the theme is a preference, so it goes in
 * `localStorage` (`preferences.ts`) and a new visit comes back to it.
 */

import { PALETTES } from "./palettes";
import { readPreference, writePreference } from "./preferences";

export type ThemeId = (typeof PALETTES)[number]["id"];
export type ThemeTokens = (typeof PALETTES)[number]["tokens"];

export const THEME_IDS: readonly ThemeId[] = PALETTES.map((p) => p.id);
export const DEFAULT_THEME: ThemeId = "blue";
export const THEME_KEY = "homepage.theme.v1";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function themeName(theme: ThemeId): string {
  return PALETTES.find((p) => p.id === theme)!.name;
}

export function themeTokens(theme: ThemeId): ThemeTokens {
  return PALETTES.find((p) => p.id === theme)!.tokens;
}

/** `surfaceLowest` -> `--theme-surface-lowest`. */
function cssName(token: string): string {
  return `--theme-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Every token as the custom property it is applied under. */
export function themeVariables(theme: ThemeId): Record<string, string> {
  return Object.fromEntries(
    Object.entries(themeTokens(theme)).map(([token, value]) => [cssName(token), value]),
  );
}

/** How long a theme change takes; the wallpaper's reveal in ArchDesktop.css matches it. */
export const THEME_TRANSITION = "0.8s ease";

/**
 * Registers every token as a `<color>`, which is what lets a theme change fade.
 *
 * An ordinary custom property is a string, so a change to one can only switch,
 * never interpolate. A registered one is a real colour, so a transition on
 * `<html>` animates it there — and since every border, pill and glyph reads
 * the palette through `var()`, all of them fade with it, with no transition
 * rule of their own.
 */
export function registerThemeProperties(): void {
  if (typeof CSS === "undefined" || !("registerProperty" in CSS)) return;
  for (const [name, initialValue] of Object.entries(themeVariables(DEFAULT_THEME))) {
    try {
      CSS.registerProperty({ name, syntax: "<color>", inherits: true, initialValue });
    } catch {
      // Already registered — a hot reload runs this module again.
    }
  }
}

/**
 * Turns the fade on. Kept apart from `applyTheme` because the first theme of a
 * visit must not animate in from the registered defaults, and because reduced
 * motion wants the change without the fade.
 */
export function animateThemeChanges(root: HTMLElement = document.documentElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.style.transition = Object.keys(themeVariables(DEFAULT_THEME))
    .map((name) => `${name} ${THEME_TRANSITION}`)
    .join(", ");
}

export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    root.style.setProperty(name, value);
  }
}

/** The theme this browser last chose, or the default. */
export function loadTheme(store?: Storage | null): ThemeId {
  return readPreference(THEME_KEY, isThemeId, DEFAULT_THEME, store);
}

export function saveTheme(theme: ThemeId, store?: Storage | null): void {
  writePreference(THEME_KEY, theme, store);
}
