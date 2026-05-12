import type { FileType } from "./types";

export interface SetiIconData {
  char: string;
  color: string;
}

export function fileIconData(type: FileType): SetiIconData {
  switch (type) {
    case "html":   return { char: "", color: "#e37933" };
    case "css":    return { char: "", color: "#519aba" };
    case "js":     return { char: "", color: "#cbcb41" };
    case "ts":     return { char: "", color: "#519aba" };
    case "tsx":    return { char: "", color: "#519aba" };
    case "jsx":    return { char: "", color: "#519aba" };
    case "md":     return { char: "", color: "#519aba" };
    case "py":     return { char: "", color: "#519aba" };
    case "json":   return { char: "", color: "#cbcb41" };
    case "yaml":   return { char: "", color: "#a074c4" };
    case "rs":     return { char: "", color: "#6d8086" };
    case "go":     return { char: "", color: "#519aba" };
    case "sh":     return { char: "", color: "#8dc149" };
    case "php":    return { char: "", color: "#a074c4" };
    case "rb":     return { char: "", color: "#cc3e44" };
    case "c":      return { char: "", color: "#519aba" };
    case "cpp":    return { char: "", color: "#519aba" };
    case "java":   return { char: "", color: "#cc3e44" };
    case "sql":    return { char: "", color: "#f55385" };
    case "xml":    return { char: "", color: "#e37933" };
    case "toml":   return { char: "", color: "#6d8086" };
    case "vue":    return { char: "", color: "#8dc149" };
    case "svelte": return { char: "", color: "#cc3e44" };
    default:       return { char: "", color: "#d4d7d6" };
  }
}
