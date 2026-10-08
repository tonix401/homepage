import { type OpenFolderPluginOptions } from "./src/services/FilesConverterService.ts";
import { type SeoOptions } from "./src/services/seo.ts";

export const configuration: OpenFolderPluginOptions = {
  folderPath: "./open_folder",
  rootFolderName: "TOM WEISE",
  searchBarText: "$website_title - $open_file",
  websiteTitle: "Tom Weise",
  faviconPath: "/general/blue_dot.svg",
  foldersFirst: false,
  collapsedFolders: ["work experience"],
  defaultFile: "README.md", // Opens first, though "99#" sorts it last in the tree
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
      panel: "search", // Searches every file's contents, like VSCode's Search view
    },
    {
      name: "Source Control",
      iconPath: "source-control",
      title: "SOURCE CONTROL",
      panel: "source-control", // The site's own latest commits, read from git at build time
    },
    {
      name: "Run and Debug",
      iconPath: "debug-alt",
      title: "RUN AND DEBUG",
      panel: "run-and-debug", // Starts Eruda, a DevTools drawn inside the page
    },
    {
      name: "Extensions",
      iconPath: "extensions",
      title: "EXTENSIONS",
      textFile: "./activities/extensions.md",
    },
  ],
};

/** What search engines and link previews are told; see src/services/seo.ts. */
export const seo: SeoOptions = {
  title: "Tom Weise",
  description:
    "Tom Weise, web developer and dual informatics student at DHBW Lörrach. Projects, work experience and skills in an Arch Linux desktop in your browser.",
  image: "og-image.png",
  imageAlt: "An Arch Linux desktop with the site's README open in Codium",
  locale: "en_US",
  contentDir: "./open_folder",
  person: {
    name: "Tom Weise",
    jobTitle: "Web Developer",
    worksFor: { "@type": "Organization", name: "eschbach GmbH", url: "https://www.eschbach.com/" },
    affiliation: { "@type": "CollegeOrUniversity", name: "DHBW Lörrach", url: "https://dhbw-loerrach.de/" },
    knowsAbout: ["TypeScript", "React", "Vite", "C#", "Entity Framework", "Docker", "Arch Linux"],
    knowsLanguage: ["de", "en", "ja", "zh"],
    sameAs: ["https://github.com/tonix401"],
  },
};
