/**
 * The desktop wallpaper: a subject (`subjects.ts` — the Arch logo, Tux, the
 * Hyprland logo) glowing on a dark radial gradient, as the original was drawn
 * in Inkscape, with the three colours that made it blue taken from the theme.
 *
 * It is handed to an `<img>` as a data URL rather than rendered inline. The
 * glow is a blur filter over a screen-sized image; an image is rasterized once,
 * where an inline SVG filter is one more thing the compositor may repaint while
 * the strip scrolls over it. And each `<img>` is a document of its own, so the
 * subject icons the Wallpapers submenu shows cannot resolve each other's
 * `url(#…)` ids.
 *
 * The glow blurs the subject itself, so it follows the logo colour with no
 * colour of its own to change.
 */

import { type ThemeId, themeTokens } from "./theme";
import { SUBJECT_FRAME, type SubjectId, subjectMarkup } from "./subjects";

function svg(subject: SubjectId, logo: string, line: string, inner: string, outer: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="368.09479mm" height="201.22717mm" viewBox="0 0 368.09479 201.22717">
<defs>
<radialGradient id="bg" cx="184.04739" cy="100.61359" fx="184.04739" fy="100.61359" r="183.44739" gradientTransform="matrix(1,0,0,0.54518949,0,45.760117)" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${inner}"/>
<stop offset="1" stop-color="${outer}"/>
</radialGradient>
</defs>
<rect width="366.89478" height="200.02718" x="0.6" y="0.6" fill="url(#bg)"/>
${subjectMarkup(subject, { logo, line })}
</svg>`;
}

/** The wallpaper's markup for a theme and subject. Exported for the tests. */
export function wallpaperSvg(theme: ThemeId, subject: SubjectId): string {
  const { wallLogo, primary, wallInner, wallOuter } = themeTokens(theme);
  return svg(subject, wallLogo, primary, wallInner, wallOuter);
}

const urls = new Map<string, string>();

/** A data URL for the wallpaper, built once per theme and subject. */
export function wallpaperUrl(theme: ThemeId, subject: SubjectId): string {
  const key = `${theme}/${subject}`;
  let url = urls.get(key);
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(wallpaperSvg(theme, subject))}`;
    urls.set(key, url);
  }
  return url;
}

/**
 * A subject on its own, cropped to the box every subject is fitted into, for
 * the launcher's Wallpapers submenu. Filled in the theme's primary as well as
 * lined in it: the logo colour is a deep tone that reads on the wallpaper by
 * its white outline and glow, and at icon size on the menu both are too thin
 * to carry it.
 */
export function subjectIconSvg(theme: ThemeId, subject: SubjectId): string {
  const { primary } = themeTokens(theme);
  const { x, y, width, height } = SUBJECT_FRAME;
  // A little room round the box, for the outline and a hint of the glow.
  const pad = 3;
  const box = [x - width / 2 - pad, y - height / 2 - pad, width + 2 * pad, height + 2 * pad];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}">
${subjectMarkup(subject, { logo: primary, line: primary })}
</svg>`;
}

const iconUrls = new Map<string, string>();

/** A data URL for `subjectIconSvg`, built once per theme and subject. */
export function subjectIconUrl(theme: ThemeId, subject: SubjectId): string {
  const key = `${theme}/${subject}`;
  let url = iconUrls.get(key);
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(subjectIconSvg(theme, subject))}`;
    iconUrls.set(key, url);
  }
  return url;
}
