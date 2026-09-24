/**
 * btop's graphs: a history of readings drawn in braille, two samples to a
 * character across and four dots to a character down, filled up from the
 * bottom — so a text row of width `w` shows `2w` samples at four times the
 * vertical resolution of plain block characters.
 */

/** Braille dot bits, per column, from the top dot to the bottom one. */
const LEFT = [0x01, 0x02, 0x04, 0x40];
const RIGHT = [0x08, 0x10, 0x20, 0x80];
const BLANK = 0x2800;

/**
 * `values` are 0..1, oldest first. The newest reading lands in the rightmost
 * column, as btop scrolls; with fewer readings than columns, the left is
 * blank rather than stretched. Returns `height` lines of `width` characters.
 *
 * Every reading lights at least its bottom dot, zero included, so an idle
 * graph is a line along the floor rather than nothing — which is how btop
 * looks at rest. Only the columns with no reading yet are blank.
 */
export function brailleGraph(values: readonly number[], width: number, height: number): string[] {
  const dots = height * 4;
  const samples = values.slice(-width * 2);
  const padded = [...Array(width * 2 - samples.length).fill(-1), ...samples];
  const level = (v: number) => (v < 0 ? 0 : Math.max(1, Math.round(Math.min(v, 1) * dots)));

  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    let line = "";
    for (let col = 0; col < width; col++) {
      const left = level(padded[col * 2]);
      const right = level(padded[col * 2 + 1]);
      let bits = 0;
      for (let d = 0; d < 4; d++) {
        // How far up from the floor this dot sits, counting from 1.
        const fromBottom = (height - 1 - row) * 4 + (4 - d);
        if (left >= fromBottom) bits |= LEFT[d];
        if (right >= fromBottom) bits |= RIGHT[d];
      }
      line += String.fromCharCode(BLANK + bits);
    }
    lines.push(line);
  }
  return lines;
}
