import { describe, it, expect } from "vitest";
import { type FileNode, type FileType, type TreeNode } from "../services/types";
import {
  MIN_CLIP,
  WPM,
  buildTimeline,
  clipAt,
  formatTimecode,
  readingSeconds,
  rulerStep,
  timeOf,
} from "./timeline";

function file(path: string, content = "", type: FileType = "md"): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type, content };
}

/** `n` words, which read in `n / WPM` minutes. */
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const tree: TreeNode[] = [
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/a.md", words(WPM)), // 60 s
      { kind: "folder", name: "demos", children: [file("projects/demos/b.md", words(WPM / 2))] }, // 30 s
      file("projects/c.md", words(WPM / 2)), // 30 s, after the nested folder
    ],
  },
  { kind: "folder", name: "legal", children: [file("legal/imprint.html", "<p>hi</p>", "html")] },
  file("README.md", words(WPM * 2)), // 120 s
];

describe("readingSeconds", () => {
  it("reads at WPM words a minute", () => {
    expect(readingSeconds(file("a.md", words(WPM * 3)))).toBe(180);
  });

  it("never goes below the minimum clip", () => {
    expect(readingSeconds(file("a.md", ""))).toBe(MIN_CLIP);
    expect(readingSeconds(file("a.md", "two words"))).toBe(MIN_CLIP);
  });

  it("counts words across any whitespace", () => {
    const content = `${words(WPM / 2)}\n\n\t${words(WPM / 2)}  `;
    expect(readingSeconds(file("a.md", content))).toBe(60);
  });

  it("counts a page's text, not its markup, styles or scripts", () => {
    const html = [
      "<style>body { color: red; margin: 0 auto; }</style>",
      `<div class="a b c"><p>${words(WPM)}</p></div>`,
      "<script>const lots = of + code * here;</script>",
    ].join("");
    expect(readingSeconds(file("x.html", html, "html"))).toBe(60);
  });
});

describe("buildTimeline", () => {
  const timeline = buildTimeline(tree, "homepage");

  it("makes a track per folder that holds files, root files on one named after the root", () => {
    expect(timeline.tracks.map((t) => [t.id, t.label])).toEqual([
      ["projects", "projects"],
      ["projects/demos", "projects/demos"],
      ["legal", "legal"],
      ["", "homepage"],
    ]);
  });

  it("keeps a folder's files on its track even when a subfolder comes between them", () => {
    expect(timeline.tracks[0].clips.map((c) => c.file.path)).toEqual(["projects/a.md", "projects/c.md"]);
  });

  it("lays every clip end to end in tree order", () => {
    expect(timeline.clips.map((c) => [c.file.path, c.track, c.start, c.duration])).toEqual([
      ["projects/a.md", "projects", 0, 60],
      ["projects/demos/b.md", "projects/demos", 60, 30],
      ["projects/c.md", "projects", 90, 30],
      ["legal/imprint.html", "legal", 120, MIN_CLIP],
      ["README.md", "", 125, 120],
    ]);
    expect(timeline.total).toBe(245);
  });

  it("is empty for an empty tree", () => {
    expect(buildTimeline([], "root")).toEqual({ tracks: [], clips: [], total: 0 });
  });
});

describe("clipAt / timeOf", () => {
  const timeline = buildTimeline(tree, "homepage");

  it("finds the clip under a time and how far into it", () => {
    const at = clipAt(timeline, 75);
    expect(at?.clip.file.path).toBe("projects/demos/b.md");
    expect(at?.fraction).toBe(0.5);
  });

  it("gives a boundary to the clip that starts there", () => {
    expect(clipAt(timeline, 60)?.clip.file.path).toBe("projects/demos/b.md");
    expect(clipAt(timeline, 60)?.fraction).toBe(0);
  });

  it("clamps to the project", () => {
    expect(clipAt(timeline, -10)).toEqual({ clip: timeline.clips[0], fraction: 0 });
    expect(clipAt(timeline, 1e6)).toEqual({ clip: timeline.clips[4], fraction: 1 });
    expect(clipAt(timeline, timeline.total)?.fraction).toBe(1);
  });

  it("is null with no clips", () => {
    expect(clipAt(buildTimeline([], "root"), 0)).toBeNull();
  });

  it("round-trips", () => {
    for (const t of [0, 12.5, 60, 99, 124, 200]) {
      const at = clipAt(timeline, t)!;
      expect(timeOf(timeline, at.clip.file.path, at.fraction)).toBeCloseTo(t);
    }
  });

  it("clamps the fraction, and knows no file outside the tree", () => {
    expect(timeOf(timeline, "README.md", 2)).toBe(245);
    expect(timeOf(timeline, "README.md", -1)).toBe(125);
    expect(timeOf(timeline, "gone.md", 0.5)).toBeNull();
  });
});

describe("formatTimecode", () => {
  it("writes hours, minutes, seconds and frames", () => {
    expect(formatTimecode(0)).toBe("00:00:00:00");
    expect(formatTimecode(3600 + 4 * 60 + 43 + 14 / 25)).toBe("01:04:43:14");
  });

  it("rounds down to the frame, but not below one it sits on", () => {
    expect(formatTimecode(1 / 25 - 0.001)).toBe("00:00:00:00");
    expect(formatTimecode(0.2 * 3)).toBe("00:00:00:15");
    expect(formatTimecode(59.999)).toBe("00:00:59:24");
  });

  it("treats a negative time as zero", () => {
    expect(formatTimecode(-3)).toBe("00:00:00:00");
  });
});

describe("rulerStep", () => {
  it("picks the smallest round step that fits", () => {
    expect(rulerStep(100, 80)).toBe(1);
    expect(rulerStep(10, 80)).toBe(10);
    expect(rulerStep(1, 80)).toBe(120);
    expect(rulerStep(0.2, 90)).toBe(600);
  });

  it("stops at an hour", () => {
    expect(rulerStep(0.0001, 80)).toBe(3600);
  });
});
