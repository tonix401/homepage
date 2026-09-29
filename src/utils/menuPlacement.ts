/**
 * Where the launcher's context menu and its submenus go, kept wholly on
 * screen. Pure arithmetic on sizes the caller has measured, so the rules can
 * be tested without a browser.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How close a menu may come to the edge of the screen. */
export const MENU_MARGIN = 8;

/**
 * A menu opened at `at` hangs down and to the right of it, as a context menu
 * does from the pointer. Where that would run past an edge it is moved back
 * inside instead, by exactly as much as it overlapped, so it stays as near
 * the point as the screen allows. A menu larger than the screen keeps its top
 * left corner on it.
 */
export function placeMenu(at: Point, menu: Size, view: Size, margin = MENU_MARGIN): Point {
  return {
    x: fit(at.x, menu.width, view.width, margin),
    y: fit(at.y, menu.height, view.height, margin),
  };
}

/**
 * A submenu opens beside the row that leads to it, its first row level with
 * that one: to the right of the menu, overlapping its border by `overlap`, or
 * to the left if there is no room on the right. Where it fits on neither side
 * it goes wherever keeps the most of it on screen, moved inside like a menu.
 *
 * `parent` is the menu's box and `rowTop` the top of the row the submenu
 * belongs to, both in the viewport; `inset` is how far the submenu's first
 * row sits below its own top edge (past its border, padding and anything
 * above its rows), so the two rows line up.
 */
export function placeSubmenu(
  parent: { left: number; right: number },
  rowTop: number,
  inset: number,
  menu: Size,
  view: Size,
  margin = MENU_MARGIN,
  overlap = 4,
): Point {
  const right = parent.right - overlap;
  const left = parent.left + overlap - menu.width;
  let x: number;
  if (right + menu.width <= view.width - margin) x = right;
  else if (left >= margin) x = left;
  else x = fit(right, menu.width, view.width, margin);
  return { x, y: fit(rowTop - inset, menu.height, view.height, margin) };
}

/** `start` moved as little as it takes for `length` from it to fit in `[margin, total - margin]`. */
function fit(start: number, length: number, total: number, margin: number): number {
  return Math.max(margin, Math.min(start, total - margin - length));
}
