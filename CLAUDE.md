# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc type-check + Vite production build
npm run lint       # ESLint
npm run preview    # serve the production build locally
npm test           # Vitest (single run); npm run test:watch to watch

npm run prepare:semantic   # regenerate public/semantic/ (needs network, see below)
```

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

`App.tsx` owns the route and the per-workspace window state; the selected file
is derived from the route. Everything is passed down as props — no context,
router library or global store.

`Explorer` manages its own `openFolders: Set<string>` state (folder paths as keys). Clicking a folder toggles it; clicking a file calls `onSelect`.

Which folders start expanded is decided at build time and carried on each
`FolderNode` as `defaultOpen`. Folders are open by default; the
`collapsedFolders` option lists paths (as the explorer shows them, so without
sort prefixes — `"work experience"`, `"projects/demos"`) that start closed
instead. A `co#`/`ex#` prefix on the folder name is more specific and overrides
the option. Selecting a file still expands its ancestors.

### Routing

The app lives at `/`; a query string says what it shows. `src/utils/route.ts`
(pure, tested) parses and formats it on top of the History API — there is no
router library:

| URL | Shows |
| --- | --- |
| `/` | the first file, maximized, on workspace 1 |
| `/?file=projects/Homelab.md` | that file, maximized |
| `/?file=projects/Homelab.md&state=window` | the editor as a floating window over the desktop (`.arch-window`) |
| `/?state=desktop&workspace=3` | the bare desktop, workspace 3 |
| `/?state=desktop&lang=roman` | the desktop, workspaces numbered `I`–`V` |

Defaults (`state=fullscreen`, `workspace=1`, `lang=cn`, the first file) are
left out, so the home page stays `/`. Parsing is forgiving by design: order does not
matter, an unknown or missing value takes its default, and the address bar is
rewritten to the canonical form with `replaceState` — which is also how a
legacy `/#projects%2FHomelab.md` link and a file that has left the tree are
absorbed. `file` is only read alongside an open window; the desktop has none.

Workspaces are 1-based, matching the numbers the Waybar shows
(`WORKSPACE_COUNT` there and the glyph sets in `Waybar.tsx` must agree).
`lang` picks which numerals those are — `WORKSPACE_LANGUAGES` in `route.ts`
names them and `WS_LANGUAGES` in `Waybar.tsx` supplies a glyph set per name,
so adding one means touching both. It is a property of the bar rather than of
a workspace, so the keyboard segment that cycles it changes nothing else. A
file path keeps its slashes in the URL and escapes everything else, because
slashes are legal in a query value and `%2F` is unreadable.

Keeping every URL at `/` is load-bearing for content: files in `open_folder/`
write their asset URLs relative to the site root (`eschbach/logo.jpg` →
`public/eschbach/logo.jpg`), which only holds while the document URL is the
root. `index.html` still sets `<base href="%BASE_URL%">` and `vite.config.ts`
still copies `index.html` to `dist/404.html`; neither is needed to reach a
route, both keep a mistyped or stale deep path (`/resume`) rendering the app
rather than the GitHub Pages error page. Links *between* files in
`open_folder/` are relative to the linking file (`projects/Arch Desktop.md`
from the root README) and are followed in-app, without a page load.

One editor window exists at a time. `App` remembers what each workspace held,
so switching away and back restores it; closing the window drops that entry.
The header's maximize button flips `fullscreen` ⇄ `window`; close and minimize
both dismiss the window to the desktop. With `showDesktop: false` every route
collapses onto `fullscreen` and the window buttons do nothing.

### Waybar

Most of the bar's modules are decoration with a fixed value. The cpu and
memory ones are real measurements, taken by `src/utils/systemStats.ts`.

Both are the *tab's* numbers, not the machine's, because nothing a page can
call reports what other processes are doing. The modules' tooltips say so.

`cpu` is main-thread busyness: the event loop is checked in on ten times a
second and the lag it accumulates over a window is the share of that second
it spent running something else. It reads a few percent idle and climbs when
the page actually works. Do not try to infer the machine's load by timing a
fixed arithmetic probe against its fastest-ever run — that was the first
attempt here and it measures CPU frequency scaling, since an idle core clocks
down and runs the probe *slower*; it sat at ~57% on a machine idling at 4%.

Memory is `performance.memory.usedJSHeapSize`, so it reads in the tens of MB
rather than anything like the system figure a real bar shows; there is no
browser API for system RAM usage, and `navigator.deviceMemory` (the fallback)
is device *total*, rounded to a power of two and capped at 8. Both APIs are
Chromium-only, and the module hides itself when neither answers.

Samples taken while the tab is hidden, and the first one after it comes back,
are discarded — a throttled timer's lag is the browser's, not the machine's,
and would otherwise read as 100%.

The readings change every second, so `.wb-stat-value` in `Waybar.css`
reserves the width of the widest value; without it every segment to the right
shifts along the bar on each sample.

### Search

The header search bar is a quick-open (`src/components/QuickOpen.tsx`) with two
layers:

1. **Lexical** — `src/utils/search.ts`, a pure linear scan of file paths (fuzzy
   subsequence) and file contents (substring). The corpus is a handful of files
   already in memory, so there is no index, worker or debounce.
2. **Semantic** — a [model2vec](https://github.com/MinishLab/model2vec) static
   embedding model (`minishlab/potion-base-4M`) running in the browser. Static
   embeddings are a token -> vector lookup table, so "inference" is tokenize,
   mean-pool, normalize — no ONNX, no WASM, and the site stays fully static.

Semantic hits appear in a separate "Related" section, and **only when lexical
search returns fewer than `LEXICAL_ENOUGH` hits**. That gate is deliberate:
measured on this corpus an off-topic query still reaches ~0.38 cosine while a
fair question can sit at ~0.24, so the score cannot be used to decide relevance.
It ranks well; it does not separate on-topic from off-topic. Alongside good
exact matches the suggestions would be noise — in place of an empty result list
they are the whole point.

Pipeline:

- `scripts/prepare-semantic-model.ts` downloads the model, prunes the 29,528
  token vocabulary to the most frequent 16k plus every token in the corpus,
  quantizes to int8, and writes `public/semantic/model.{json,bin}` (~2.1 MB).
  **That output is committed**, so CI builds need no network. Re-run it after
  adding content with a lot of new vocabulary.
- The open-folder plugin chunks every file (`src/utils/chunk.ts`), embeds each
  passage at build time with that same committed table, subtracts the corpus
  mean, and emits `virtual:open-folder-embeddings`. Document vectors therefore
  always match the current content without re-running the script.
- `src/services/semantic.ts` lazily fetches the table on first interaction with
  the search box, centers the query by the shipped mean, and ranks by cosine.
- `src/utils/model2vec.ts` is the shared inference core, used by both the Node
  build step and the browser. Its tokenizer is a port of HuggingFace's
  `BertNormalizer` + `BertPreTokenizer` + `WordPiece`; `model2vec.test.ts`
  checks it against 54 tokenizations captured from the Python library, because
  query and document vectors must come from the same tokenizer to be
  comparable.

Semantic search disables itself (with a build warning) when
`public/semantic/model.bin` is absent; lexical search still works.

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

Note: `documentation/CONFIGURATION.md` does not exist in this fork; skip it.

### The embedding model (`minishlab/potion-base-4M`, vocab size, quantization)
- `scripts/prepare-semantic-model.ts` — `MODEL_ID`, `VOCAB_LIMIT`
- `src/utils/model2vec.fixture.json` — regenerate if the tokenizer or vocabulary
  changes, or `model2vec.test.ts` will fail against the old expectations
- `public/semantic/model.{json,bin}` — re-run `npm run prepare:semantic`
- `CLAUDE.md` — the Search section above

### The URL scheme (`/?file=…&state=…&workspace=…`)
- `src/utils/route.ts` — `parseRoute()`/`formatRoute()`, the defaults, `WORKSPACE_COUNT`, `WORKSPACE_LANGUAGES`
- `src/utils/route.test.ts` — the round-trip and rejection cases
- `vscode_website.config.ts` — `menuItems` hrefs that point at a file
- `CLAUDE.md` — the Routing section above

### Supported file types (`.py`, `.rs`, `.vue`, etc.)
- `src/services/types.ts` — `FileType` union type
- `src/services/FilesConverterService.ts` — `getFileType()` switch statement
- `src/services/FilesConverterService.ts` — `fileTypeToShikiLang` map
