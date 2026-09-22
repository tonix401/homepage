import { describe, it, expect } from "vitest";
import { cpuLoad, formatBytes } from "./systemStats";

describe("cpuLoad", () => {
  const idle = new Array(10).fill(0);

  it("reads zero when every timer fires on time", () => {
    expect(cpuLoad(idle)).toBe(0);
  });

  it("reports the share of the window the event loop was blocked for", () => {
    // 10 samples, each 40 ms late: 400 ms of a 1000 ms window.
    expect(cpuLoad(new Array(10).fill(40))).toBeCloseTo(0.4);
    // One long task, nothing else.
    expect(cpuLoad([0, 0, 250, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0.25);
  });

  it("clamps a window that overran to 1", () => {
    expect(cpuLoad(new Array(10).fill(500))).toBe(1);
  });

  it("reads zero for an empty window rather than NaN", () => {
    expect(cpuLoad([])).toBe(0);
  });

  it("scales against the window it is given", () => {
    expect(cpuLoad([100], 200)).toBeCloseTo(0.5);
  });
});

describe("formatBytes", () => {
  it("uses whole megabytes below a gigabyte", () => {
    expect(formatBytes(48_000_000)).toBe("48MB");
    expect(formatBytes(999_000_000)).toBe("999MB");
  });

  it("switches to one decimal of gigabytes at and above 1e9", () => {
    expect(formatBytes(1_000_000_000)).toBe("1.0GB");
    expect(formatBytes(2_160_000_000)).toBe("2.2GB");
  });
});
