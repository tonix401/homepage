import type { FileType } from "../services/types";

// Maps a file extension or fenced-code-block language hint to a FileType.
// Handles both short extensions ("ts", "yml") and full language names
// ("typescript", "yaml") so it can be used by both the build-time plugin
// and the browser-side code block renderer.
export function langHintToFileType(hint: string): FileType {
  switch (hint.toLowerCase()) {
    case "html":                          return "html";
    case "css":                           return "css";
    case "js":
    case "javascript":                    return "js";
    case "ts":
    case "typescript":                    return "ts";
    case "tsx":                           return "tsx";
    case "jsx":                           return "jsx";
    case "md":
    case "markdown":                      return "md";
    case "py":
    case "python":                        return "py";
    case "json":                          return "json";
    case "yml":
    case "yaml":                          return "yaml";
    case "rs":
    case "rust":                          return "rs";
    case "go":
    case "golang":                        return "go";
    case "sh":
    case "bash":
    case "shell":                         return "sh";
    case "php":                           return "php";
    case "rb":
    case "ruby":                          return "rb";
    case "c":
    case "h":                             return "c";
    case "cpp":
    case "hpp":
    case "c++":                           return "cpp";
    case "java":                          return "java";
    case "sql":                           return "sql";
    case "xml":                           return "xml";
    case "toml":                          return "toml";
    case "vue":                           return "vue";
    case "svelte":                        return "svelte";
    default:                              return "unsupported";
  }
}
