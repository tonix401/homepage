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

`App.tsx` owns the only piece of state: `selectedFile: FileNode | null`. It is passed down as props — no context or global store.

`Explorer` manages its own `openFolders: Set<string>` state (folder paths as keys). All folders start expanded. Clicking a folder toggles it; clicking a file calls `onSelect`.

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

### The embedding model (`minishlab/potion-base-4M`, vocab size, quantization)
- `scripts/prepare-semantic-model.ts` — `MODEL_ID`, `VOCAB_LIMIT`
- `src/utils/model2vec.fixture.json` — regenerate if the tokenizer or vocabulary
  changes, or `model2vec.test.ts` will fail against the old expectations
- `public/semantic/model.{json,bin}` — re-run `npm run prepare:semantic`
- `CLAUDE.md` — the Search section above

### Supported file types (`.py`, `.rs`, `.vue`, etc.)
- `src/services/types.ts` — `FileType` union type
- `src/services/FilesConverterService.ts` — `getFileType()` switch statement
- `src/services/FilesConverterService.ts` — `fileTypeToShikiLang` map
