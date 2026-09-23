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
├── ArchDesktop            — wallpaper + desktop chrome
│   ├── Waybar             — the bar: modules, workspace pills, launcher button
│   ├── ArchStrip          — the scrolling row of windows
│   │   └── .arch-column   — one window: APPS[app].render(…)
│   └── Launcher           — the centred <dialog> app launcher
└── (maximized)            — one window, rendered bare, no desktop

EditorApp                  — the VSCode window, one instance per column
├── Header                 — title bar (menu, quick open, window buttons)
├── ActivityBar
├── Sidebar
│   └── Explorer           — recursive file tree with collapsible folders
├── Content                — tab bar + breadcrumb + FileView
└── Footer                 — status bar (file type, line count, encoding)

BrowserApp                 — the browser window, one instance per column
├── tab strip / toolbar
├── BookmarkBar            — the open folder as folders, plus `menuItems`
└── FileView               — the same body renderer the editor uses
```

`App.tsx` owns one `Desktop` object and nothing else: it is the window
manager. **Everything about one window lives in that window's app component** — the active panel, the explorer's open folders,
the quick-open query, the browser's back/forward trail — so two editors side by
side are genuinely two editors. Everything is passed down as props; there is no
context, router library or global store.

`src/components/FileView.tsx` renders a file's body (highlighted source,
markdown, or the sandboxed HTML preview) with no editor chrome around it, which
is what lets the browser show the same page the editor does. `Content.tsx` is
the chrome — tab bar, preview/code toggle, breadcrumb — wrapped around it.

`Explorer` manages its own `openFolders: Set<string>` state (folder paths as keys). Clicking a folder toggles it; clicking a file calls `onSelect`.

Which folders start expanded is decided at build time and carried on each
`FolderNode` as `defaultOpen`. Folders are open by default; the
`collapsedFolders` option lists paths (as the explorer shows them, so without
sort prefixes — `"work experience"`, `"projects/demos"`) that start closed
instead. A `co#`/`ex#` prefix on the folder name is more specific and overrides
the option. Selecting a file still expands its ancestors.

### Desktop state

**Nothing is in the URL.** The address bar stays `/` however many windows are
open, on every workspace, in every language. The whole desktop is one object in
`src/utils/desktop.ts`, mirrored to `sessionStorage` by `src/utils/session.ts`,
and that is the only thing a reload has to restore:

```ts
interface Desktop {
  workspace: number;                          // the one on screen, 1-based
  language: WorkspaceLanguage;                // which numerals the bar shows
  fullscreen: boolean;                        // is the focused window maximized
  workspaces: Record<number, WorkspaceRecord>; // { windows: WindowId[], focus }
  windows: Record<WindowId, WindowRecord>;     // { id, app, arg }
}
```

Windows are stored once, in `windows`, and each workspace holds an ordered list
of their ids. That is what makes identity primary: a window is created when it
opens and lives until it closes, rather than being rebuilt whenever something
about its container changes.

`focus` is a property of the **workspace**, not of the desktop. There is one
focused window at a time — `focusedId(desktop)` derives it — but storing it
globally would leave it naming an off-screen window the moment you switch
workspaces, and switching back would have to guess. `fullscreen` *is* global,
so maximizing follows you across workspaces; rendering guards on
`fullscreen && focusedWindow`, so an empty workspace falls back to the desktop.

A `WindowId` is `editor-a3f9c1`: the app's own id, then six random hex digits.
**The prefix is decoration for a human reading storage and nothing parses it**
— `app` is a field of its own, so the two can never disagree, and renaming an
app does not invalidate every stored window. It is random rather than a counter
because ids now outlive the page: a counter would restart at 1 on reload and
hand a fresh window the id of a restored one.

Splitting windows out of their workspace makes three things breakable that a
plain array made unrepresentable:

- every id in a workspace's list has a record in `windows`
- every record in `windows` is listed by exactly one workspace
- `focus` is `null`, or an id in that workspace's own list

The reducers maintain all three by construction, so `repairDesktop` runs at the
one place they can arrive broken: a stored session, which may be hand-edited,
half-written, or left by an older build. It repairs rather than rejects — one
dangling id should cost you that window, not your whole desktop.

`session.ts` validates *shapes* (is this JSON a desktop at all) and hands the
result to `repairDesktop` for consistency. It stays `sessionStorage` on
purpose: per tab, so two tabs are two independent desktops that cannot clobber
each other's writes, and a layout does not outlive the visit that built it. A
first visit, or a session from an older shape, gets `defaultDesktop()` — one
editor on the first file, maximized. Bump `SESSION_KEY` when the shape changes.

Stale payloads are not `session.ts`'s problem: it must not import the file
tree, so `App` maps every restored window through `AppDefinition.normalizeArg`,
and a file that has left the tree degrades rather than leaving a blank window.

Workspaces are 1-based, matching the numbers the Waybar shows
(`WORKSPACE_COUNT` there and the glyph sets in `Waybar.tsx` must agree).
`language` picks which numerals those are — `WORKSPACE_LANGUAGES` in
`desktop.ts` names them and `WS_LANGUAGES` in `Waybar.tsx` supplies a glyph set
per name, so adding one means touching both. It is a property of the bar rather
than of a workspace, so the segment that cycles it changes nothing else.

Keeping the document at `/` is load-bearing for content: files in
`open_folder/` write their asset URLs relative to the site root
(`eschbach/logo.jpg` → `public/eschbach/logo.jpg`), which only holds while the
document URL is the root — and now it always is. `index.html` still sets
`<base href="%BASE_URL%">` and `vite.config.ts` still copies `index.html` to
`dist/404.html`; neither is needed to reach a route, both keep a mistyped or
stale deep path (`/resume`) rendering the app rather than the GitHub Pages
error page.

Configured `menuItems` are **not links**. A `file` item is a button that calls
`setArg` on the window its menu belongs to, so it changes that window and loads
no page; only a `url` item is a real anchor, and it opens a tab. Links *between*
files in `open_folder/` are relative to the linking file (`projects/Arch
Desktop.md` from the root README) and are followed the same way.

Each workspace holds a strip of windows, so switching away and back restores
what was there; closing the last window on a workspace leaves the bare desktop.
There is no minimize: nothing on this desktop holds a minimized window, so a
button for it would only be a second close.

### Waybar

Most of the bar's modules are decoration with a fixed value. The cpu and
memory ones are real measurements, taken by `src/utils/systemStats.ts`.

Three segments do something. The Arch mark opens Codium — maximized, on its
default page, reusing the focused window when that is already an editor rather
than stacking up more; the window-title segment reports the focused window
(`AppDefinition.title`) and opens the launcher; the keyboard segment cycles the
numerals (`WORKSPACE_LANGUAGES` lives in `src/utils/desktop.ts`).

**Nothing in the bar has a `title`.** Every label is an `aria-label`, so the bar
carries no native tooltips at all; the three that are not on a button — the cpu
and memory modules and the clock — need a `role="img"` beside the label, or a
bare `span` takes no accessible name. The window chrome inside the apps still
uses tooltips; this is the bar's rule, not the site's.

Each workspace pill carries its numeral and one app icon per open window, up to
`WS_MAX_ICONS` (3). A strip may hold more (`MAX_WINDOWS`), and past three the
pill stops naming them: showing the first three of five would claim the
workspace holds three, so a single "several windows" glyph stands in and the
pill's aria-label gives the count — which, under the `cn` or `roman` numerals,
is also the only place the workspace's number exists at all. A button's `width: auto` cannot be transitioned, so
`.wb-ws-apps` is given an explicit width derived from how many icons there are
and animates *that*; the pill's own width follows. The spin that swaps the
numerals is scoped to `.wb-ws-spinning .wb-ws-glyph` on purpose — the numerals
turn, the app icons beside them do not.

`.wb-center` is centred absolutely rather than by the bar's `space-between`:
the pill's width now changes whenever a window opens or closes, and under
`space-between` that would drag it back and forth along the bar on every
change. It can then overlap the side clusters instead of pushing them, which
is why the breakpoints matter.

At 1600px the **decoration gives way, not the pill**: the grey and pink groups
(`.wb-on-secondary`, `.wb-on-tertiary` — cpu/memory and music on the left,
bluetooth/wifi and volume/brightness on the right) collapse to `width: 0`, and
their powerline separators close up into a run of bare tails and arrow tips.
`min-width: 0` goes with the `width: 0`, or a flex item's automatic minimum
size keeps each segment as wide as its text. That buys about 500px, and only
below 1150px does `.wb-center` hide outright — the window title is capped at
260px, which puts the left cluster at 438px at its widest, so the pill's half
plus the gutter stops fitting around there.

Both are the *tab's* numbers, not the machine's, because nothing a page can
call reports what other processes are doing. The modules' labels say so.

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

### Window manager

The desktop lays windows out the way niri does: one horizontal strip per
workspace, scrolled rather than tiled to fit. `columnFraction` in
`src/utils/desktop.ts` is the whole rule — one window fills the viewport,
two or more take half of it each — so opening a third pushes the first off the
left edge and `.arch-strip` scrolls.

`.arch-strip` is a real `overflow-x: scroll` container, not a translated row.
That buys trackpad, shift-wheel, touch and keyboard scrolling and a draggable
scrollbar for none of the wheel, drag and thumb code a transform would need. It
is `scroll` rather than `auto` so the gutter is always reserved and the columns
do not change height when a second window opens.

**Closing a column does not snap the survivors across the gap.** A plain
flex-basis transition would: `--strip-fraction` lives on the strip, so when two
windows become one the survivor is child #0 — pinned to the left gutter — from
the first frame, while its width is still growing from a half. `ArchStrip`
FLIPs instead, putting each survivor back where it was with a `translateX` and
letting that animate to zero. `.arch-column` therefore transitions `transform`
at *exactly* `flex-basis`'s duration and easing: the two interpolating in step
is what holds the widening column's right edge still, so it grows leftward into
the space instead of jumping there. Only a close animates — an opening column
has its own `arch-column-in` keyframe, whose transform would fight it — and
`prefers-reduced-motion` skips it entirely.

Where a focus change scrolls to is `scrollShiftFor` — the minimal shift that
brings a column fully inside the strip's gutter, or none if it is already
there. `scrollIntoView({ inline: "nearest" })` would be the one-line version,
but it picks the alignment itself and cannot be tested; the arithmetic can.
The first run after mount is instant, because arriving on a route is not a
journey worth animating, and so is every run under `prefers-reduced-motion`.

**Focus follows the mouse**, and a deliberate focus change scrolls the view —
but focus that merely followed the pointer does not, or brushing past a
half-visible column on the way somewhere else would haul the whole strip along.
`ArchStrip` uses `mousemove` rather than `mouseenter`, because a column sliding
under a still cursor (which happens every time the strip scrolls) has not been
pointed at and must not steal focus from the window just opened. A press
focuses too, for touch, on the capture phase and without preventing anything,
so the control underneath still gets its click.

**The view never sets focus.** Nothing listens to `scroll`, so reading along
the strip by hand leaves focus where it was. That is the point of a scrolling
layout and the first thing a later change is tempted to "fix".

**Any window can be maximized at any time**, however many share its workspace;
`fullscreen` is simply whether the focused one fills the viewport. A maximized
window renders bare, covering the bar, so **every app must put a restore button
in its own title bar** — that is the only way back to the strip, and an app
without one strands the workspace. Both current apps have one (`Header`'s
maximize button, `.brw-winbtn` in the browser's tab strip), and a third app
needs one too.

Maximizing takes focus with it: the button belongs to a particular window, so
pressing it on an unfocused one must maximize *that* window rather than
whichever happened to have focus.

`openWindow` always leaves the strip tiled. Opening onto an empty workspace
must not go fullscreen or the bar the launcher lives on disappears with the
desktop, and opening beside an existing window should show you what you opened
and where it landed. Maximizing it again is one click away.

The bar's Arch mark is the one exception, and it is one because it composes
rather than because the rule bends: `App`'s `handleHome` calls `setFullscreen`
*after* `openWindow`, at that single call site. Anything else that wants to open
maximized should do the same — the reducer keeps its rule.

`closeWindow` is the mirror of that rule: closing the window that filled the
viewport leaves the strip rather than handing its fullscreen to whichever
window inherits focus — nothing asked for *that* one to be maximized, and the
bar would stay hidden. Closing anything else leaves the flag alone, so a column
closing on another workspace cannot restore a maximized window you cannot see.

Every reducer returns the *same object* when nothing changed — `focusWindow` on
the focused window, `setArg` with the payload it already has — so a pointer
crossing a column it has already focused re-renders nothing.

Window identity (`WindowRecord.id`) is the React key, and a window keeps it for
as long as it is open: `setArg` replaces the payload in place, and no part of
the desktop is ever re-derived from a serialized form while the page is up.
Nothing reconciles anything, because nothing is reparsed.

One thing still remounts a window: toggling fullscreen. `App` returns the
maximized window bare and the tiled one inside `ArchDesktop`, so the root
element type changes and React tears the subtree down, losing that window's
active panel, expanded folders and browser trail. Rendering one tree with a
modifier class would fix it for every app at once.

### Apps

An app is an `AppDefinition` in `src/apps/registry.tsx`: an id, a name, how it
titles itself, how it cleans up a payload that came back out of storage, and
how it renders into a column. A window is `{ app, arg }` and nothing more;
`arg` is app-defined, and both current apps read it as a file path.

Everything an app may do to its own window arrives as a `WindowHandle`
(`setArg`, `close`, `toggleFullscreen`, `focus`, `open`), so no app ever reaches
the desktop — or any window but its own. Each handle closes over its own id, so
a button always acts on the window it is in, never on whichever one happens to
have focus. `render` must return an element of a *stable* component type — an
inline closure would be a new type on every render, and React would remount the
window and lose its state.

`src/apps/ids.ts` is deliberately a leaf with no imports: `session.ts` has to
validate an app id without pulling in the registry, and with it React and the
whole app tree. `icons.ts` is a leaf for the same reason —
the Waybar and the launcher draw app icons without importing app components.

The browser's back and forward are its own, kept out of `window.history` on
purpose — nothing on this desktop writes history at all. Its buttons replay the
window's own trail through `setArg`.

Its bookmarks bar has two halves, both derived by `src/utils/bookmarks.ts`: the
open folder itself — root files as bookmarks, folders as dropdowns, nested as
deeply as the folder is — and then the configured `menuItems`. `FolderNode`
carries no path, so `bookmarksFromTree` threads the prefix down exactly as
`Explorer` does.

**The dropdowns are portalled to `document.body`.** Rendering them in place
would clip them to a 30px strip, because `.brw-bookmarks` is `overflow: hidden`
so a bar wider than the window truncates rather than wrapping; and
`position: fixed` alone would not save them either, since `.arch-column`'s open
animation uses a `transform`, which makes the column a containing block for
fixed children while it runs. The consequence to remember is that a portalled
menu is rendered *outside* `.brw-layout`, so the `--brw-*` palette is declared
on `:root` — scoped to the layout it would resolve to nothing and the menus
would come out transparent.

**Adding an app:** an id in `src/apps/ids.ts`, an icon and name in
`src/apps/icons.ts`, a definition folder under `src/apps/`, and an entry in
`APPS`/`LAUNCHABLE`. Nothing in the desktop model, the strip or the bar changes. The
one thing the window manager cannot supply is a restore button — give the app
its own, or a maximized window of it has no way back to the strip.

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
- `src/services/types.ts` — the `MenuItem` / `CustomActivity` shapes an option carries
- `src/vite-env.d.ts` — the `virtual:open-folder-config` declaration
- `documentation/CONFIGURATION.md` — the Options section (add/remove/update the option's entry)

Note: `documentation/CONFIGURATION.md` does not exist in this fork; skip it.

### The embedding model (`minishlab/potion-base-4M`, vocab size, quantization)
- `scripts/prepare-semantic-model.ts` — `MODEL_ID`, `VOCAB_LIMIT`
- `src/utils/model2vec.fixture.json` — regenerate if the tokenizer or vocabulary
  changes, or `model2vec.test.ts` will fail against the old expectations
- `public/semantic/model.{json,bin}` — re-run `npm run prepare:semantic`
- `CLAUDE.md` — the Search section above

### The desktop shape (`Desktop`, `WorkspaceRecord`, `WindowRecord`)
- `src/utils/desktop.ts` — the types, the reducers, `repairDesktop`, `WORKSPACE_COUNT`, `WORKSPACE_LANGUAGES`, `MAX_WINDOWS`
- `src/utils/session.ts` — the shape validation, and `SESSION_KEY` (bump it whenever the stored shape changes)
- `src/utils/desktop.test.ts` — the reducer and invariant cases
- `src/utils/session.test.ts` — the round-trip and rejection cases
- `CLAUDE.md` — the Desktop state section above

### The app registry (`editor`, `browser`, …)
- `src/apps/ids.ts` — `APP_IDS`, `DEFAULT_APP`
- `src/apps/icons.ts` — `APP_ICONS`, `APP_NAMES`
- `src/apps/registry.tsx` — `APPS` and the launcher's `LAUNCHABLE` order
- `src/apps/types.ts` — the `AppDefinition` / `WindowHandle` contract
- `src/utils/session.ts` — bump `SESSION_KEY` when an app id is renamed or dropped
- `src/utils/desktop.test.ts`, `src/utils/session.test.ts` — cases naming an app id
- `CLAUDE.md` — the Apps section above

### Supported file types (`.py`, `.rs`, `.vue`, etc.)
- `src/services/types.ts` — `FileType` union type
- `src/services/FilesConverterService.ts` — `getFileType()` switch statement
- `src/services/FilesConverterService.ts` — `fileTypeToShikiLang` map
