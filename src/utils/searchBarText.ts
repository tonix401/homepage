export function resolveSearchBarText(
  template: string,
  fileName: string | undefined,
  filePath: string | undefined,
): string {
  let result = template;
  const subFolder = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
  result = result.replace(/\$current_sub_folder/g, subFolder);
  if (result.includes("$open_file")) {
    return result.replace(/\$open_file/g, fileName ?? "").trim();
  }
  return result;
}
