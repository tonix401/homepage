import { describe, expect, it } from "vitest";
import { timeAgo } from "./timeAgo";

const now = new Date("2026-09-25T12:00:00Z");
const before = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("timeAgo", () => {
  it("calls anything under a minute now, including a clock that is ahead", () => {
    expect(timeAgo(before(30), now)).toBe("now");
    expect(timeAgo(before(-600), now)).toBe("now");
  });

  it("picks the largest whole unit", () => {
    expect(timeAgo(before(5 * 60), now)).toBe("5 min. ago");
    expect(timeAgo(before(3 * 3600 + 59 * 60), now)).toBe("3 hr. ago");
    expect(timeAgo(before(24 * 3600), now)).toBe("yesterday");
    expect(timeAgo(before(15 * 24 * 3600), now)).toBe("2 wk. ago");
    expect(timeAgo(before(400 * 24 * 3600), now)).toBe("last yr.");
  });
});
