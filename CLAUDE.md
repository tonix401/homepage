# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc type-check + Vite production build
npm run lint       # ESLint
npm run preview    # serve the production build locally
```

No test suite is configured.

## Architecture

This is a React + Vite app that renders a read-only VSCode-like file viewer in the browser.

### Data pipeline

Files placed in `src/open_folder/` are read **at build/dev-server time** by a custom Vite plugin (`src/services/FilesConverterService.ts`) and exposed as the virtual module `virtual:open-folder-files`. The module exports a `TreeNode[]` — a recursive tree of `FileNode` (leaf with content) and `FolderNode` (directory with children). Subdirectories are supported and rendered as collapsible folders.

The virtual module type is declared in `src/vite-env.d.ts`. The canonical types live in `src/services/types.ts`.

### Component layout

```
App
├── Header          — title bar (filename, VSCode icon)
├── Sidebar
│   └── Explorer    — recursive file tree with collapsible folders
├── Content         — tab bar + line-number gutter + code area
└── Footer          — status bar (file type, line count, encoding)
```

`App.tsx` owns the only piece of state: `selectedFile: FileNode | null`. It is passed down as props — no context or global store.

`Explorer` manages its own `openFolders: Set<string>` state (folder paths as keys). All folders start expanded. Clicking a folder toggles it; clicking a file calls `onSelect`.

### Static assets

VSCode icons are in `public/images/` and referenced as `/images/<name>`. The project uses dark-variant SVGs (`*-dark.svg`) for folder and document icons, and `forward-tb.png` (rotated via CSS) as the expand/collapse caret.

### Styling

All component styles are in `src/App.css` using CSS custom properties defined at `:root` (colours, font, line height). `src/index.css` contains only the global box-sizing reset and `html/body/root` height rules. There is no CSS module or styled-components setup — class names are prefixed `vscode-` by convention.

## Keeping documentation in sync

When changing any of the following, update **all** listed locations together:

### Known placeholders (`$open_file`, `$root_folder_name`, etc.)
- `src/utils/pluginHelpers.ts` — `KNOWN_PLACEHOLDERS` array
- `src/utils/pluginHelpers.ts` — `resolveConfigSearchBarText()` (add/remove build-time replacement)
- `src/utils/searchBarText.ts` — `resolveSearchBarText()` (add/remove runtime replacement)
- `src/services/FilesConverterService.ts` — the unknown-placeholders warning text in `buildStart()`
- `documentation/CONFIGURATION.md` — the placeholders table under `searchBarText`

### Plugin options (`folderPath`, `searchBarText`, `faviconPath`, etc.)
- `src/services/FilesConverterService.ts` — `OpenFolderPluginOptions` interface
- `src/services/FilesConverterService.ts` — destructuring defaults in `openFolderPlugin()`
- `src/services/FilesConverterService.ts` — validation warnings/errors in `buildStart()`
- `documentation/CONFIGURATION.md` — the Options section (add/remove/update the option's entry)

### Supported file types (`.py`, `.rs`, `.vue`, etc.)
- `src/services/types.ts` — `FileType` union type
- `src/services/FilesConverterService.ts` — `getFileType()` switch statement
- `src/services/FilesConverterService.ts` — `fileTypeToShikiLang` map
