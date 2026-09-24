import { type Plugin } from "vite";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve, extname } from "path";
import { type FileType, type MenuItem, type TreeNode } from "./types";
import {
  KNOWN_PLACEHOLDERS,
  detectUnknownPlaceholders,
  resolveConfigSearchBarText,
  transformHtml,
} from "../utils/pluginHelpers";
import { langHintToFileType } from "../utils/fileTypes";

export type { FileNode, FolderNode, MenuItem, TreeNode } from "./types";

export interface CustomActivityConfig {
  name: string;
  iconPath: string;
  title: string;
  text?: string;
  textFile?: string;
}

export interface OpenFolderPluginOptions {
  folderPath?: string;
  searchBarText?: string;
  rootFolderName?: string;
  websiteTitle?: string;
  faviconPath?: string;
  activities?: CustomActivityConfig[];
  menuItems?: MenuItem[];
  foldersFirst?: boolean;
  collapsedFolders?: string[];
}

const fileTypeToShikiLang: Partial<Record<FileType, string>> = {
  html: "@shikijs/langs/html",
  css: "@shikijs/langs/css",
  js: "@shikijs/langs/javascript",
  ts: "@shikijs/langs/typescript",
  tsx: "@shikijs/langs/typescript",
  jsx: "@shikijs/langs/javascript",
  md: "@shikijs/langs/markdown",
  py: "@shikijs/langs/python",
  json: "@shikijs/langs/json",
  yaml: "@shikijs/langs/yaml",
  rs: "@shikijs/langs/rust",
  go: "@shikijs/langs/go",
  sh: "@shikijs/langs/bash",
  php: "@shikijs/langs/php",
  rb: "@shikijs/langs/ruby",
  c: "@shikijs/langs/c",
  cpp: "@shikijs/langs/cpp",
  java: "@shikijs/langs/java",
  sql: "@shikijs/langs/sql",
  xml: "@shikijs/langs/xml",
  toml: "@shikijs/langs/toml",
  vue: "@shikijs/langs/html",
};

function collectFileTypes(nodes: TreeNode[]): Set<FileType> {
  const types = new Set<FileType>();
  for (const node of nodes) {
    if (node.kind === "file") {
      types.add(node.type);
      if (node.type === "md") {
        for (const lang of collectMdCodeFenceLangs(node.content))
          types.add(lang);
      }
    } else {
      for (const t of collectFileTypes(node.children)) types.add(t);
    }
  }
  return types;
}

function getFileType(fileName: string): FileType {
  return langHintToFileType(extname(fileName).slice(1));
}

export function collectMdCodeFenceLangs(content: string): FileType[] {
  const result: FileType[] = [];
  const seen = new Set<FileType>();
  const fence = /^`{3,}(\w+)/gm;
  let match;
  while ((match = fence.exec(content)) !== null) {
    const type = langHintToFileType(match[1]);
    if (type !== "unsupported" && !seen.has(type)) {
      seen.add(type);
      result.push(type);
    }
  }
  return result;
}

const SORT_PREFIX = /^\d+#/;
const FOLDER_STATE_PREFIX = /^(co|ex)#/;

function stripSortPrefix(name: string): string {
  return name.replace(SORT_PREFIX, "");
}

// A "co#"/"ex#" prefix on the folder itself is more specific than the
// collapsedFolders config, so it wins; without one, explicitOpen is undefined
// and the config decides.
function parseFolderName(name: string): {
  displayName: string;
  explicitOpen?: boolean;
} {
  const withoutOrder = stripSortPrefix(name);
  if (withoutOrder.startsWith("co#")) {
    return { displayName: withoutOrder.slice(3), explicitOpen: false };
  }
  if (withoutOrder.startsWith("ex#")) {
    return { displayName: withoutOrder.slice(3), explicitOpen: true };
  }
  return { displayName: withoutOrder };
}

export function normalizeFolderPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function collectFolderPaths(
  dirPath: string,
  prefix: string = "",
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const { displayName } = parseFolderName(entry.name);
    const path = prefix ? `${prefix}/${displayName}` : displayName;
    results.push(path);
    results.push(...collectFolderPaths(resolve(dirPath, entry.name), path));
  }
  return results;
}

/**
 * Every file path in the folder, spelled the way the explorer shows it — sort
 * prefixes stripped — so it can be compared against a configured `menuItems`
 * file. Contents are not read; this walk is for validation only.
 */
export function collectFilePaths(
  dirPath: string,
  prefix: string = "",
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const { displayName } = parseFolderName(entry.name);
      const path = prefix ? `${prefix}/${displayName}` : displayName;
      results.push(...collectFilePaths(resolve(dirPath, entry.name), path));
    } else {
      const displayName = stripSortPrefix(entry.name);
      results.push(prefix ? `${prefix}/${displayName}` : displayName);
    }
  }
  return results;
}

function findExtensionlessFiles(
  dirPath: string,
  relPath: string = "",
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(
        ...findExtensionlessFiles(resolve(dirPath, entry.name), entryRel),
      );
    } else {
      const displayName = stripSortPrefix(entry.name);
      if (!displayName.startsWith(".") && extname(displayName) === "") {
        results.push(entryRel);
      }
    }
  }
  return results;
}

function findMalformedPrefixes(
  dirPath: string,
  relPath: string = "",
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (
      /^\w+#/.test(entry.name) &&
      !SORT_PREFIX.test(entry.name) &&
      !FOLDER_STATE_PREFIX.test(entry.name)
    ) {
      results.push(entryRel);
    }
    if (entry.isDirectory()) {
      results.push(
        ...findMalformedPrefixes(resolve(dirPath, entry.name), entryRel),
      );
    }
  }
  return results;
}

function findInvalidFolderStatePrefixOrder(
  dirPath: string,
  relPath: string = "",
): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (/^(co|ex)#\d+#/.test(entry.name)) {
        results.push(entryRel);
      }
      results.push(
        ...findInvalidFolderStatePrefixOrder(
          resolve(dirPath, entry.name),
          entryRel,
        ),
      );
    }
  }
  return results;
}

function readTree(
  dirPath: string,
  collapsedFolders: ReadonlySet<string>,
  prefix: string = "",
): TreeNode[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);

      if (entry.isDirectory()) {
        const { displayName: folderName, explicitOpen } = parseFolderName(
          entry.name,
        );
        const folderPath = prefix ? `${prefix}/${folderName}` : folderName;
        nodes.push({
          kind: "folder",
          name: folderName,
          defaultOpen: explicitOpen ?? !collapsedFolders.has(folderPath),
          children: readTree(fullPath, collapsedFolders, folderPath),
        });
      } else {
        const displayName = stripSortPrefix(entry.name);
        const entryPath = prefix ? `${prefix}/${displayName}` : displayName;
        const type = getFileType(entry.name);
        nodes.push({
          kind: "file",
          name: displayName,
          path: entryPath,
          type,
          content: readFileSync(fullPath, "utf-8"),
        });
      }
    }

    return nodes;
  } catch (error) {
    console.error(
      `Error reading ${dirPath}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

function resolveActivityText(
  activity: CustomActivityConfig,
  root: string,
): { name: string; iconPath: string; title: string; text: string } {
  if (activity.textFile !== undefined) {
    const absPath = resolve(root, activity.textFile);
    return {
      name: activity.name,
      iconPath: activity.iconPath,
      title: activity.title,
      text: readFileSync(absPath, "utf-8"),
    };
  }
  return {
    name: activity.name,
    iconPath: activity.iconPath,
    title: activity.title,
    text: activity.text ?? "",
  };
}

export function openFolderPlugin(
  options: OpenFolderPluginOptions = {},
): Plugin {
  const {
    folderPath = "./src/open_folder",
    searchBarText = "Search files by name (⌘P)",
    rootFolderName = "WEBSITE",
    websiteTitle,
    faviconPath,
    activities = [],
    menuItems = [],
    foldersFirst = true,
    collapsedFolders = [],
  } = options;

  const collapsedFolderPaths = new Set(
    collapsedFolders.map(normalizeFolderPath),
  );

  const filesModuleId = "virtual:open-folder-files";
  const langsModuleId = "virtual:open-folder-langs";
  const configModuleId = "virtual:open-folder-config";
  const resolvedFilesId = "\0" + filesModuleId;
  const resolvedLangsId = "\0" + langsModuleId;
  const resolvedConfigId = "\0" + configModuleId;

  return {
    name: "vite-plugin-open-folder",

    buildStart() {
      const absFolder = resolve(folderPath);

      if (!existsSync(absFolder)) {
        this.error(
          `folderPath "${folderPath}" does not exist.\n` +
            `  This path resolves to: ${absFolder}\n` +
            `  Fix: Create that directory, or update folderPath in vite.config.ts to point at an existing folder.`,
        );
      } else if (!statSync(absFolder).isDirectory()) {
        this.error(
          `folderPath "${folderPath}" points to a file, not a folder.\n` +
            `  This path resolves to: ${absFolder}\n` +
            `  Fix: Update folderPath in vite.config.ts to point at a directory, not a file.`,
        );
      }

      if (rootFolderName.trim() === "") {
        this.warn(
          `rootFolderName is an empty string.\n` +
            `  The explorer sidebar will show the root folder with no label.\n` +
            `  Fix: Set it to a non-empty string, e.g. rootFolderName: "MY PROJECT".\n` +
            `  Or remove the option entirely — it defaults to "WEBSITE".`,
        );
      }

      if (searchBarText.trim() === "") {
        this.warn(
          `searchBarText is an empty string.\n` +
            `  The search bar will appear with no placeholder text.\n` +
            `  Fix: Set it to a non-empty string, e.g. searchBarText: "Search files (⌘P)".\n` +
            `  Or remove the option entirely — it defaults to "Search files by name (⌘P)".`,
        );
      }

      const unknownPlaceholders = detectUnknownPlaceholders(searchBarText);
      if (unknownPlaceholders.length > 0) {
        this.warn(
          `searchBarText contains unknown placeholder(s): ${unknownPlaceholders.join(", ")}\n` +
            `  These will appear as-is in the search bar instead of being replaced.\n` +
            `  Fix: Use only known placeholders: ${KNOWN_PLACEHOLDERS.join(", ")}`,
        );
      }

      if (
        faviconPath !== undefined &&
        !faviconPath.startsWith("/") &&
        !/^https?:\/\//.test(faviconPath)
      ) {
        this.warn(
          `faviconPath "${faviconPath}" is a relative path, which may not resolve correctly in the browser.\n` +
            `  Fix: Use a root-relative path starting with "/", e.g. "/favicon.svg".\n` +
            `  Or use a full URL starting with "https://".`,
        );
      }

      for (const activity of activities) {
        const label = activity.name.trim() || "(unnamed activity)";

        if (activity.name.trim() === "") {
          this.warn(
            `An activity has an empty "name".\n` +
              `  The tooltip and accessibility label will be blank.\n` +
              `  Fix: Set "name" to a non-empty string, e.g. name: "Search".`,
          );
        }

        if (activity.iconPath.trim() === "") {
          this.warn(
            `Activity "${label}" has an empty "iconPath".\n` +
              `  No icon will be shown in the activity bar.\n` +
              `  Fix: Set "iconPath" to a codicon name (e.g. "search") or an image path.`,
          );
        }

        if (activity.title.trim() === "") {
          this.warn(
            `Activity "${label}" has an empty "title".\n` +
              `  The panel header will be blank.\n` +
              `  Fix: Set "title" to a non-empty string, e.g. title: "SEARCH".`,
          );
        }

        if (activity.text === undefined && activity.textFile === undefined) {
          this.warn(
            `Activity "${label}" specifies neither "text" nor "textFile".\n` +
              `  The panel body will be empty.\n` +
              `  Fix: Add "text" with an inline Markdown string, or "textFile" with a path to a .md file.`,
          );
        }

        if (activity.text !== undefined && activity.textFile !== undefined) {
          this.warn(
            `Activity "${label}" specifies both "text" and "textFile".\n` +
              `  "textFile" will take precedence. Remove one of them.`,
          );
        }

        if (activity.textFile !== undefined) {
          const absTextFile = resolve(activity.textFile);
          if (!existsSync(absTextFile)) {
            this.error(
              `Activity "${label}" textFile "${activity.textFile}" does not exist.\n` +
                `  This path resolves to: ${absTextFile}\n` +
                `  Fix: Create the file or correct the path.`,
            );
          }
        }
      }

      const treeFiles = new Set(collectFilePaths(absFolder));

      for (const item of menuItems) {
        const itemLabel = item.label.trim() || "(unnamed menu item)";

        if (item.label.trim() === "") {
          this.warn(
            `A menu item has an empty "label".\n` +
              `  It will appear as a blank gap in the menu bar.\n` +
              `  Fix: Set "label" to a non-empty string, e.g. label: "Home".`,
          );
        }

        if (item.file !== undefined && item.url !== undefined) {
          this.warn(
            `Menu item "${itemLabel}" sets both "file" and "url".\n` +
              `  "url" will take precedence. Remove one of them.`,
          );
        }

        if (item.file === undefined && item.url === undefined) {
          this.warn(
            `Menu item "${itemLabel}" sets neither "file" nor "url".\n` +
              `  It will render as plain text instead of something to click.\n` +
              `  Fix: Add "file" with a path in the open folder, "file: null" for` +
              ` the default page, or "url" for a link off the site.`,
          );
        }

        if (
          item.file !== undefined &&
          item.file !== null &&
          !treeFiles.has(item.file)
        ) {
          this.warn(
            `Menu item "${itemLabel}" points at "${item.file}", which is not in the open folder.\n` +
              `  The editor would fall back to the first file and the browser would show its not-found page.\n` +
              `  Fix: Use the path as the explorer shows it (no sort prefixes), e.g. "legal/imprint.html".`,
          );
        }
      }

      if (collapsedFolderPaths.size > 0) {
        const existing = new Set(collectFolderPaths(absFolder));
        const unknown = [...collapsedFolderPaths].filter(
          (p) => !existing.has(p),
        );
        if (unknown.length > 0) {
          this.warn(
            `collapsedFolders lists folder(s) that do not exist:\n` +
              unknown.map((p) => `  ${p}`).join("\n") +
              "\n" +
              `  These entries have no effect.\n` +
              `  Fix: Use the path as the explorer shows it, without sort or state prefixes, e.g. "work experience" or "projects/demos".`,
          );
        }
      }

      const extensionless = findExtensionlessFiles(absFolder);
      if (extensionless.length > 0) {
        this.warn(
          `The following files have no extension and will be shown as plain text without syntax highlighting:\n` +
            extensionless.map((p) => `  ${p}`).join("\n") +
            "\n" +
            `  Fix: Add an extension that matches the file's content, e.g. rename "LICENCE" to "LICENCE.md".`,
        );
      }

      const malformed = findMalformedPrefixes(absFolder);
      if (malformed.length > 0) {
        this.warn(
          `The following files/folders have a malformed sort prefix (expected digits only before "#"):\n` +
            malformed.map((p) => `  ${p}`).join("\n") +
            "\n" +
            `  Fix: Use only digits before "#", e.g. rename "0a2#file.md" to "002#file.md".`,
        );
      }

      const invalidFolderState = findInvalidFolderStatePrefixOrder(absFolder);
      if (invalidFolderState.length > 0) {
        this.error(
          `Folder state prefixes must come after the numeric sort prefix, if present.\n` +
            `  Use "001#co#folder" or "001#ex#folder" (or omit the number).\n` +
            `  Invalid folder names:\n` +
            invalidFolderState.map((p) => `  ${p}`).join("\n"),
        );
      }
    },

    resolveId(id) {
      if (id === filesModuleId) return resolvedFilesId;
      if (id === langsModuleId) return resolvedLangsId;
      if (id === configModuleId) return resolvedConfigId;
    },

    load(id) {
      const absFolder = resolve(folderPath);
      const invalidFolderState = findInvalidFolderStatePrefixOrder(absFolder);
      if (invalidFolderState.length > 0) {
        throw new Error(
          `Folder state prefixes must come after the numeric sort prefix, if present.\n` +
            `  Use "001#co#folder" or "001#ex#folder" (or omit the number).\n` +
            `  Invalid folder names:\n` +
            invalidFolderState.map((p) => `  ${p}`).join("\n"),
        );
      }

      const tree = readTree(absFolder, collapsedFolderPaths);

      if (id === resolvedFilesId) {
        return `export default ${JSON.stringify(tree)};`;
      }

      if (id === resolvedLangsId) {
        const types = collectFileTypes(tree);
        const pkgs = [...new Set(
          [...types]
            .map((t) => fileTypeToShikiLang[t])
            .filter((p): p is string => p !== undefined),
        )];
        const imports = pkgs
          .map((pkg) => `  import(${JSON.stringify(pkg)})`)
          .join(",\n");
        return `export default [\n${imports}\n];`;
      }

      if (id === resolvedConfigId) {
        const resolvedSearchBarText = resolveConfigSearchBarText(
          searchBarText,
          rootFolderName,
          websiteTitle,
        );
        return [
          `export const searchBarText = ${JSON.stringify(resolvedSearchBarText)};`,
          `export const rootFolderName = ${JSON.stringify(rootFolderName)};`,
          `export const activities = ${JSON.stringify(activities.map((a) => resolveActivityText(a, process.cwd())))};`,
          `export const menuItems = ${JSON.stringify(menuItems)};`,
          `export const foldersFirst = ${JSON.stringify(foldersFirst)};`,
        ].join("\n");
      }
    },

    configureServer(server) {
      const absFolder = resolve(folderPath);
      const absTextFiles = activities
        .filter((a) => a.textFile !== undefined)
        .map((a) => resolve(a.textFile!));

      server.watcher.add(absFolder);
      for (const f of absTextFiles) server.watcher.add(f);

      server.watcher.on("all", (_event, changedPath) => {
        const inFolder = changedPath.startsWith(absFolder);
        const isTextFile = absTextFiles.includes(changedPath);
        if (!inFolder && !isTextFile) return;

        const ids = inFolder
          ? [resolvedFilesId, resolvedLangsId, resolvedConfigId]
          : [resolvedConfigId];

        for (const id of ids) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }

        server.ws.send({ type: "full-reload" });
      });
    },

    transformIndexHtml(html) {
      return transformHtml(html, websiteTitle, faviconPath);
    },
  };
}
