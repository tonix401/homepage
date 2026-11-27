/**
 * Every command kitty's shell knows. `help` lists them under their
 * `section`, sorted by name, so the order here does not matter.
 *
 * Adding a command is an entry here: `help` and Tab completion read this
 * list, so nothing else has to know about it. The built-ins print lines that
 * `src/utils/shell.ts` works out; fastfetch prints a live element; btop and
 * jīzǐ take the window over. See the Apps section of CLAUDE.md.
 */

import { branch, commits } from "virtual:git-log";
import { cursorAt, findEntry } from "../../../utils/fileManager";
import { copyEntry, getTree, makeFolder, moveEntry, removeEntry } from "../../../utils/fileStore";
import { parseCurl } from "../../../utils/curl";
import { formatUptime } from "../../../utils/browserInfo";
import { sessionStart } from "../../../utils/sessionStart";
import {
  HOST,
  USER,
  absolutePath,
  appFor,
  cat,
  cd,
  date,
  file,
  firstEntry,
  formatArg,
  git,
  help,
  history,
  isFolder,
  joinPath,
  line,
  ls,
  resolvePath,
  transfers,
  uname,
} from "../../../utils/shell";
import { BtopScreen } from "./btop";
import { CurlOutput } from "./curl";
import { curl, printed } from "./download";
import { Fastfetch } from "./fastfetch";
import { JiziScreen } from "./jizi";
import { type Program } from "./types";

/** The entry under jīzǐ's cursor for its stored argument, as its panes show it. */
function jiziCursor(args: string[]) {
  const { entries, index } = cursorAt(getTree(), args[0] ?? null);
  return entries[index];
}

/** The image a word names, or why it does not, as `icat` and imv need one. */
function imageAt(cwd: string, target: string) {
  const path = resolvePath(getTree(), cwd, target);
  const node = path === null ? null : findEntry(getTree(), path)?.node;
  if (!node) return { error: "No such file or directory" };
  if (node.kind === "folder" || path === null) return { error: "Is a directory" };
  if (node.type !== "image") return { error: "Unrecognized image format" };
  return { file: node };
}

export const PROGRAMS: readonly Program[] = [
  {
    name: "help",
    summary: "list every command",
    section: "Shell",
    run: ({ commands }) => help(commands),
  },
  {
    name: "ls",
    aliases: ["dir"],
    summary: "list a folder",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      const result = ls(getTree(), cwd, args);
      if (result.failed) fail();
      return result.lines;
    },
  },
  {
    name: "cd",
    summary: "change the working folder",
    section: "Files",
    run: ({ cwd, args, cd: go, fail }) => {
      const result = cd(getTree(), cwd, args);
      if ("error" in result) {
        fail();
        return result.error;
      }
      go(result.cwd);
    },
  },
  {
    name: "pwd",
    summary: "print the working folder",
    section: "Files",
    run: ({ cwd }) => [line(absolutePath(cwd))],
  },
  {
    name: "cat",
    summary: "print the content of a file",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      const result = cat(getTree(), cwd, args);
      if (result.failed) fail();
      return result.lines;
    },
  },
  {
    name: "file",
    summary: "print the file type of a file",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      const result = file(getTree(), cwd, args);
      if (result.failed) fail();
      return result.lines;
    },
  },
  {
    name: "echo",
    summary: "print its arguments",
    section: "Shell",
    run: ({ args }) => [line(args.join(" "))],
  },
  {
    name: "open",
    summary: "open a file in its app, a folder in jizi",
    section: "Viewing",
    run: ({ cwd, args, open, fail }) => {
      if (args.length === 0) {
        fail();
        return [line("open: missing file operand")];
      }
      for (const target of args) {
        const path = resolvePath(getTree(), cwd, target);
        if (path === null) {
          fail();
          return [line(`open: ${target}: No such file or directory`)];
        }
        if (isFolder(getTree(), path)) {
          open("kitty", formatArg("jizi", [firstEntry(getTree(), path) ?? path]));
        } else {
          // jīzǐ's rule: each file to the app for its type.
          const node = findEntry(getTree(), path)?.node;
          if (node?.kind === "file") open(appFor(node), path);
        }
      }
    },
  },
  {
    name: "code",
    aliases: ["codium"],
    summary: "open a file in Codium",
    section: "Viewing",
    run: ({ cwd, args, open, fail }) => {
      if (args.length === 0) return open("editor", null);
      const path = resolvePath(getTree(), cwd, args[0]);
      const error =
        path === null ? "No such file or directory" : isFolder(getTree(), path) ? "Is a directory" : null;
      if (error || path === null) {
        fail();
        return [line(`code: ${args[0]}: ${error}`)];
      }
      open("editor", path);
    },
  },
  {
    name: "curl",
    featured: true,
    summary: "download a URL: curl <url> [name | folder/ | folder/name]",
    section: "Files",
    run: ({ cwd, args, signal, wait, fail }) => {
      const parsed = parseCurl(getTree(), cwd, args);
      if ("help" in parsed) return parsed.help;
      if ("error" in parsed) {
        fail();
        return parsed.error;
      }
      const out = printed();
      wait(
        curl(parsed.url, parsed.path, signal, out).then((ok) => {
          if (!ok) fail();
        }),
      );
      return <CurlOutput out={out} />;
    },
  },
  {
    name: "mkdir",
    summary: "make a folder and any missing above it: mkdir <path/name>",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      // No options: a folder's missing parents are always made.
      const option = args.find((a) => a.length > 1 && a.startsWith("-"));
      if (option) {
        fail();
        return [line(`mkdir: invalid option -- '${option.replace(/^-+/, "")[0]}'`)];
      }
      if (args.length === 0) {
        fail();
        return [line("mkdir: missing operand")];
      }
      const out = [];
      for (const target of args) {
        const error = target === "" ? "No such file or directory" : makeFolder(joinPath(cwd, target));
        if (error) out.push(line(`mkdir: cannot create directory '${target}': ${error}`));
      }
      if (out.length) fail();
      return out;
    },
  },
  {
    name: "cp",
    summary: "copy files or folders: cp <from…> <to>",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      const planned = transfers("cp", getTree(), cwd, args);
      const out = [...planned.errors];
      for (const t of planned.transfers) {
        const error = copyEntry(t.from, t.to);
        if (error) out.push(line(`cp: cannot create ${t.folder ? "directory" : "regular file"} '${t.target}': ${error}`));
      }
      if (out.length) fail();
      return out;
    },
  },
  {
    name: "mv",
    summary: "move or rename a file: mv <from…> <to>",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      const planned = transfers("mv", getTree(), cwd, args);
      const out = [...planned.errors];
      for (const t of planned.transfers) {
        // The site's own files are root's, in sticky folders; only yours move.
        const error = moveEntry(t.from, t.to);
        if (error) out.push(line(`mv: cannot move '${t.source}' to '${t.target}': ${error}`));
      }
      if (out.length) fail();
      return out;
    },
  },
  {
    name: "rm",
    summary: "remove files or folders",
    section: "Files",
    run: ({ cwd, args, fail }) => {
      // A folder needs no -r; -f still quiets a missing operand.
      const force = args.some((a) => a === "--force" || /^-[a-z]*f/.test(a));
      const targets = args.filter((a) => !a.startsWith("-"));
      if (targets.length === 0) {
        if (force) return;
        fail();
        return [line("rm: missing operand")];
      }
      const out = [];
      for (const target of targets) {
        if (/(^|\/)\.\.?\/*$/.test(target)) {
          out.push(line(`rm: refusing to remove '.' or '..' directory: skipping '${target}'`));
          continue;
        }
        const path = resolvePath(getTree(), cwd, target);
        // The site's own files are root's, in sticky folders; only yours go.
        const error = path === null ? "No such file or directory" : removeEntry(path);
        if (error && !(force && path === null)) out.push(line(`rm: cannot remove '${target}': ${error}`));
      }
      if (out.length) fail();
      return out;
    },
  },
  {
    name: "icat",
    summary: "draw an image here: icat <image…>",
    section: "Viewing",
    run: ({ cwd, args, fail }) => {
      const targets = args.filter((a) => !a.startsWith("-"));
      if (targets.length === 0) {
        fail();
        return [line("Usage: icat <image>...")];
      }
      const shown = targets.map((target) => ({ target, ...imageAt(cwd, target) }));
      if (shown.some((s) => "error" in s)) fail();
      return (
        <>
          {shown.map((s) =>
            "file" in s && s.file ? (
              <img key={s.target} className="kitty-icat" src={s.file.src} alt={s.file.name} referrerPolicy="no-referrer" />
            ) : (
              <div key={s.target} className="kitty-line">{`icat: ${s.target}: ${s.error}`}</div>
            ),
          )}
        </>
      );
    },
  },
  {
    name: "imv",
    summary: "view an image (← → step, d overlay, q quit)",
    section: "Viewing",
    run: ({ cwd, args, open, fail }) => {
      const target = args.find((a) => !a.startsWith("-"));
      if (target === undefined) return open("imv", null);
      const found = imageAt(cwd, target);
      if ("error" in found) {
        fail();
        return [line(`imv: ${target}: ${found.error}`)];
      }
      open("imv", found.file.path);
    },
  },
  {
    name: "git",
    featured: true,
    summary: "this site's history: log, status, help",
    section: "System",
    run: ({ args, fail }) => {
      const result = git(args, { commits, branch });
      if (result.failed) fail();
      return result.lines;
    },
  },
  {
    name: "whoami",
    summary: "print the user name",
    section: "System",
    run: () => [line(USER)],
  },
  {
    name: "hostname",
    summary: "print the machine's name",
    section: "System",
    run: () => [line(HOST)],
  },
  {
    name: "uname",
    summary: "print the system name (-a: all of it)",
    section: "System",
    run: ({ args }) => uname(args),
  },
  {
    name: "date",
    summary: "print the date and time",
    section: "System",
    run: () => date(new Date()),
  },
  {
    name: "uptime",
    summary: "how long this tab has been open",
    section: "System",
    // Since this tab's session began, as fastfetch and btop count it.
    run: () => [line(`up ${formatUptime(Date.now() - sessionStart())}`)],
  },
  {
    name: "history",
    summary: "every command typed in this window",
    section: "Shell",
    run: ({ history: lines }) => history(lines),
  },
  {
    name: "clear",
    summary: "clear the screen (Ctrl+L)",
    section: "Shell",
    run: ({ clear }) => clear(),
  },
  {
    name: "exit",
    summary: "close the window",
    section: "Shell",
    run: ({ close }) => close(),
  },
  {
    name: "fastfetch",
    featured: true,
    aliases: ["neofetch", "ff"],
    summary: "this browser's system info",
    section: "System",
    run: () => <Fastfetch />,
  },
  {
    name: "btop",
    aliases: ["top", "htop"],
    summary: "the desktop's windows as processes",
    section: "System",
    Screen: BtopScreen,
    // It takes no arguments, so none survive a reload.
    normalizeArgs: () => [],
  },
  {
    name: "jizi",
    aliases: ["yazi", "ranger"],
    summary: "a yazi-style file manager",
    section: "Viewing",
    Screen: JiziScreen,
    // `jizi projects` opens inside projects, on its first row; `jizi notes.md`
    // with the cursor on that file; a bare `jizi` inside the working folder.
    launch: (args, cwd) => {
      const path = resolvePath(getTree(), cwd, args[0] ?? ".") ?? cwd;
      if (!isFolder(getTree(), path)) return [path];
      const first = firstEntry(getTree(), path);
      return first ? [first] : path ? [path] : [];
    },
    // A path that has left the tree puts the cursor back at the top of home.
    normalizeArgs: (args) => (args[0] && findEntry(getTree(), args[0]) ? [args[0]] : []),
    // The entry under the cursor, the way the editor and the browser name the
    // file they show. No argument is the cursor on the first row of home, so
    // that row is named too.
    title: (args) => {
      const name = jiziCursor(args)?.name;
      return name ? `${name} — jīzǐ` : "jīzǐ";
    },
  },
];

/** The program a typed name runs, by its name or an alias. */
export function findProgram(name: string): Program | undefined {
  return PROGRAMS.find((p) => p.name === name || p.aliases?.includes(name));
}

/** Every name a command can be typed as, for Tab. */
export const COMMAND_NAMES: readonly string[] = PROGRAMS.flatMap((p) => [p.name, ...(p.aliases ?? [])]);
