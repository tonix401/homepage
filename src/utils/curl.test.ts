import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import { meterBytes, meterLine, meterTime, parseCurl, remoteFileName } from "./curl";

const text = (lines: { text: string }[][]) => lines.map((l) => l.map((s) => s.text).join(""));

function file(path: string, added = false): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content: "", ...(added && { added }) };
}

const tree: TreeNode[] = [
  file("README.md"),
  file("cat.png", true),
  { kind: "folder", name: "projects", children: [file("projects/Homelab.md")] },
];

const URL_ = "https://example.com/pics/cat.png";
/** Where `curl <args>` typed in `cwd` saves, or the first line it fails with. */
function target(args: string[], cwd = "") {
  const parsed = parseCurl(tree, cwd, args);
  return "path" in parsed ? parsed.path : "error" in parsed ? text(parsed.error)[0] : "help";
}

describe("where curl saves", () => {
  it("uses the URL's own name in the working folder", () => {
    expect(target([URL_])).toBe("cat.png");
    expect(target([URL_], "projects")).toBe("projects/cat.png");
  });

  it("takes a name, in the working folder or in a folder", () => {
    expect(target([URL_, "kitten.png"])).toBe("kitten.png");
    expect(target([URL_, "projects/kitten.png"])).toBe("projects/kitten.png");
    expect(target([URL_, "../kitten.png"], "projects")).toBe("kitten.png");
  });

  it("puts it in a folder under its own name, given the folder", () => {
    expect(target([URL_, "projects/"])).toBe("projects/cat.png");
    expect(target([URL_, "projects"])).toBe("projects/cat.png");
    expect(target([URL_, "~"], "projects")).toBe("cat.png");
    expect(target([URL_, "."], "projects")).toBe("projects/cat.png");
  });

  it("checks the folder exists, and that nothing of the site's is in the way", () => {
    expect(target([URL_, "nope/"])).toBe("curl: (23) Failed to open the file '~/nope/cat.png': No such file or directory");
    expect(target([URL_, "nope/x.png"])).toBe("curl: (23) Failed to open the file '~/nope/x.png': No such file or directory");
    expect(target([URL_, "README.md"])).toBe("curl: (23) Failed to open the file '~/README.md': Permission denied");
  });

  it("replaces a file that was added before", () => {
    expect(target([URL_, "cat.png"])).toBe("cat.png");
  });
});

describe("parseCurl", () => {
  it("gives a URL without a scheme https://", () => {
    const parsed = parseCurl(tree, "", ["example.com/x.png"]);
    expect("url" in parsed && parsed.url.href).toBe("https://example.com/x.png");
  });

  it("takes a dropped file's blob URL, under the name given", () => {
    expect(target(["blob:http://localhost:8080/0b1c", "red.png"], "projects")).toBe("projects/red.png");
  });

  it("fails as curl does", () => {
    expect(target([])).toBe("curl: no URL specified");
    expect(target(["-O", URL_])).toBe("curl: option -O: is unknown");
    expect(target([URL_, "a", "b"])).toBe("curl: too many arguments");
    expect(target(["ftp://example.com/a"])).toBe('curl: (1) Protocol "ftp" not supported');
    expect(target(["http://exa mple.com"])).toBe("curl: (3) URL rejected: Malformed input to a URL function");
  });

  it("answers --help with its usage", () => {
    expect(target(["--help"])).toBe("help");
  });
});

describe("remoteFileName", () => {
  it("is the path's last part, decoded, or curl's fallback for none", () => {
    expect(remoteFileName(new URL("https://x.org/a/my%20cat.png?v=1"))).toBe("my cat.png");
    expect(remoteFileName(new URL("https://x.org/a%2Fb.png"))).toBe("a_b.png");
    expect(remoteFileName(new URL("https://x.org/"))).toBe("curl_response");
  });
});

describe("the progress meter", () => {
  it("squeezes sizes into six columns as curl 8.23 does", () => {
    expect(meterBytes(99999)).toBe(" 99999");
    expect(meterBytes(500000)).toBe("488.2k");
    expect(meterBytes(1000000)).toBe("976.5k");
    expect(meterBytes(2000000)).toBe(" 1.90M");
    expect(meterBytes(30000000)).toBe("28.60M");
  });

  it("writes times as MM:SS, or blanks", () => {
    expect(meterTime(61)).toBe("  01:01");
    expect(meterTime(3725)).toBe("1:02:05");
    expect(meterTime(null)).toBe("       ");
  });

  it("lines up under curl's header", () => {
    expect(text([meterLine(0, null, 0, 0)])[0]).toBe(
      "  0      0   0      0   0      0      0      0                              0",
    );
    expect(text([meterLine(30000000, 30000000, 2, 18700000)])[0]).toBe(
      "100 28.60M 100 28.60M   0      0 14.30M      0   00:02   00:02         17.83M",
    );
  });
});
