import { describe, it, expect } from "vitest";
import { segmentOutline } from "./snake";

describe("segmentOutline", () => {
  // A 16px tail from 100 to 116, the button to 300, a 16px tip to 316.
  const tail = { left: 100, right: 116 };
  const body = { left: 116, right: 300 };
  const tip = { left: 300, right: 316 };

  it("runs round the tip's point and the tail's notch, clockwise from the top's middle", () => {
    expect(segmentOutline(tail, body, tip, 30)).toBe(
      "M 108 0 H 200 L 216 15 L 200 30 H 0 L 16 15 L 0 0 Z",
    );
  });

  it("closes flat when there is no separator either side", () => {
    const flat = segmentOutline({ left: 116, right: 116 }, body, { left: 300, right: 300 }, 30);
    expect(flat).toBe("M 92 0 H 184 L 184 15 L 184 30 H 0 L 0 15 L 0 0 Z");
  });
});
