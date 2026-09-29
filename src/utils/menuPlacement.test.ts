import { describe, it, expect } from "vitest";
import { placeMenu, placeSubmenu } from "./menuPlacement";

const view = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };

describe("placeMenu", () => {
  it("hangs down and to the right of the point when it fits", () => {
    expect(placeMenu({ x: 100, y: 50 }, menu, view)).toEqual({ x: 100, y: 50 });
  });

  it("moves back inside by exactly the overlap at the right and bottom edges", () => {
    // 900 + 200 would reach 1100; the last room is 1000 - 8 - 200.
    expect(placeMenu({ x: 900, y: 700 }, menu, view)).toEqual({ x: 792, y: 492 });
  });

  it("keeps a margin at the left and top edges too", () => {
    expect(placeMenu({ x: -20, y: 2 }, menu, view)).toEqual({ x: 8, y: 8 });
  });

  it("keeps the top-left corner on screen when the menu is bigger than it", () => {
    expect(placeMenu({ x: 50, y: 50 }, { width: 2000, height: 2000 }, view)).toEqual({
      x: 8,
      y: 8,
    });
  });
});

describe("placeSubmenu", () => {
  const sub = { width: 220, height: 250 };

  it("opens to the right, overlapping the border, level with its row", () => {
    const parent = { left: 100, right: 300 };
    expect(placeSubmenu(parent, 120, 6, sub, view)).toEqual({ x: 296, y: 114 });
  });

  it("flips to the left when the right has no room", () => {
    const parent = { left: 600, right: 800 };
    // 796 + 220 = 1016 does not fit; 604 - 220 = 384 does.
    expect(placeSubmenu(parent, 120, 6, sub, view)).toEqual({ x: 384, y: 114 });
  });

  it("is moved inside when it fits on neither side", () => {
    const parent = { left: 100, right: 900 };
    expect(placeSubmenu(parent, 120, 6, sub, view)).toEqual({ x: 772, y: 114 });
  });

  it("rises to stay on screen from a row near the bottom", () => {
    const parent = { left: 100, right: 300 };
    expect(placeSubmenu(parent, 700, 6, sub, view)).toEqual({ x: 296, y: 542 });
  });
});
