import { KNOWN_PLACEHOLDERS } from "./pluginHelpers";

/**
 * `$root_folder_name` and `$website_title` are substituted by the plugin at
 * build time, so they should never reach here. One that does came from a
 * source the plugin does not resolve, and showing the raw token in the search
 * bar is worse than showing nothing.
 */
const BUILD_TIME_PLACEHOLDERS = /\$root_folder_name|\$website_title/g;

const hasPlaceholder = (template: string) =>
  KNOWN_PLACEHOLDERS.some((placeholder) => template.includes(placeholder));

export function resolveSearchBarText(
  template: string,
  fileName: string | undefined,
  filePath: string | undefined,
): string {
  // A template that names no placeholder is a plain label, so it gives way to
  // the open file rather than sitting there ignoring it.
  if (!hasPlaceholder(template)) return fileName ?? template;

  const subFolder = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
  const result = template
    .replace(/\$current_sub_folder/g, subFolder)
    .replace(BUILD_TIME_PLACEHOLDERS, "");

  if (result.includes("$open_file")) {
    return result.replace(/\$open_file/g, fileName ?? "").trim();
  }
  return result;
}
