/**
 * kitty's shell, as data: how a typed line splits into words, where a path
 * typed at a prompt lands in the open folder, what Tab completes it to, and
 * what the built-in commands print.
 *
 * The open folder is the home directory, as it is in jīzǐ: `~` is the root
 * of the tree, `~/projects` a folder in it, and `/home/tom` the same place
 * spelled out. A path is stored the way the explorer shows it
 * (`projects/Homelab.md`, `""` for home), so it can go straight to
 * `fileManager.ts` and to the other apps' payloads.
 *
 * Kept free of React and of the virtual modules, like `fileManager.ts`: every
 * function takes the tree it should read, so the tests can hand it one.
 */

// `import type`, not `{ type … }`: the latter still loads the module, and
// this one runs git at build time, which a browser cannot.
import type { Commit } from "../services/gitLog";
import { type FileNode, type FileType, type TreeNode } from "../services/types";
import { type Entry, baseName, findEntry, listDir } from "./fileManager";

/** The name in the prompt — the bar says tom@box. */
export const USER = "tom";
export const HOST = "box";
/** Where `~` is, for `pwd` and for a path typed out in full. */
export const HOME = `/home/${USER}`;

/** The colours output is drawn in: kitty's ANSI palette, and the theme's. */
export type Tone = "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "primary" | "dim" | "bold";

export interface Segment {
  text: string;
  tone?: Tone;
  bold?: boolean;
  underline?: boolean;
}

/** One line of output. An empty array is a blank line. */
export type Line = Segment[];

/** A line in one colour, or none. */
export function line(text: string, tone?: Tone): Line {
  return [{ text, tone }];
}

/**
 * Splits a command line into words the way a shell does: whitespace
 * separates them, single quotes keep everything, double quotes keep all but a
 * backslash escape, and a backslash outside quotes escapes the next character.
 * An unclosed quote runs to the end of the line rather than failing.
 */
export function tokenize(input: string): string[] {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < input.length) word += input[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < input.length) {
      word += input[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += c;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/** A word as it has to be typed to come back out of `tokenize` unchanged. */
export function quote(word: string): string {
  if (word === "") return "''";
  return /[\s'"\\]/.test(word) ? `'${word.replace(/'/g, `'\\''`)}'` : word;
}

/**
 * Where `input`, typed in `cwd`, points: a path in the tree (`""` is home),
 * or `null` when nothing is there. `~`, `~/…`, `/home/tom/…`, `.` and `..`
 * all work; `..` above home stays at home, since the open folder is the whole
 * filesystem a visitor can see.
 */
export function resolvePath(tree: TreeNode[], cwd: string, input: string): string | null {
  const path = joinPath(cwd, input);
  if (path === "") return "";
  return findEntry(tree, path) ? path : null;
}

/** Where `input`, typed in `cwd`, would be, whether or not anything is there: where `curl -o` writes. */
export function joinPath(cwd: string, input: string): string {
  let rest = input;
  let parts: string[];
  if (rest === "~" || rest.startsWith("~/")) {
    parts = [];
    rest = rest.slice(1);
  } else if (rest === HOME || rest.startsWith(`${HOME}/`)) {
    parts = [];
    rest = rest.slice(HOME.length);
  } else if (rest.startsWith("/")) {
    parts = [];
  } else {
    parts = cwd ? cwd.split("/") : [];
  }

  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/** Whether `path` is a folder: home, or a folder in the tree. */
export function isFolder(tree: TreeNode[], path: string): boolean {
  return path === "" || findEntry(tree, path)?.node.kind === "folder";
}

/**
 * The app a file opens in, by jīzǐ's rule and `open`'s: a page is for looking
 * at, so HTML goes to the browser, an image to imv, and the rest to $EDITOR.
 */
export function appFor(file: FileNode): "browser" | "imv" | "editor" {
  return file.type === "html" ? "browser" : file.type === "image" ? "imv" : "editor";
}

/** `pwd`: home spelled out, as a shell prints it. */
export function absolutePath(path: string): string {
  return path ? `${HOME}/${path}` : HOME;
}

/**
 * The prompt's directory, as Tom's starship config prints it: home is `~`,
 * and past three parts only the last three show, after `…/`
 * (`truncation_length = 3`, `truncation_symbol = "…/"`).
 */
export function promptPath(path: string): string {
  const parts = ["~", ...(path ? path.split("/") : [])];
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : parts.join("/");
}

/** The prompt's clock, starship's `%R`: `09:05`. */
export function promptTime(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ── The window's payload ──────────────────────────────────────────────────

/**
 * A kitty window's payload is the command line of the program running in the
 * foreground — `btop`, `jizi projects/Homelab.md` — or `null` for the prompt.
 */
export function parseArg(arg: string | null): { program: string; args: string[] } | null {
  if (arg === null) return null;
  const [program, ...args] = tokenize(arg);
  return program ? { program, args } : null;
}

export function formatArg(program: string, args: readonly string[]): string {
  return [program, ...args].map(quote).join(" ");
}

// ── Tab completion ────────────────────────────────────────────────────────

/**
 * Where the word being typed starts: after the last whitespace that is not
 * escaped or inside quotes, and the quote it is still inside, if any.
 * Completion only ever works on the end of the line.
 */
function wordStart(input: string): { start: number; open: "'" | '"' | null } {
  let start = 0;
  let quoted: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === quoted) quoted = null;
    } else if (c === "'" || c === '"') quoted = c;
    else if (c === "\\") i++;
    else if (/\s/.test(c)) start = i + 1;
  }
  return { start, open: quoted };
}

/**
 * A completed name as it is typed: outside quotes its spaces and quotes are
 * escaped with backslashes; inside single quotes only a `'` needs leaving
 * (`'\''`), and inside double quotes only `"` and `\`, as `tokenize` reads
 * them. `done` closes the quote the word was typed in.
 */
function escapeWord(word: string, open: "'" | '"' | null = null, done = false): string {
  if (open === "'") return `'${word.replace(/'/g, `'\\''`)}${done ? "'" : ""}`;
  if (open === '"') return `"${word.replace(/(["\\])/g, "\\$1")}${done ? '"' : ""}`;
  return word.replace(/([\s'"\\])/g, "\\$1");
}

function commonPrefix(words: readonly string[]): string {
  if (words.length === 0) return "";
  let prefix = words[0];
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/**
 * What the word under the end of `input` could complete to: a command when it
 * is the first word, a path in the tree otherwise. `full` is what replaces the
 * word, before escaping; `name` is what a list of them shows.
 */
function candidatesFor(tree: TreeNode[], cwd: string, input: string, commands: readonly string[]) {
  const { start, open } = wordStart(input);
  const head = input.slice(0, start);
  const word = tokenize(input.slice(start))[0] ?? "";

  let candidates: { name: string; full: string; folder: boolean }[];
  if (tokenize(head).length === 0) {
    candidates = [...new Set(commands)]
      .filter((c) => c.startsWith(word))
      .sort()
      .map((c) => ({ name: c, full: c, folder: false }));
  } else {
    const dirPart = word.slice(0, word.lastIndexOf("/") + 1);
    const base = word.slice(dirPart.length);
    const dir = resolvePath(tree, cwd, dirPart || ".");
    const entries = dir !== null && isFolder(tree, dir) ? (listDir(tree, dir) ?? []) : [];
    candidates = entries
      .filter((e) => e.name.startsWith(base))
      .map((e) => {
        const folder = e.node.kind === "folder";
        const name = folder ? `${e.name}/` : e.name;
        return { name, full: dirPart + name, folder };
      });
  }
  return { head, word, open, candidates };
}

/**
 * What Tab does to `input`: the first word completes to a command, any
 * other to a path in the tree, folders ending in `/` so the next Tab goes in.
 * `line` is the new input; `options` the candidates to show when there is
 * more than one, as a shell lists them under the prompt.
 */
export function complete(
  tree: TreeNode[],
  cwd: string,
  input: string,
  commands: readonly string[],
): { line: string; options: string[] } {
  const { head, word, open, candidates } = candidatesFor(tree, cwd, input, commands);
  if (candidates.length === 1) {
    const [only] = candidates;
    // A folder keeps its quote open, so the next Tab can go in.
    return { line: head + escapeWord(only.full, open, !only.folder) + (only.folder ? "" : " "), options: [] };
  }
  const prefix = commonPrefix(candidates.map((c) => c.full));
  return {
    line: prefix.length > word.length ? head + escapeWord(prefix, open) : input,
    options: candidates.map((c) => c.name),
  };
}

/**
 * The grey suggestion after the cursor, as zsh-autosuggestions makes it with
 * Tom's `ZSH_AUTOSUGGEST_STRATEGY=(history completion)`: the newest line in the
 * history that starts with what is typed, or else the first thing the last
 * word completes to. It is the whole line, or `null` when there is nothing to
 * add — and on an empty line, where zsh suggests nothing either.
 */
export function suggest(
  tree: TreeNode[],
  cwd: string,
  input: string,
  history: readonly string[],
  commands: readonly string[],
): string | null {
  if (!input.trim()) return null;
  const continues = (line: string) => line.length > input.length && line.startsWith(input);
  const recalled = history.findLast(continues);
  if (recalled) return recalled;
  const { head, open, candidates } = candidatesFor(tree, cwd, input, commands);
  const completed = candidates.length ? head + escapeWord(candidates[0].full, open) : null;
  return completed && continues(completed) ? completed : null;
}

/**
 * A typed line coloured as zsh-syntax-highlighting colours it in Tom's
 * config: the command blue when there is one by that name, red while there is
 * not — so it turns blue the moment it is spelled right. The rest is as typed.
 */
export function highlight(input: string, commands: readonly string[]): Line {
  const match = /^(\s*)(\S+)([\s\S]*)$/.exec(input);
  if (!match) return [{ text: input }];
  const [, lead, word, rest] = match;
  const known = commands.includes(tokenize(word)[0] ?? "");
  return [{ text: lead }, { text: word, tone: known ? "blue" : "red" }, { text: rest }];
}

// ── What the built-ins print ──────────────────────────────────────────────

/**
 * The Nerd Font icon eza puts before a name. A folder is closed, or open
 * when there is nothing in it; a README gets its own, as eza gives one; an
 * image is a picture, an SVG its own mark; a type it has no icon for gets
 * the plain file.
 */
const FILE_ICONS: Partial<Record<FileType, string>> = { md: "\uF48A", html: "\uF13B", image: "\uF1C5" };
const SVG_ICON = "\u{F0559}";
const TEXT_ICON = "\uF15C";
const FOLDER_ICON = "\uE5FF";
const EMPTY_FOLDER_ICON = "\uF115";
const README_ICON = "\u{F00BA}";
const FILE_ICON = "\uF15B";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A size as eza writes it: bytes, then decimal kilo- and megabytes, one place below ten. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return String(bytes);
  let value = bytes;
  let unit = "";
  for (const u of ["k", "M", "G"]) {
    value /= 1000;
    unit = u;
    if (value < 1000) break;
  }
  return `${value < 9.95 ? value.toFixed(1) : Math.round(value)}${unit}`;
}

/** A date as eza writes it: the time this year, the year before that. */
export function formatModified(date: Date, now: Date): string {
  const day = String(date.getDate()).padStart(2);
  const tail = date.getFullYear() === now.getFullYear() ? promptTime(date) : ` ${date.getFullYear()}`;
  return `${day} ${MONTHS[date.getMonth()]} ${tail}`;
}

/** A file's last change, or a folder's: the newest of everything in it. */
function modified(node: TreeNode): number | undefined {
  if (node.kind === "file") return node.modified ? Date.parse(node.modified) : undefined;
  const times = node.children.map(modified).filter((t) => t !== undefined);
  return times.length ? Math.max(...times) : undefined;
}

/** Who owns an entry: the visitor what they added, root the site's own. */
function owner(node: TreeNode): string {
  return node.added ? USER : "root";
}

/**
 * `drwxr-xr-x` in eza's colours: the owner's bits bold, every unset bit dim.
 * The site's own folders are root's and sticky, as `/tmp` is: anyone may add
 * to them, but only an entry's owner may remove or rename it (`fileStore.ts`).
 */
function permissions(node: TreeNode): Segment[] {
  const tones: Record<string, Tone> = { r: "yellow", w: "red", x: "green", t: "magenta", "-": "dim" };
  const folder = node.kind === "folder";
  const bits = !folder ? "rw-r--r--" : node.added ? "rwxr-xr-x" : "rwxrwxrwt";
  return [
    folder ? { text: "d", tone: "blue", bold: true } : { text: "." },
    ...[...bits].map((c, i) => ({ text: c, tone: tones[c], bold: i < 3 || c === "-" })),
  ];
}

/** The icon and the name: a folder blue, a README underlined, as eza marks it. */
function name(entry: Entry, label: string): Segment[] {
  const { node } = entry;
  if (node.kind === "folder") {
    const icon = node.children.length ? FOLDER_ICON : EMPTY_FOLDER_ICON;
    return [{ text: `${icon} `, tone: "blue" }, { text: label, tone: "blue", bold: true }];
  }
  if (/^readme\b/i.test(node.name)) {
    return [{ text: `${README_ICON} `, tone: "yellow" }, { text: label, tone: "yellow", bold: true, underline: true }];
  }
  // eza paints an image, icon and name, in magenta, the name bold.
  if (node.type === "image") {
    const icon = /\.svg$/i.test(node.name) ? SVG_ICON : FILE_ICONS.image;
    return [{ text: `${icon} `, tone: "magenta" }, { text: label, tone: "magenta", bold: true }];
  }
  const icon = /\.txt$/i.test(node.name) ? TEXT_ICON : (FILE_ICONS[node.type] ?? FILE_ICON);
  return [{ text: `${icon} ` }, { text: label }];
}

/**
 * Entries as Tom's `ls` alias lists them — `eza --long --header --icons
 * --group-directories-first` — each as `[entry, what to call it]`. Its users
 * are Tom and root, and it has no git column: the open folder is not a
 * repository.
 */
function table(rows: readonly [Entry, string][], now: Date): Line[] {
  const encoder = new TextEncoder();
  const cells = rows.map(([entry, label]) => {
    const { node } = entry;
    const time = modified(node);
    return {
      entry,
      label,
      // A hotlinked image's size is the server's to know, and a folder has none.
      size:
        node.kind === "file" && (node.size !== undefined || !node.src)
          ? formatSize(node.size ?? encoder.encode(node.content).length)
          : "-",
      date: time === undefined ? "-" : formatModified(new Date(time), now),
    };
  });
  const sizeWidth = Math.max(4, ...cells.map((c) => c.size.length));
  const userWidth = Math.max(4, ...cells.map((c) => owner(c.entry.node).length));
  const dateWidth = Math.max(13, ...cells.map((c) => c.date.length));
  const header: Line = [
    { text: "Permissions", underline: true },
    { text: " ".repeat(sizeWidth - 3) },
    { text: "Size", underline: true },
    { text: " " },
    { text: "User", underline: true },
    { text: " ".repeat(userWidth - 3) },
    { text: "Date Modified", underline: true },
    { text: " ".repeat(dateWidth - 12) },
    { text: "Name", underline: true },
  ];
  return [
    header,
    ...cells.map(({ entry, label, size, date }): Line => [
      ...permissions(entry.node),
      // Ten characters under an eleven-character heading.
      { text: "  " },
      {
        text: size.padStart(sizeWidth),
        tone: size === "-" ? "dim" : "green",
        // eza bolds a size with a unit, and a folder's dash.
        bold: /\D$/.test(size),
      },
      { text: " " },
      // eza paints you yellow, and anyone else plain.
      entry.node.added
        ? { text: USER.padEnd(userWidth), tone: "yellow", bold: true }
        : { text: owner(entry.node).padEnd(userWidth) },
      { text: " " },
      { text: date.padEnd(dateWidth), tone: "blue" },
      { text: " " },
      ...name(entry, label),
    ]),
  ];
}

/** Folders first, each group in the explorer's order. */
function foldersFirst(entries: readonly Entry[]): Entry[] {
  return [...entries.filter((e) => e.node.kind === "folder"), ...entries.filter((e) => e.node.kind !== "folder")];
}

/**
 * What a command printed, and whether it failed — the prompt turns red after
 * a failure, as starship's does on a non-zero exit status.
 */
export interface Result {
  lines: Line[];
  failed: boolean;
}

/**
 * `ls [path…]`, the long listing Tom's alias makes of it. Flags are accepted
 * and ignored: there are no dotfiles, and the listing is always long.
 */
export function ls(tree: TreeNode[], cwd: string, args: readonly string[], now = new Date()): Result {
  const targets = args.filter((a) => !a.startsWith("-"));
  if (targets.length === 0) targets.push(".");
  const out: Line[] = [];
  let failed = false;
  const files: [Entry, string][] = [];
  const folders: { name: string; entries: Entry[] }[] = [];

  for (const target of targets) {
    const path = resolvePath(tree, cwd, target);
    if (path === null) {
      out.push(line(`ls: cannot access '${target}': No such file or directory`));
      failed = true;
    } else if (isFolder(tree, path)) {
      folders.push({ name: target, entries: listDir(tree, path) ?? [] });
    } else {
      files.push([findEntry(tree, path)!, target]);
    }
  }

  if (files.length) out.push(...table(files, now));
  for (const folder of folders) {
    if (targets.length > 1) {
      if (out.length) out.push([]);
      out.push(line(`${folder.name}:`));
    }
    if (folder.entries.length) out.push(...table(foldersFirst(folder.entries).map((e) => [e, e.name]), now));
  }
  return { lines: out, failed };
}

/**
 * What `file` calls each extension, in libmagic's own words (Tom's file
 * 5.48) where it has a name for the type. The real one reads the contents;
 * this one goes by the name alone, so other text is plain `ASCII text` and
 * an extension it does not know is `data`.
 */
const FILE_KINDS: Record<string, string> = {
  png: "PNG image data",
  jpg: "JPEG image data",
  jpeg: "JPEG image data",
  gif: "GIF image data",
  webp: "RIFF (little-endian) data, Web/P image",
  avif: "ISO Media, AVIF Image",
  svg: "SVG Scalable Vector Graphics image",
  html: "HTML document, Unicode text, UTF-8 text",
  htm: "HTML document, Unicode text, UTF-8 text",
  json: "JSON text data",
  xml: "XML 1.0 document, ASCII text",
  sh: "POSIX shell script, ASCII text executable",
  py: "Python script, ASCII text executable",
  c: "C source, ASCII text",
  h: "C source, ASCII text",
  cpp: "C++ source, ASCII text",
  java: "Java source, ASCII text",
};

const TEXT_EXTENSIONS = ["md", "markdown", "txt", "css", "js", "jsx", "ts", "tsx", "yaml", "yml", "toml", "rs", "go", "rb", "php", "sql", "vue", "svelte"];

/** What `file` says of an entry: `directory`, `empty`, or its extension's kind. */
export function fileKind(node: TreeNode): string {
  if (node.kind === "folder") return "directory";
  if (node.size === 0 || (node.size === undefined && !node.src && node.content === "")) return "empty";
  const dot = node.name.lastIndexOf(".");
  const ext = dot > 0 ? node.name.slice(dot + 1).toLowerCase() : "";
  return FILE_KINDS[ext] ?? (TEXT_EXTENSIONS.includes(ext) ? "ASCII text" : "data");
}

const FILE_USAGE = [
  "Usage: file [-bcCdEhikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]",
  "            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]",
  "            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]",
  "            <file> ...",
  "       file -C [-m <magicfiles>]",
  "       file [--help]",
];

/**
 * `file name…`: what each one is, by its name (`fileKind`), the kinds lined
 * up after the longest name as `file` lines them up. `-b` leaves the names
 * out. A missing one is said so in its row, and is not a failure, as with the
 * real one.
 */
export function file(tree: TreeNode[], cwd: string, args: readonly string[]): Result {
  const brief = args.some((a) => a === "--brief" || /^-[a-z]*b/.test(a));
  const targets = args.filter((a) => !a.startsWith("-"));
  if (targets.length === 0) return { lines: FILE_USAGE.map((l) => line(l)), failed: true };
  const width = Math.max(...targets.map((t) => t.length + 1));
  return {
    lines: targets.map((target) => {
      const path = resolvePath(tree, cwd, target);
      const node = path === null ? null : path === "" ? null : findEntry(tree, path)?.node;
      const kind =
        path === "" ? "directory" : node ? fileKind(node) : `cannot open \`${target}' (No such file or directory)`;
      return line(brief ? kind : `${`${target}:`.padEnd(width)} ${kind}`);
    }),
    failed: false,
  };
}

/** `cat file…`: the raw text, as jīzǐ's preview shows it. */
export function cat(tree: TreeNode[], cwd: string, args: readonly string[]): Result {
  if (args.length === 0) return { lines: [line("cat: missing file operand")], failed: true };
  const out: Line[] = [];
  let failed = false;
  for (const target of args) {
    const path = resolvePath(tree, cwd, target);
    const entry = path === null || path === "" ? null : findEntry(tree, path);
    if (path === null) out.push(line(`cat: ${target}: No such file or directory`));
    else if (!entry || entry.node.kind === "folder") out.push(line(`cat: ${target}: Is a directory`));
    else if (entry.node.type === "image") out.push(line(`cat: ${target}: binary file, try icat`));
    else {
      const text = entry.node.content.replace(/\n$/, "");
      out.push(...text.split("\n").map((l) => line(l)));
      continue;
    }
    failed = true;
  }
  return { lines: out, failed };
}

/** `cd`'s answer: the new directory, or the error zsh prints. */
export function cd(tree: TreeNode[], cwd: string, args: readonly string[]): { cwd: string } | { error: Line[] } {
  if (args.length > 1) return { error: [line("cd: too many arguments")] };
  const target = args[0] ?? "~";
  const path = resolvePath(tree, cwd, target);
  if (path === null) return { error: [line(`cd: no such file or directory: ${target}`)] };
  if (!isFolder(tree, path)) return { error: [line(`cd: not a directory: ${target}`)] };
  return { cwd: path };
}

/**
 * Where something called `name` lands when sent to `dest`, as `cp`, `mv` and
 * `curl` read it: inside `dest`, under its own name, when `dest` is a folder
 * or ends in `/`; otherwise at `dest`, under that name. `shown` is the place
 * as the messages name it, from what was typed.
 */
export function destination(
  tree: TreeNode[],
  cwd: string,
  name: string,
  dest: string,
): { path: string; shown: string; into: boolean } {
  const at = joinPath(cwd, dest);
  const into = dest.endsWith("/") || isFolder(tree, at);
  if (!into) return { path: at, shown: dest, into };
  return { path: at ? `${at}/${name}` : name, shown: `${dest.replace(/\/+$/, "")}/${name}`, into };
}

/** One thing `cp` or `mv` is to do: tree paths, and the words its messages use for them. */
export interface Transfer {
  from: string;
  to: string;
  source: string;
  target: string;
  folder: boolean;
}

/**
 * What `cp` or `mv` was asked to do, as coreutils reads its operands: the
 * last is where everything goes, and with more than one source it has to be
 * a folder. Flags are accepted and ignored — a folder needs no `-r`. Each
 * source is checked here, before anything is done: that it exists, that it
 * is not its own target, and that a folder is not going inside itself.
 */
export function transfers(
  command: "cp" | "mv",
  tree: TreeNode[],
  cwd: string,
  args: readonly string[],
): { transfers: Transfer[]; errors: Line[] } {
  const operands = args.filter((a) => !a.startsWith("-") || a === "-");
  if (operands.length === 0) return { transfers: [], errors: [line(`${command}: missing file operand`)] };
  if (operands.length === 1) {
    return { transfers: [], errors: [line(`${command}: missing destination file operand after '${operands[0]}'`)] };
  }
  const dest = operands[operands.length - 1];
  const sources = operands.slice(0, -1);
  if (dest === "") {
    const what = command === "cp" ? "cannot create regular file" : "cannot move";
    return {
      transfers: [],
      errors: sources.map((source) =>
        line(command === "cp" ? `cp: ${what} '': No such file or directory` : `mv: ${what} '${source}' to '': No such file or directory`),
      ),
    };
  }
  if (sources.length > 1 && !isFolder(tree, joinPath(cwd, dest))) {
    return { transfers: [], errors: [line(`${command}: target '${dest}' is not a directory`)] };
  }

  const out: Transfer[] = [];
  const errors: Line[] = [];
  for (const source of sources) {
    const from = resolvePath(tree, cwd, source);
    if (from === null) {
      errors.push(line(`${command}: cannot stat '${source}': No such file or directory`));
      continue;
    }
    const { path: to, shown: target } = destination(tree, cwd, baseName(from), dest);
    const folder = isFolder(tree, from);
    if (to === from) errors.push(line(`${command}: '${source}' and '${target}' are the same file`));
    else if (folder && (from === "" || to.startsWith(`${from}/`))) {
      errors.push(
        line(
          command === "cp"
            ? `cp: cannot copy a directory, '${source}', into itself, '${target}'`
            : `mv: cannot move '${source}' to a subdirectory of itself, '${target}'`,
        ),
      );
    } else out.push({ from, to, source, target, folder });
  }
  return { transfers: out, errors };
}

/** `uname`, and `uname -a`. */
export function uname(args: readonly string[]): Line[] {
  return args.some((a) => a === "-a" || a === "--all")
    ? [line(`Linux ${HOST} 6.17.9-arch1-1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`)]
    : [line("Linux")];
}

/** `date`, laid out the way coreutils prints it: `Fri Nov 27 14:03:11 CET 2026`. */
export function date(now: Date): Line[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = now.toLocaleString("en-US", { weekday: "short" });
  const month = now.toLocaleString("en-US", { month: "short" });
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return [line(`${weekday} ${month} ${String(now.getDate()).padStart(2, " ")} ${time} ${zone} ${now.getFullYear()}`)];
}

/** `history`: every line typed in this window, numbered from 1. */
export function history(lines: readonly string[]): Line[] {
  return lines.map((l, i) => [{ text: String(i + 1).padStart(5, " "), tone: "dim" }, { text: `  ${l}` }]);
}

// ── git ───────────────────────────────────────────────────────────────────

/** What `git` reads: the site's own history, as the Source Control panel has it. */
export interface Repo {
  /** Newest first. */
  commits: readonly Commit[];
  /** The checked-out branch, or null on a detached HEAD. */
  branch: string | null;
}

/** The subcommands `git` answers, as `git help` lists them. */
const GIT_COMMANDS = [
  { name: "log", summary: "Show commit logs" },
  { name: "status", summary: "Show the working tree status" },
  { name: "help", summary: "Display help information about Git" },
];

function gitUsage(): Line[] {
  const width = Math.max(...GIT_COMMANDS.map((c) => c.name.length)) + 3;
  return [
    line("usage: git [-h | --help] <command> [<args>]"),
    [],
    line("These are common Git commands used in various situations:"),
    [],
    ...GIT_COMMANDS.map((c) => line(`   ${c.name.padEnd(width)}${c.summary}`)),
  ];
}

/**
 * git's edit distance (`levenshtein.c`), with its weights for a mistyped
 * command: a swap of two letters is free, a substitution costs 2, an
 * insertion 1 and a deletion 3.
 */
export function gitDistance(typed: string, candidate: string): number {
  const [w, s, a, d] = [0, 2, 1, 3];
  let row0: number[] = [];
  let row1 = Array.from({ length: candidate.length + 1 }, (_, j) => j * a);
  for (let i = 0; i < typed.length; i++) {
    const row2 = [(i + 1) * d];
    for (let j = 0; j < candidate.length; j++) {
      let cost = row1[j] + s * Number(typed[i] !== candidate[j]);
      if (i > 0 && j > 0 && typed[i - 1] === candidate[j] && typed[i] === candidate[j - 1])
        cost = Math.min(cost, row0[j - 1] + w);
      row2[j + 1] = Math.min(cost, row1[j + 1] + d, row2[j] + a);
    }
    row0 = row1;
    row1 = row2;
  }
  return row1[candidate.length];
}

/**
 * What git suggests for a command it doesn't have (`help_unknown_cmd`): the
 * ones that start with what was typed, then every one tied for the smallest
 * distance — or none, when even the closest is 7 or more away.
 */
function similarGitCommands(typed: string): string[] {
  const scored = GIT_COMMANDS.map((c) => ({
    name: c.name,
    score: c.name.startsWith(typed) ? 0 : gitDistance(typed, c.name) + 1,
  })).sort((x, y) => x.score - y.score || x.name.localeCompare(y.name));
  const prefixes = scored.filter((c) => c.score === 0).length;
  // Prefix matches with everything are too ambiguous to suggest.
  if (prefixes === scored.length) return [];
  const best = scored[prefixes].score;
  return best < 7 ? scored.filter((c) => c.score <= best).map((c) => c.name) : [];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `%cI`'s date the way `git log` prints it, in the commit's own zone: `Fri Nov 7 16:38:12 2026 +0100`. */
export function gitDate(iso: string): string {
  const match = /^(\d+)-(\d+)-(\d+)T(\d+:\d+:\d+)(?:([+-])(\d+):(\d+)|Z)$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day, time, sign = "+", hours = "00", minutes = "00"] = match;
  const weekday = WEEKDAYS[new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay()];
  return `${weekday} ${MONTHS[+month - 1]} ${+day} ${time} ${year} ${sign}${hours}${minutes}`;
}

/** `git log`: every commit with its subject, the newest marked as HEAD. */
function gitLog({ commits, branch }: Repo): Line[] {
  return commits.flatMap((commit, i): Line[] => {
    const head: Line =
      i > 0
        ? []
        : branch
          ? [
              { text: " (", tone: "yellow" },
              { text: "HEAD -> ", tone: "cyan", bold: true },
              { text: branch, tone: "green", bold: true },
              { text: ")", tone: "yellow" },
            ]
          : [
              { text: " (", tone: "yellow" },
              { text: "HEAD", tone: "cyan", bold: true },
              { text: ")", tone: "yellow" },
            ];
    return [
      ...(i > 0 ? [[]] : []),
      [{ text: `commit ${commit.hash}`, tone: "yellow" }, ...head],
      line(`Author: ${commit.author}`),
      line(`Date:   ${gitDate(commit.date)}`),
      [],
      line(`    ${commit.subject}`),
    ];
  });
}

/** `git status`: the checkout is always clean, and level with origin. */
function gitStatus({ commits, branch }: Repo): Line[] {
  return [
    ...(branch
      ? [line(`On branch ${branch}`), line(`Your branch is up to date with 'origin/${branch}'.`)]
      : [line(`HEAD detached at ${commits[0]?.hash.slice(0, 7) ?? "HEAD"}`, "red")]),
    [],
    line("nothing to commit, working tree clean"),
  ];
}

/**
 * `git`: `log`, `status` and `help` (`-h`, `--help`); anything else gets
 * git's own answer to a command it doesn't have, with its suggestions.
 */
export function git(args: readonly string[], repo: Repo): Result {
  const command = args[0];
  // A bare `git` prints the usage, and exits 1.
  if (command === undefined) return { lines: gitUsage(), failed: true };
  if (command === "help" || command === "--help" || command === "-h") return { lines: gitUsage(), failed: false };
  if (command === "log") return { lines: gitLog(repo), failed: false };
  if (command === "status") return { lines: gitStatus(repo), failed: false };
  if (command.startsWith("-")) {
    return { lines: [line(`unknown option: ${command}`), line("usage: git [-h | --help] <command> [<args>]")], failed: true };
  }
  const similar = similarGitCommands(command);
  return {
    lines: [
      line(`git: '${command}' is not a git command. See 'git --help'.`),
      ...(similar.length
        ? [
            [],
            line(similar.length === 1 ? "The most similar command is" : "The most similar commands are"),
            ...similar.map((name) => line(`\t${name}`)),
          ]
        : []),
    ],
    failed: true,
  };
}

/** The groups `help` lists commands under, in its order. */
export const SECTIONS = ["Files", "Viewing", "System", "Shell"] as const;
export type Section = (typeof SECTIONS)[number];

/** What `help` needs to know about a command. */
export interface CommandInfo {
  name: string;
  aliases?: readonly string[];
  summary: string;
  section: Section;
}

/**
 * `help`: every command and what it does, straight from the registry, so a
 * command cannot be added without being listed. Grouped by section, sorted by
 * name in each, the summaries lined up across all of them.
 */
export function help(commands: readonly CommandInfo[]): Line[] {
  const width = Math.max(...commands.map((c) => c.name.length));
  const sorted = [...commands].sort((a, b) => a.name.localeCompare(b.name));
  const row = (c: CommandInfo): Line => [
    { text: `  ${c.name.padEnd(width)}  `, tone: "primary" },
    { text: c.summary },
    ...(c.aliases?.length ? [{ text: ` (also ${c.aliases.join(", ")})`, tone: "dim" as const }] : []),
  ];
  return [
    ...SECTIONS.flatMap((section) => {
      const listed = sorted.filter((c) => c.section === section);
      return listed.length ? [line(`${section}:`, "bold"), ...listed.map(row), []] : [];
    }),
    line("Tab completes · → or Tab takes the grey suggestion · ↑ ↓ history · Ctrl+L clears · q quits btop and jizi", "dim"),
  ];
}

/** The first entry of a folder, where jīzǐ puts its cursor on going in. */
export function firstEntry(tree: TreeNode[], folder: string): string | null {
  return listDir(tree, folder)?.[0]?.path ?? null;
}
