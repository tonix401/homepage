import { describe, it, expect } from "vitest";
import { type FileNode, type TreeNode } from "../services/types";
import {
  type Line,
  cat,
  cd,
  complete,
  file as fileCommand,
  formatArg,
  formatModified,
  formatSize,
  git,
  gitDistance,
  highlight,
  suggest,
  help,
  ls,
  parseArg,
  promptPath,
  promptTime,
  quote,
  resolvePath,
  tokenize,
  transfers,
} from "./shell";

function file(path: string, content = ""): FileNode {
  return { kind: "file", name: path.split("/").pop()!, path, type: "md", content };
}

const tree: TreeNode[] = [
  file("README.md", "# Hi\nthere\n"),
  {
    kind: "folder",
    name: "work experience",
    children: [file("work experience/eschbach.md"), file("work experience/Edeka.md")],
  },
  {
    kind: "folder",
    name: "projects",
    children: [
      file("projects/Homelab.md"),
      file("projects/Homepage.md"),
      { kind: "folder", name: "demos", children: [file("projects/demos/one.md")] },
    ],
  },
];

/** A line's text, colours dropped. */
const text = (lines: Line[]) => lines.map((l) => l.map((s) => s.text).join(""));

describe("highlight", () => {
  const commands = ["ls", "cd"];

  it("colours a known command blue and an unknown one red, leaving the rest", () => {
    expect(highlight("  ls -a projects", commands)).toEqual([
      { text: "  " },
      { text: "ls", tone: "blue" },
      { text: " -a projects" },
    ]);
    expect(highlight("l", commands)[1]).toEqual({ text: "l", tone: "red" });
    expect(highlight("'cd' x", commands)[1]).toEqual({ text: "'cd'", tone: "blue" });
  });

  it("leaves a blank line alone", () => {
    expect(highlight("  ", commands)).toEqual([{ text: "  " }]);
  });
});

describe("tokenize", () => {
  it("splits on whitespace, collapsing runs", () => {
    expect(tokenize("  ls   -a  projects ")).toEqual(["ls", "-a", "projects"]);
  });

  it("keeps quoted and escaped spaces inside a word", () => {
    expect(tokenize(`cd 'work experience'`)).toEqual(["cd", "work experience"]);
    expect(tokenize(`cd "work experience"`)).toEqual(["cd", "work experience"]);
    expect(tokenize(`cd work\\ experience`)).toEqual(["cd", "work experience"]);
    expect(tokenize(`echo "a \\"b\\""`)).toEqual(["echo", 'a "b"']);
  });

  it("keeps an empty quoted word, and runs an unclosed quote to the end", () => {
    expect(tokenize(`echo '' x`)).toEqual(["echo", "", "x"]);
    expect(tokenize(`echo "a b`)).toEqual(["echo", "a b"]);
  });
});

describe("quote and the window payload", () => {
  it("round-trips through tokenize", () => {
    for (const word of ["plain", "work experience", "it's", 'a "b"', ""]) {
      expect(tokenize(quote(word))).toEqual([word]);
    }
  });

  it("parses what formatArg writes, and null is the prompt", () => {
    const arg = formatArg("jizi", ["work experience/Edeka.md"]);
    expect(parseArg(arg)).toEqual({ program: "jizi", args: ["work experience/Edeka.md"] });
    expect(parseArg("btop")).toEqual({ program: "btop", args: [] });
    expect(parseArg(null)).toBeNull();
    expect(parseArg("  ")).toBeNull();
  });
});

describe("resolvePath", () => {
  it("resolves relative to the working directory", () => {
    expect(resolvePath(tree, "projects", "Homelab.md")).toBe("projects/Homelab.md");
    expect(resolvePath(tree, "projects", "demos/../Homelab.md")).toBe("projects/Homelab.md");
    expect(resolvePath(tree, "projects", ".")).toBe("projects");
  });

  it("treats ~, /home/tom and / as home, and stops .. there", () => {
    expect(resolvePath(tree, "projects", "~")).toBe("");
    expect(resolvePath(tree, "projects", "~/README.md")).toBe("README.md");
    expect(resolvePath(tree, "", "/home/tom/projects")).toBe("projects");
    expect(resolvePath(tree, "projects/demos", "/")).toBe("");
    expect(resolvePath(tree, "projects", "../../..")).toBe("");
  });

  it("is null for a path that is not in the tree", () => {
    expect(resolvePath(tree, "", "nope")).toBeNull();
    expect(resolvePath(tree, "", "README.md/x")).toBeNull();
  });
});

describe("cd", () => {
  it("goes into folders, and home with no argument", () => {
    expect(cd(tree, "", ["projects"])).toEqual({ cwd: "projects" });
    expect(cd(tree, "projects", [])).toEqual({ cwd: "" });
  });

  it("answers as zsh does for a file or nothing", () => {
    expect(cd(tree, "", ["README.md"])).toEqual({ error: [[{ text: "cd: not a directory: README.md" }]] });
    expect(cd(tree, "", ["x"])).toEqual({ error: [[{ text: "cd: no such file or directory: x" }]] });
  });
});

describe("ls", () => {
  const now = new Date(2026, 10, 27, 12, 0);
  const at = (path: string, modified: string, content = ""): FileNode => ({ ...file(path, content), modified });
  const dated: TreeNode[] = [
    at("README.md", new Date(2026, 10, 3, 9, 5).toISOString(), "x".repeat(4700)),
    { ...at("old.html", new Date(2024, 2, 5, 8, 0).toISOString(), "<p>"), type: "html" },
    {
      kind: "folder",
      name: "projects",
      children: [
        at("projects/a.md", new Date(2026, 9, 1, 10, 0).toISOString()),
        at("projects/b.md", new Date(2026, 10, 20, 23, 44).toISOString()),
      ],
    },
  ];

  it("lists the working directory long, as eza does, folders first", () => {
    expect(ls(dated, "", [], now).failed).toBe(false);
    expect(text(ls(dated, "", [], now).lines)).toEqual([
      "Permissions Size User Date Modified Name",
      "drwxrwxrwt     - root 20 Nov 23:44  \uE5FF projects",
      ".rw-r--r--  4.7k root  3 Nov 09:05  \u{F00BA} README.md",
      ".rw-r--r--     3 root  5 Mar  2024  \uF13B old.html",
    ]);
  });

  it("gives the site's own entries to root, its folders sticky, and what was added to tom", () => {
    const added: TreeNode[] = [
      ...dated,
      { kind: "folder", name: "mine", added: true, children: [] },
      { ...at("pic.png", new Date(2026, 10, 27, 11, 0).toISOString()), added: true },
    ];
    const lines = ls(added, "", [], now).lines;
    expect(text(lines).filter((l) => /mine|pic\.png/.test(l))).toEqual([
      "drwxr-xr-x     - tom  -             \uF115 mine",
      ".rw-r--r--     0 tom  27 Nov 11:00  \uF48A pic.png",
    ]);
    // eza paints you yellow, root plain, and the sticky bit magenta.
    expect(lines[1].find((s) => s.text.trim() === "root")?.tone).toBeUndefined();
    expect(lines[1].find((s) => s.text === "t")).toMatchObject({ tone: "magenta", bold: false });
    expect(lines.at(-1)?.find((s) => s.text.trim() === "tom")).toMatchObject({ tone: "yellow", bold: true });
  });

  it("shows only an empty folder open", () => {
    const tree: TreeNode[] = [...dated, { kind: "folder", name: "empty", children: [] }];
    const lines = text(ls(tree, "", [], now).lines);
    expect(lines.some((l) => l.endsWith("  projects"))).toBe(true);
    expect(lines.some((l) => l.endsWith("  empty"))).toBe(true);
  });

  it("colours the columns as eza does", () => {
    const [, folder, readme, old] = ls(dated, "", [], now).lines;
    expect(folder.find((s) => s.text === "projects")).toMatchObject({ tone: "blue", bold: true });
    expect(readme.find((s) => s.text === "README.md")).toMatchObject({ tone: "yellow", underline: true });
    expect(readme.find((s) => s.text.trim() === "4.7k")).toMatchObject({ tone: "green", bold: true });
    expect(old.find((s) => s.text.trim() === "3")).toMatchObject({ tone: "green", bold: false });
    expect(old.find((s) => s.text === "old.html")?.tone).toBeUndefined();
  });

  it("writes sizes and dates as eza does", () => {
    expect([999, 1000, 4650, 29_400, 5_300_000].map(formatSize)).toEqual(["999", "1.0k", "4.7k", "29k", "5.3M"]);
    expect(formatModified(new Date(2026, 0, 9, 7, 3), now)).toBe(" 9 Jan 07:03");
    expect(formatModified(new Date(2025, 11, 31), now)).toBe("31 Dec  2025");
  });

  it("heads each folder when given several, and reports a missing one", () => {
    const result = ls(tree, "", ["projects/demos", "x", "README.md"]);
    expect(result.failed).toBe(true);
    // This tree has no dates, which is a dash.
    expect(text(result.lines)).toEqual([
      "ls: cannot access 'x': No such file or directory",
      "Permissions Size User Date Modified Name",
      ".rw-r--r--    11 root -             \u{F00BA} README.md",
      "",
      "projects/demos:",
      "Permissions Size User Date Modified Name",
      ".rw-r--r--     0 root -             \uF48A one.md",
    ]);
  });
});

describe("cp and mv", () => {
  /** Each planned transfer as `from -> to`, then the errors. */
  const plan = (command: "cp" | "mv", args: string[], cwd = "") => {
    const planned = transfers(command, tree, cwd, args);
    return [...planned.transfers.map((t) => `${t.from} -> ${t.to}`), ...text(planned.errors)];
  };

  it("renames, or puts it into a folder under its own name", () => {
    expect(plan("cp", ["README.md", "notes.md"])).toEqual(["README.md -> notes.md"]);
    expect(plan("mv", ["README.md", "projects"])).toEqual(["README.md -> projects/README.md"]);
    expect(plan("mv", ["README.md", "projects/demos/x.md"])).toEqual(["README.md -> projects/demos/x.md"]);
    expect(plan("cp", ["Homelab.md", ".."], "projects")).toEqual(["projects/Homelab.md -> Homelab.md"]);
  });

  it("takes a folder without -r, and several sources into one", () => {
    expect(plan("cp", ["projects", "copy"])).toEqual(["projects -> copy"]);
    expect(plan("cp", ["-r", "README.md", "projects/Homelab.md", "work experience"])).toEqual([
      "README.md -> work experience/README.md",
      "projects/Homelab.md -> work experience/Homelab.md",
    ]);
  });

  it("fails as coreutils does", () => {
    expect(plan("cp", [])).toEqual(["cp: missing file operand"]);
    expect(plan("mv", ["a"])).toEqual(["mv: missing destination file operand after 'a'"]);
    expect(plan("cp", ["a", "b", "README.md"])).toEqual(["cp: target 'README.md' is not a directory"]);
    expect(plan("cp", ["nope", "x"])).toEqual(["cp: cannot stat 'nope': No such file or directory"]);
    expect(plan("mv", ["README.md", "."])).toEqual(["mv: 'README.md' and './README.md' are the same file"]);
    expect(plan("cp", ["projects", "projects/demos"])).toEqual([
      "cp: cannot copy a directory, 'projects', into itself, 'projects/demos/projects'",
    ]);
    expect(plan("mv", ["projects", "projects/demos/"])).toEqual([
      "mv: cannot move 'projects' to a subdirectory of itself, 'projects/demos/projects'",
    ]);
  });
});

describe("an empty destination", () => {
  it("is not home", () => {
    expect(text(transfers("mv", tree, "", ["README.md", ""]).errors)).toEqual([
      "mv: cannot move 'README.md' to '': No such file or directory",
    ]);
    expect(text(transfers("cp", tree, "", ["README.md", ""]).errors)).toEqual([
      "cp: cannot create regular file '': No such file or directory",
    ]);
  });
});

describe("file", () => {
  const files: TreeNode[] = [
    ...tree,
    { ...file("cat.png"), type: "image", src: "blob:x", size: 2048, added: true },
    { ...file("logo.svg"), type: "image", src: "https://x.org/logo.svg", added: true },
    file("run.sh", "echo hi"),
    file("blob.bin", "?"),
    file("empty.txt"),
  ];

  it("names each kind by its extension, lined up as file lines them up", () => {
    expect(text(fileCommand(files, "", ["README.md", "cat.png", "logo.svg", "run.sh", "blob.bin", "empty.txt", "projects"]).lines)).toEqual([
      "README.md: ASCII text",
      "cat.png:   PNG image data",
      "logo.svg:  SVG Scalable Vector Graphics image",
      "run.sh:    POSIX shell script, ASCII text executable",
      "blob.bin:  data",
      "empty.txt: empty",
      "projects:  directory",
    ]);
  });

  it("leaves the names out with -b, and says so of a missing one without failing", () => {
    expect(text(fileCommand(files, "projects", ["-b", "../README.md"]).lines)).toEqual(["ASCII text"]);
    const missing = fileCommand(files, "", ["nope"]);
    expect(text(missing.lines)).toEqual(["nope: cannot open `nope' (No such file or directory)"]);
    expect(missing.failed).toBe(false);
  });

  it("shows its usage, and fails, with nothing to look at", () => {
    const usage = fileCommand(files, "", []);
    expect(usage.failed).toBe(true);
    expect(text(usage.lines)[0]).toMatch(/^Usage: file /);
  });
});

describe("cat", () => {
  it("prints a file's lines without the trailing newline", () => {
    expect(cat(tree, "", ["README.md"])).toEqual({ lines: [[{ text: "# Hi" }], [{ text: "there" }]], failed: false });
  });

  it("refuses folders and missing files", () => {
    const result = cat(tree, "", ["projects", "x", "~"]);
    expect(result.failed).toBe(true);
    expect(text(result.lines)).toEqual([
      "cat: projects: Is a directory",
      "cat: x: No such file or directory",
      "cat: ~: Is a directory",
    ]);
  });
});

describe("cat on an image", () => {
  it("points at icat instead of printing nothing", () => {
    const image: FileNode = { kind: "file", name: "a.png", path: "a.png", type: "image", content: "", src: "blob:x" };
    const result = cat([image], "", ["a.png"]);
    expect(result.failed).toBe(true);
    expect(text(result.lines)).toEqual(["cat: a.png: binary file, try icat"]);
  });
});

describe("complete", () => {
  const commands = ["cat", "cd", "clear", "ls", "jizi"];

  it("completes the first word to a command", () => {
    expect(complete(tree, "", "ji", commands)).toEqual({ line: "jizi ", options: [] });
    expect(complete(tree, "", "c", commands)).toEqual({ line: "c", options: ["cat", "cd", "clear"] });
    expect(complete(tree, "", "cl", commands)).toEqual({ line: "clear ", options: [] });
  });

  it("completes a path, a folder with a slash and no space after", () => {
    expect(complete(tree, "", "cd pro", commands)).toEqual({ line: "cd projects/", options: [] });
    expect(complete(tree, "", "cat projects/demos/o", commands)).toEqual({
      line: "cat projects/demos/one.md ",
      options: [],
    });
  });

  it("escapes a space, and extends to the common prefix of several", () => {
    expect(complete(tree, "", "cd wo", commands)).toEqual({ line: "cd work\\ experience/", options: [] });
    expect(complete(tree, "projects", "cat H", commands)).toEqual({
      line: "cat Home",
      options: ["Homelab.md", "Homepage.md"],
    });
  });

  it("leaves the line alone when nothing matches", () => {
    expect(complete(tree, "", "cat zz", commands)).toEqual({ line: "cat zz", options: [] });
  });

  it("completes inside quotes without backslashes, closing them on a file", () => {
    expect(complete(tree, "", "cd 'wo", commands)).toEqual({ line: "cd 'work experience/", options: [] });
    expect(complete(tree, "", 'cd "wo', commands)).toEqual({ line: 'cd "work experience/', options: [] });
    expect(complete(tree, "", "cat 'projects/demos/o", commands)).toEqual({
      line: "cat 'projects/demos/one.md' ",
      options: [],
    });
  });
});

describe("suggest", () => {
  const commands = ["cat", "cd", "clear", "ls", "jizi"];

  it("suggests the newest line in the history that continues the input", () => {
    expect(suggest(tree, "", "cd p", ["cd projects", "cd projects/demos", "ls"], commands)).toBe("cd projects/demos");
  });

  it("falls back to the first completion: a command, then a path", () => {
    expect(suggest(tree, "", "c", [], commands)).toBe("cat");
    expect(suggest(tree, "", "cd wo", [], commands)).toBe("cd work\\ experience/");
  });

  it("suggests nothing on an empty line, when nothing matches, or when complete", () => {
    expect(suggest(tree, "", "", ["ls"], commands)).toBeNull();
    expect(suggest(tree, "", "zz", [], commands)).toBeNull();
    expect(suggest(tree, "", "ls", ["ls"], commands)).toBeNull();
  });
});

describe("help, featured commands", () => {
  it("marks them with a star and sets the name in bold", () => {
    const rows = help([
      { name: "ls", summary: "list files", section: "Files" },
      { name: "curl", summary: "download", section: "Files", featured: true },
    ]);
    expect(text(rows).slice(0, 3)).toEqual(["Files:", "* curl  download", "  ls    list files"]);
    expect(rows[1][1]).toMatchObject({ text: "curl", bold: true });
    expect(rows[2][1].bold).toBeFalsy();
  });
});

describe("help", () => {
  it("groups the commands by section, in the sections' order, sorted by name", () => {
    const out = text(
      help([
        { name: "ls", summary: "list files", section: "Files" },
        { name: "clear", summary: "clear", section: "Shell" },
        { name: "btop", aliases: ["top"], summary: "processes", section: "System" },
        { name: "cd", summary: "go", section: "Files" },
      ]),
    );
    expect(out.slice(0, -1)).toEqual([
      "Files:",
      "  cd     go",
      "  ls     list files",
      "",
      "System:",
      "  btop   processes (also top)",
      "",
      "Shell:",
      "  clear  clear",
      "",
    ]);
  });
});

describe("git", () => {
  const repo = {
    branch: "main",
    commits: [
      { hash: "b".repeat(40), subject: "second", author: "tom", date: "2026-11-07T16:38:12+01:00" },
      { hash: "a".repeat(40), subject: "first", author: "tom", date: "2026-01-01T09:00:00-05:30" },
    ],
  };

  it("prints the log the way git log does, HEAD on the newest", () => {
    const result = git(["log"], repo);
    expect(result.failed).toBe(false);
    expect(text(result.lines)).toEqual([
      `commit ${"b".repeat(40)} (HEAD -> main)`,
      "Author: tom",
      "Date:   Sat Nov 7 16:38:12 2026 +0100",
      "",
      "    second",
      "",
      `commit ${"a".repeat(40)}`,
      "Author: tom",
      "Date:   Thu Jan 1 09:00:00 2026 -0530",
      "",
      "    first",
    ]);
  });

  it("says the checkout is clean", () => {
    expect(text(git(["status"], repo).lines)).toEqual([
      "On branch main",
      "Your branch is up to date with 'origin/main'.",
      "",
      "nothing to commit, working tree clean",
    ]);
  });

  it("lists its commands for help, --help and -h; a bare git fails", () => {
    const usage = text(git(["help"], repo).lines);
    expect(usage.join("\n")).toMatch(/log +Show commit logs\n.*status +Show the working tree status/);
    expect(text(git(["--help"], repo).lines)).toEqual(usage);
    expect(text(git(["-h"], repo).lines)).toEqual(usage);
    expect(git([], repo)).toEqual({ lines: git(["help"], repo).lines, failed: true });
  });

  it("suggests the closest commands for one it doesn't have, as git does", () => {
    expect(git(["few"], repo).failed).toBe(true);
    expect(text(git(["few"], repo).lines)).toEqual([
      "git: 'few' is not a git command. See 'git --help'.",
      "",
      "The most similar command is",
      "\thelp",
    ]);
    expect(text(git(["stauts"], repo).lines)).toContain("\tstatus");
    expect(text(git(["lgo"], repo).lines)).toContain("\tlog");
    expect(text(git(["xyzzyplugh"], repo).lines)).toEqual([
      "git: 'xyzzyplugh' is not a git command. See 'git --help'.",
    ]);
  });

  it("weighs edits the way git's levenshtein does", () => {
    expect(gitDistance("lgo", "log")).toBe(0);
    expect(gitDistance("lo", "log")).toBe(1);
    expect(gitDistance("logg", "log")).toBe(3);
    expect(gitDistance("lag", "log")).toBe(2);
  });
});

describe("the prompt", () => {
  it("shows home as ~ and keeps the last three parts, as starship does", () => {
    expect(promptPath("")).toBe("~");
    expect(promptPath("projects")).toBe("~/projects");
    expect(promptPath("projects/demos")).toBe("~/projects/demos");
    expect(promptPath("projects/demos/deep")).toBe("…/projects/demos/deep");
  });

  it("prints the time as %R", () => {
    expect(promptTime(new Date(2026, 10, 27, 9, 5))).toBe("09:05");
  });
});
