import { describe, it, expect } from "vitest";
import { engineFromUserAgent, formatUptime, gpuName, osFromUserAgent, refreshRate } from "./browserInfo";

const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const EDGE_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("osFromUserAgent", () => {
  it("names the common systems", () => {
    expect(osFromUserAgent(CHROME_LINUX)).toBe("Linux");
    expect(osFromUserAgent(FIREFOX_WIN)).toBe("Windows 10/11");
    expect(osFromUserAgent(SAFARI_MAC)).toBe("macOS 10.15");
    expect(osFromUserAgent(ANDROID)).toBe("Android 15");
    expect(osFromUserAgent(IPHONE)).toBe("iOS 18.1");
  });

  it("checks Android before Linux, whose name it also carries", () => {
    expect(osFromUserAgent(ANDROID)).not.toBe("Linux");
  });
});

describe("engineFromUserAgent", () => {
  it("names the engine and the browser on it", () => {
    expect(engineFromUserAgent(CHROME_LINUX)).toBe("Blink (Chromium 140)");
    expect(engineFromUserAgent(EDGE_WIN)).toBe("Blink (Edge 140)");
    expect(engineFromUserAgent(FIREFOX_WIN)).toBe("Gecko (Firefox 142.0)");
    expect(engineFromUserAgent(SAFARI_MAC)).toBe("WebKit (Safari 18.1)");
  });
});

describe("gpuName", () => {
  it("unwraps ANGLE's renderer string to the GPU's name", () => {
    expect(
      gpuName("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
    ).toBe("NVIDIA GeForce RTX 3060");
    // Commas inside the driver's parentheses are not ANGLE's separators.
    expect(gpuName("ANGLE (AMD, AMD Radeon RX 6700 XT (radeonsi, navi22, LLVM 18.1.8), OpenGL 4.6)")).toBe(
      "AMD Radeon RX 6700 XT",
    );
  });

  it("passes a plain or deliberately vague renderer through", () => {
    expect(gpuName("Apple GPU")).toBe("Apple GPU");
    expect(gpuName("Mesa Intel(R) UHD Graphics 630 (CFL GT2)")).toBe("Mesa Intel(R) UHD Graphics 630 (CFL GT2)");
  });

  it("drops the bus and instruction-set suffix NVIDIA's OpenGL name carries, wrapped or not", () => {
    expect(gpuName("NVIDIA GeForce RTX 2060/PCIe/SSE2")).toBe("NVIDIA GeForce RTX 2060");
    // What Chromium on Linux reports for it, word for word.
    expect(gpuName("ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL ES 3.2)")).toBe(
      "NVIDIA GeForce RTX 2060",
    );
  });
});

describe("refreshRate", () => {
  it("snaps a measured rate to the display rate it is near", () => {
    expect(refreshRate(Array(20).fill(16.8))).toBe(60);
    expect(refreshRate(Array(20).fill(6.95))).toBe(144);
  });

  it("uses the median, so dropped frames do not count", () => {
    expect(refreshRate([16.7, 16.6, 33.4, 16.7, 50, 16.7, 16.6])).toBe(60);
  });

  it("rounds a rate that matches no common one, and is null with nothing measured", () => {
    expect(refreshRate(Array(9).fill(1000 / 83))).toBe(83);
    expect(refreshRate([])).toBeNull();
  });
});

describe("formatUptime", () => {
  it("counts the way fastfetch does", () => {
    expect(formatUptime(12_000)).toBe("12 secs");
    expect(formatUptime(61_000)).toBe("1 min");
    expect(formatUptime((2 * 3600 + 5 * 60) * 1000)).toBe("2 hours, 5 mins");
    expect(formatUptime((86400 + 3600) * 1000)).toBe("1 day, 1 hour");
  });
});
