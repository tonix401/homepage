import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { BundledLanguage, SpecialLanguage } from "shiki";
import type { FileType } from "./types";
import langs from "virtual:open-folder-langs";

export type { ThemedToken } from "shiki";

export const highlighterReady = createHighlighterCore({
  themes: [import("@shikijs/themes/dark-plus")],
  langs,
  engine: createJavaScriptRegexEngine(),
});

export function langFromType(type: FileType): BundledLanguage | SpecialLanguage {
  switch (type) {
    case "html":   return "html";
    case "css":    return "css";
    case "js":     return "javascript";
    case "ts":     return "typescript";
    case "tsx":    return "typescript";
    case "jsx":    return "javascript";
    case "md":     return "markdown";
    case "py":     return "python";
    case "json":   return "json";
    case "yaml":   return "yaml";
    case "rs":     return "rust";
    case "go":     return "go";
    case "sh":     return "bash";
    case "php":    return "php";
    case "rb":     return "ruby";
    case "c":      return "c";
    case "cpp":    return "cpp";
    case "java":   return "java";
    case "sql":    return "sql";
    case "xml":    return "xml";
    case "toml":   return "toml";
    case "vue":    return "html";
    case "svelte": return "text";
    default:       return "text";
  }
}
