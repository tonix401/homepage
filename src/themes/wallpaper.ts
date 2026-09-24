/**
 * The desktop wallpaper: a subject (`subjects.ts` — the Arch logo, Tux, the
 * Hyprland logo) glowing on a dark radial gradient, as the original was drawn
 * in Inkscape, with the three colours that made it blue taken from the theme.
 *
 * It is handed to an `<img>` as a data URL rather than rendered inline. The
 * glow is a blur filter over a screen-sized image; an image is rasterized once,
 * where an inline SVG filter is one more thing the compositor may repaint while
 * the strip scrolls over it. And each `<img>` is a document of its own, so the
 * five thumbnails the picker shows cannot resolve each other's `url(#…)` ids.
 *
 * The glow blurs the subject itself, so it follows the logo colour with no
 * colour of its own to change.
 */

import { type ThemeId, themeTokens } from "./theme";
import { type SubjectId, subjectMarkup } from "./subjects";

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
