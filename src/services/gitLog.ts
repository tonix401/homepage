/**
 * Every commit in the repository, read at build time and exposed as the
 * virtual module `virtual:git-log` for the Source Control panel.
 *
 * Outside a git checkout, or where git is missing, the list is empty rather
 * than the build failing: the panel then says there is no history. CI checks
 * out the full history (`fetch-depth: 0`), so the deployed list is complete.
 *
 * In the dev server a commit reloads the page: `.git` is outside Vite's
 * watcher, so the reflog is polled instead.
 */
import { execFileSync } from "node:child_process";
import { unwatchFile, watchFile } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export interface Commit {
  hash: string;
  subject: string;
  author: string;
  /** ISO 8601, committer date. */
  date: string;
}

/**
 * Fields are split by the unit separator and records by the record separator,
 * which no commit subject contains, so a `|` or a newline in one is harmless.
 */
const FIELD = "\x1f";
const RECORD = "\x1e";
export const LOG_FORMAT = ["%H", "%s", "%an", "%cI"].join("%x1f") + "%x1e";

export function parseLog(output: string): Commit[] {
  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, author, date] = record.split(FIELD);
      return { hash, subject, author, date };
    });
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function readLog() {
  const log = git(["log", `--format=${LOG_FORMAT}`]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  return {
    commits: log ? parseLog(log) : [],
    // A detached HEAD names no branch, only itself.
    branch: branch && branch !== "HEAD" ? branch : null,
  };
}

export function gitLogPlugin(): Plugin {
  const moduleId = "virtual:git-log";
  const resolvedId = "\0" + moduleId;
  return {
    name: "git-log",
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      const { commits, branch } = readLog();
      return [
        `export const commits = ${JSON.stringify(commits)};`,
        `export const branch = ${JSON.stringify(branch)};`,
      ].join("\n");
    },
    configureServer(server) {
      const reflog = git(["rev-parse", "--git-path", "logs/HEAD"])?.trim();
      if (!reflog) return;
      const path = resolve(reflog);
      watchFile(path, { interval: 1000 }, () => {
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
      server.httpServer?.on("close", () => unwatchFile(path));
    },
  };
}
