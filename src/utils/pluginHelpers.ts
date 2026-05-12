export const KNOWN_PLACEHOLDERS = [
  "$open_file",
  "$root_folder_name",
  "$website_title",
  "$current_sub_folder",
] as const;

export function resolveConfigSearchBarText(
  searchBarText: string,
  rootFolderName: string,
  websiteTitle: string | undefined,
): string {
  return searchBarText
    .replace(/\$root_folder_name/g, rootFolderName)
    .replace(/\$website_title/g, websiteTitle ?? "");
}

export function detectUnknownPlaceholders(searchBarText: string): string[] {
  return (searchBarText.match(/\$\w+/g) ?? []).filter(
    (p) => !(KNOWN_PLACEHOLDERS as readonly string[]).includes(p),
  );
}

export function transformHtml(
  html: string,
  websiteTitle: string | undefined,
  faviconPath: string | undefined,
): string {
  let result = html;
  if (websiteTitle !== undefined) {
    result = result.replace(
      /<title>[^<]*<\/title>/,
      `<title>${websiteTitle}</title>`,
    );
  }
  if (faviconPath !== undefined) {
    result = result.replace(
      /<link rel="icon"[^>]*\/?>/,
      `<link rel="icon" type="image/svg+xml" href="${faviconPath}" />`,
    );
  }
  return result;
}
