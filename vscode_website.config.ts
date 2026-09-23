import { type OpenFolderPluginOptions } from "./src/services/FilesConverterService";

export const configuration: OpenFolderPluginOptions = {
  folderPath: "./open_folder",
  rootFolderName: "TOM WEISE",
  searchBarText: "$website_title - $open_file",
  websiteTitle: "Tom Weise",
  faviconPath: "./blue_dot.svg",
  foldersFirst: false,
  collapsedFolders: ["work experience"],
  menuItems: [
    { label: "Github", url: "https://github.com/tonix401" },
    { label: "Experience", file: "work experience/eschbach.md" },
    { label: "Projects", file: "projects/Arch Desktop.md" },
    { label: "Imprint", file: "legal/imprint.html" },
    { label: "Privacy Policy", file: "legal/privacy.html" },
  ],
  activities: [
    {
      name: "Search", // The tooltip text for the activity button
      iconPath: "search", // The icon for the activity button (can be a codicon name or a file path)
      title: "SEARCH", // The title displayed in the panel header when this activity is active
      textFile: "./activities/search.md", // The text displayed below the title (markdown supported)
    },
    {
      name: "Source Control",
      iconPath: "source-control",
      title: "SOURCE CONTROL",
      textFile: "./activities/source-control.md",
    },
    {
      name: "Run and Debug",
      iconPath: "debug-alt",
      title: "RUN AND DEBUG",
      textFile: "./activities/run-and-debug.md",
    },
    {
      name: "Extensions",
      iconPath: "extensions",
      title: "EXTENSIONS",
      textFile: "./activities/extensions.md",
    },
  ],
};
