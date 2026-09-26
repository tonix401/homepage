# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Every dependency in `package.json` is pinned to an exact version, and
`.npmrc` sets `save-exact`, so `npm install <pkg>` pins new ones too. Upgrade
deliberately, one package at a time, rather than widening a range.

```bash
npm run dev        # start Vite dev server
npm run build      # tsc type-check + Vite production build
npm run lint       # ESLint
npm run preview    # serve the production build locally
npm test           # Vitest (single run); npm run test:watch to watch
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
│       └── PickerMenu     — its Themes / Wallpapers submenus: preview | list
└── (maximized)            — one window, rendered bare, no desktop

EditorApp                  — the VSCode window, one instance per column
├── Header                 — title bar (menu, quick open, window buttons)
├── ActivityBar
├── Sidebar
│   ├── Explorer           — recursive file tree with collapsible folders
│   ├── SearchPanel        — VSCode's Search view: find in every file's contents
│   ├── SourceControl      — every commit of the site's own repo, as VSCode's graph
│   ├── RunAndDebug        — starts Eruda, a DevTools docked on the right of the page
│   └── CustomPanel        — any other activity's markdown
├── Content                — tab bar + breadcrumb + FileView
└── Footer                 — status bar (file type, line count, encoding)

BrowserApp                 — the browser window, one instance per column
├── tab strip / toolbar
├── BookmarkBar            — the open folder as folders, plus `menuItems`
└── FileView               — the same body renderer the editor uses

TerminalApp                — jīzǐ, a yazi-style file manager in a kitty window
├── top line               — user@host, the cursor's path, window buttons
└── panes                  — parent dir | current dir | preview (raw text)

NotesApp                   — Obsidian: the open folder as a vault
├── ribbon                 — files and graph view toggles
├── file tree              — notes without `.md`, folders with indent guides
└── reading view / GraphView — the note, or every note and folder linked

BtopApp                    — btop: the desktop's window model as a process tree
├── cpu / mem / net        — what the page measures about itself, graphed
└── proc                   — systemd → Hyprland → workspaces → windows

FastfetchApp               — fastfetch: the visitor's own browser, Tom's layout

KdenliveApp                — Kdenlive: the open folder as a video project you read
├── ProjectBin             — folders and clips, each with its reading time
├── Project Monitor        — the file under the playhead, in a 16:9 frame
└── Timeline               — a track per folder, the clips end to end, the playhead
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

The sidebar collapses the way VSCode's does: clicking the active panel's
icon, Ctrl+B in the focused window, or the layout button in `Header` beside
the window buttons. `sidebarOpen` is the editor window's own state, and a
collapsed `Sidebar` is `hidden` rather than unmounted, so the explorer keeps
its expanded folders.

An activity in the config either shows markdown (`text`/`textFile`) or names
one of the app's own panels with `panel`. There are three.

`"search"` is `SearchPanel`, VSCode's Search view (see Search below).

`"run-and-debug"` is `RunAndDebug`, whose button starts Eruda — a DevTools the
page draws itself, since nothing a page can call opens the browser's own.
`src/utils/debugger.ts` imports it on the first click, so its half a megabyte
is a chunk of its own and never in the main bundle. There is one per page (it
hooks the page's console and network), so its status lives in that module and
every editor's panel reads it with `useSyncExternalStore`.

Eruda only docks at the bottom, so it runs in its `inline` mode inside a dock
of our own down the right edge, created outside React under `<body>`. It opens
on the Elements tab. The dock narrows `#root` by `--debugger-width` (a third of
the screen, then whatever its left edge is dragged to) rather than covering the
page, like docked DevTools; below 700px it covers the page instead. Three
things inline mode does that are easy to trip over:

- It sets `all: initial` on the container it is given, so Eruda gets a bare
  element inside `.debugger-dock-body`, never a styled one.
- It has no close button or resizer, so the dock brings its own.
- `eruda.hide()` is a no-op, so hiding the dock hides the Elements tool by
  hand, or a highlight it drew stays over the page.

Eruda itself highlights the *selected* element whenever the Elements detail
pane shows, which in a dock 680px or wider is always — and the selection
starts on `<body>`, so the whole page sat under a blue overlay.
`highlightOnHoverOnly` swaps the pane's private `_highlight` (and the box
model's listener, which holds the same function) so only hovering a part of
the box-model diagram highlights, as in Chrome. Those are Eruda 3.4 internals,
guarded: if they move, Eruda simply keeps its own behaviour. That is why `eruda`
is pinned exactly — check the overlay by hand before bumping it.

The dock's close button stops the debugger, exactly as Stop Debugging does:
`destroy`, and the dock removed. Only the panel's Hide Debugger puts it away
and keeps it running, console history and all.

`"source-control"` is `SourceControl`, which lists every commit from
`virtual:git-log`, which `gitLogPlugin` (`src/services/gitLog.ts`) reads with
`git log` at build time. Each row links to its commit on GitHub, in a new
tab; the address comes from the `origin` remote (`repoWebUrl`), so a fork
links to its own repository and a checkout with no GitHub remote gets plain
rows. The message, hash, author and age are in each row's tooltip, and the
first carries the branch. The dev server polls the
reflog, since Vite does not watch `.git`, and reloads on a commit. Import only
*types* from `gitLog.ts` in components, with `import type`: it imports
`node:child_process`, and under `verbatimModuleSyntax` a plain
`import { type … }` still loads the module in the browser bundle.

`FileView` keys a markdown note's content by the file's path, so switching
files rebuilds it. A reused `<video>` would take the next note's poster but
keep playing the last note's source, since media elements only read their
`<source>` children when they are created.

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
and that is the only thing a reload has to restore (besides the colour theme,
which is a preference rather than layout and lives in `localStorage` — see
Themes):

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
editor on the first file, tiled on workspace 1. Bump `SESSION_KEY` when the shape changes.

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
(`AppDefinition.title`) and opens the launcher. Every app's title names the
file it shows, as in `Homelab.md — Codium`: a window with no file set names
the first file, because that's what it shows (`pageName` in
`src/utils/files.ts`), and jīzǐ names the entry under its cursor; the keyboard segment cycles the
numerals (`WORKSPACE_LANGUAGES` lives in `src/utils/desktop.ts`).
On an empty workspace the title segment reads "App Launcher" and pulses: its label and
icon glow towards the primary. The background can't pulse, because the
powerline arrow tips are separate pieces in its fill colour. It is the only
nudge an empty desktop gives; there is no hint card.

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

`.wb-center` sits above both side clusters (`z-index: 1`), so a long window
title runs *under* the pill rather than into it. Once either cluster comes
within `CROWD_GAP` of the pill, a `ResizeObserver` in `Waybar.tsx` sets
`data-crowded` and the pill casts a shadow over what passes beneath; with
room to spare it casts none, since it would only be a halo on the wallpaper.
It is a data attribute rather than a class because the numeral spin edits the
pill's class list by hand, and a `className` change would drop the spin.

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
That buys trackpad, shift-wheel, touch and keyboard scrolling for none of the
wheel and drag code a transform would need. Its scrollbar is hidden
(`scrollbar-width: none` plus the `::-webkit-scrollbar` rule — a compositor
draws no bar under its windows, and `index.css` puts one on everything), so no
gutter is ever reserved and the columns keep their height however many windows
the strip holds, which is what `scroll` rather than `auto` used to be for. Only
the bar goes: every way of scrolling still works, including the `scrollTo` a
focus change makes; dragging a thumb is the one thing lost.

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

**Switching workspaces travels rather than cuts.** `ArchStage` sits between
`App` and `ArchStrip` for this one reason: going to a higher-numbered workspace
carries the strip you were on off to the left and brings the new one in from
the right, and going back reverses both — so for a third of a second two strips
are mounted at once. `--slide-dir` is `-1` for leftward and `+1` for rightward,
which is what lets one pair of keyframes cover every direction.

The slide is **translation and nothing else**. The two strips are exactly
adjacent at every moment of it, so neither has anything to fade behind, and
`arch-column-in` is scoped to `.arch-column--new` — a column that opens into a
strip already on screen, which `ArchStrip` tells apart by the window ids it
mounted with. Suppressing that animation with a class on the arriving strip
instead is a trap: taking `animation: none` back off an element is what *starts*
an animation, so the columns fell into their rise the moment the slide ended.

The departing strip renders a workspace that is no longer current, so `App`
builds a `WindowHandle` for **every** window the desktop holds rather than only
the visible ones — without that each would slide off as an empty box. It is
`inert` while it goes, so nothing can tab into or hover a window that has
already left. `ArchStage` asks for its windows by workspace number instead of
keeping a copy: the records live in `desktop.windows` and outlive the switch,
so the only thing worth remembering is which workspace was on screen.

A strip stops sliding when its animation's `finished` promise settles, **not**
on `animationend`. An animation that runs out while the tab is in the
background completes without ever dispatching to a listener that comes back
afterwards, and a strip waiting for that event keeps a whole app subtree
mounted off-screen until the next switch replaces it. `getAnimations()` reports
the animation whatever the tab was doing, and `finished` resolves straight away
for one that is already done.

**The view never sets focus.** Nothing listens to `scroll`, so reading along
the strip by hand leaves focus where it was. That is the point of a scrolling
layout and the first thing a later change is tempted to "fix".

**Any window can be maximized at any time**, however many share its workspace;
`fullscreen` is simply whether the focused one fills the viewport. A maximized
window renders bare, covering the bar, so **every app must put a restore button
in its own title bar** — that is the only way back to the strip, and an app
without one strands the workspace. Every current app has one (`Header`'s
maximize button, `.brw-winbtn` in the browser's tab strip, and
`src/components/WindowButtons.tsx` in the title bars of jīzǐ, Obsidian, btop and
fastfetch, and in Kdenlive's menu bar), and
the next app needs one too. Any app can reuse `WindowButtons` rather than
drawing its own. They're in the theme's colours unless the app sets
`--win-btn-fg`, `--win-btn-hover-fg` and `--win-btn-hover-bg`, as Obsidian
does to use its own greys.

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
`arg` is app-defined. The editor, browser and Obsidian read it as a file
path; the terminal reads it as the path under its cursor, which may be a
folder.

Everything an app may do to its own window arrives as a `WindowHandle`
(`setArg`, `close`, `toggleFullscreen`, `focus`, `open`), so no app ever
*changes* the desktop, or any window but its own. Apps can *read* it:
`AppRenderProps.desktop` is the live `Desktop`, frozen by convention, which
btop draws as its process tree. The window manager stays its only writer. Each handle closes over its own id, so
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

The terminal is a ranger-style file manager, and its logic is pure and tested
in `src/utils/fileManager.ts`. The directory it lists is not stored anywhere:
it is the parent of the cursor's path, so `j`/`k` (and `h`/`l`, `g`/`G`, the
arrows) are all `setArg`. The row it last sat on in each directory is kept
in a ref, so `h` then `l` comes back to the same row. `l`/`Enter` on a file
opens it with `handle.open`: HTML in the browser, everything else in the
editor, the way a file manager picks the program for a file's type. Keys follow the editor's rule: a window-level listener that only
the focused window installs, and it ignores keystrokes aimed at text fields.

A tiled terminal is translucent, so the wallpaper shows through. `.arch-column`
paints the editor's grey behind every window, so `Terminal.css` clears it with
`.arch-column:has(> .term--windowed)`. A maximized window has no wallpaper
behind it and keeps a solid background.

Obsidian (`src/apps/notes/`, app id `notes`) treats the open folder as a vault.
- **Kept per window:** its payload is the open note. Which view is showing,
  the sidebar and the expanded folders are the window's own state. A window
  **opens on the graph view**, and picking a node or a file switches to the
  note.
- **Reading view:** notes render through the shared `FileView` with
  Codium's markdown styles. `Notes.css` restyles only the colour of links and
  inline code, which are Obsidian's purple rather than the theme's, so a note
  otherwise looks the same in both apps. The breadcrumb above it is
  Obsidian's. The file tree also uses Codium's 14px, so the two
  trees read at the same scale.
- **Graph:** `src/utils/graph.ts` builds the graph and lays it out, pure and
  tested. `linksOf` finds a file's relative markdown links and HTML `href`s
  that land on another file in the tree. There are only three such links today,
  all from the README, so `buildGraph` also makes every folder a node tied to
  what it holds, and the folder tree shows as clusters.
- **Layout:** `layoutGraph` is a deterministic Fruchterman–Reingold layout
  (nodes start round a circle, not at random), fitted into [-1, 1], so the
  graph looks the same on every visit. `GraphView` draws it in a viewBox of
  those units, so it scales to any window without being laid out again.

btop (`src/apps/monitor/`, app id `monitor`) runs in the theme's colours,
like jīzǐ, and keeps no payload of its own.
- **proc:** `buildProcessTree` in `src/utils/processTree.ts` (pure, tested)
  turns the `Desktop` into `systemd (init)` → `Hyprland` → every workspace
  that holds a window (plus the one on screen) → its windows in strip order.
  `flattenTree` draws btop's `├─`/`└─`/`[-]` guides and hides folded nodes.
- **Pids:** a window's pid comes from the hex digits of its id (`pidFor`), so
  it's stable for as long as the window is open.
- **Terminal programs:** jīzǐ, btop and fastfetch run in kitty, so their window
  is a `kitty` process with the program as its child, one pid along
  (`WindowProcess.host`). The program keeps the window's id as its key, and
  the focus mark.
- **Command lines:** each window's is built from its record, e.g.
  `codium README.md`.
- **Keys:** `j`/`k` and the arrows select, `←`/`→` fold, climbing to the
  parent on a folded node, and Space toggles. Only the focused window listens,
  as in jīzǐ.
- **cpu, mem and net show only what a page can measure about itself,** and say
  so:
  - cpu is the tab's main-thread load, the same `useSystemStats` the bar uses.
  - mem is `performance.memory`, via `readHeap`.
  - net is the bytes resource timing has seen downloaded.
  - There is no per-core load, and no upload figure.
- **Decoration:** the per-process threads, memory and cpu in the proc columns
  are made up, like the bar's volume module. btop's own row is the exception:
  it shows the real tab cpu.
- **Graphs:** `brailleGraph` in `src/utils/brailleGraph.ts` draws them, two
  readings per character across and four dots down, newest on the right.
  Every reading lights at least the floor dot, so an idle graph is a line, as
  btop's is. `Graph` measures its box with a `ResizeObserver` and asks for
  exactly as many cells as fit.
- **Sampling:** once a second, skipping hidden tabs, which also freezes the
  graphs while the tab is in the background.

fastfetch (`src/apps/fetch/`, app id `fetch`) copies the layout of your own
fastfetch config (`~/.config/matugen/templates/colors-fastfetch.jsonc`):
- **Layout:** your outlined Arch logo from the matugen `arch.svg`, then two
  groups of keys between `╭──╮` / `╰──╯` rules, keys in the terminal's ANSI
  colours, values in the theme's primary, and the colour circles.
- **What it reports:** the *visitor's* browser, from what any page is told
  without a permission prompt:
  - User-Agent Client Hints and the user-agent string
  - `hardwareConcurrency`
  - the WebGL renderer
  - `deviceMemory` and the JS heap
  - `screen`, and a refresh rate measured from animation frames
  - locale and time zone
  - Resource Timing
  - the Battery API
  Nothing is sent anywhere. OS Age has no browser equivalent, so Locale takes
  its place.
- **Parsing:** in `src/utils/browserInfo.ts`, pure and tested: user agent to
  OS and engine, ANGLE and OpenGL renderer strings to a GPU name,
  refresh-rate snapping, and uptime wording.
- **Timing:** like the real command it's a snapshot taken when the window
  opens. Uptime counts from this tab's session start, not the page load:
  `src/utils/sessionStart.ts` writes `homepage.started` to `sessionStorage` on
  the first load (from `main.tsx`) and never overwrites it, so a reload keeps
  counting and a new tab starts its own. btop's `up` reads the same value. The awaited fields (client hints, battery, refresh rate) fill in as
  they arrive; a hidden tab gets no animation frames, so there the refresh
  rate waits.

Kdenlive (`src/apps/video/`, app id `video`) shows the open folder as a
video project, in Breeze Dark. Its payload is the file under the playhead.
- **Timeline:** `src/utils/timeline.ts` (pure, tested). Each file is a clip
  as long as it takes to read: words at `WPM` (230), HTML without its markup,
  never under `MIN_CLIP`. Each folder that holds files is a track, the root's
  files one named after the root folder. The clips run end to end in the
  Explorer's order, across the tracks, so the timeline is a Gantt chart of
  reading the whole folder.
- **The playhead follows the monitor's scroll.** Scrolling a file moves the
  red line through its clip, and pressing or dragging on the timeline, the
  monitor's ruler or a bin clip opens that file scrolled that far down.
  `FileView` takes two optional props for this: `onScrollFraction` reports the
  body's scroll as 0–1, and `seekRef` receives a function that scrolls it. An
  HTML file's frame has a null origin, so `HTML_NAV_SCRIPT` posts `{scroll}`
  out and takes `{seek}` from its parent, and a seek made before the frame
  loads waits for `onLoad`.
- **Play** advances the playhead frame by frame, which scrolls the file at
  reading speed and rolls into the next clip. ◀◀ and ▶▶ are Kdenlive's
  shuttle, not skips: each press plays that way at double the speed, up to
  `MAX_RATE`, and a speed other than 1× shows beside the timecode. While it plays, the monitor's
  scroll events are ignored: they are playback's own seeks coming back a
  frame late, rounded to whole pixels, and would stall it. A wheel or a press
  on the monitor pauses it instead.
- **The monitor is memoized** (`MonitorView`) and gets only stable callbacks.
  Playback re-renders the app every frame, and a markdown body is far too
  expensive to rebuild at that rate.
- **Keys:** Space plays, J / K / L rewind, pause and play forwards (as ◀◀,
  ⏸ and ▶▶), Home and End go to either end, and ↑ and ↓ step between clips. Only the focused window listens.
- **Decoration:** the menus, the layout tabs, the toolbar and the dock tabs.
  The bin's search, the transport and the timeline's zoom all work.

**Adding an app:** an id in `src/apps/ids.ts`, an icon and name in
`src/apps/icons.ts`, a definition folder under `src/apps/`, and an entry in
`APPS`/`LAUNCHABLE`. Nothing in the desktop model, the strip or the bar changes. The
one thing the window manager cannot supply is a restore button — give the app
its own, or a maximized window of it has no way back to the strip.

### Search

The header search bar is a quick-open (`src/components/QuickOpen.tsx`) over
`src/utils/search.ts`: a pure linear scan of file paths (fuzzy subsequence,
scored like VSCode's quick open) and file contents (case-insensitive
substring). The corpus is a handful of files already in memory, so there is no
index, worker or debounce.

The Search activity (`src/components/SearchPanel.tsx`) is the other half:
contents only, grouped by file, over `findInFiles` in the same module. Its
Match Case, Whole Word and Regex toggles (Alt+C/W/R) always compile to a
`u`-flag `RegExp`, so case folding and word boundaries work on "Lörrach"; an
invalid pattern is shown under the box, not thrown. There is no replace.
- The query and toggles are the editor window's state, not the panel's, so
  they survive switching panels; which files are collapsed is the panel's own.
- They are updated with functional `setState`: a toggle and a keystroke in
  the same tick would otherwise each write back a stale copy of the other.
- Ctrl/Cmd+Shift+F opens the view in the focused window and focuses the box.
- A match opens its file; nothing scrolls to the line.

### Themes

The desktop has five colour themes. Each is a Material-You palette that
matugen generates from one source colour: blue `#0027a3` (the default, and the
site's original look), teal, rose, amber and green. Everything in
`src/themes/` belongs to them:

- `palettes.ts` is **generated**. Run `npm run generate:themes`
  (`scripts/generate-themes.ts`) and commit the output, because CI has no
  matugen. The script calls matugen with `--dry-run`, and that flag is not
  optional: without it matugen also renders your real templates and fires
  their post-hooks, re-theming the machine the script runs on.
- `theme.ts` puts the chosen palette on `<html>` as `--theme-*` custom
  properties (`--theme-primary`, `--theme-surface-lowest`, …). Putting them on
  the root is what lets them reach the bar, the launcher in the top layer, the
  browser's portalled menus, and a maximized window, which renders outside the
  desktop. The palette used to be scoped to `.waybar` and copied by value
  wherever else it was needed.
- `subjects.ts` defines what the wallpaper shows. The subject is picked
  separately from the theme, so any subject works in any theme. There are two
  styles, because the artwork comes in two:
  - **Logos:** the Arch logo (the original Inkscape drawing), Tux
    and the Hyprland logo. They're filled with the theme's logo colour and
    outlined in white. Tux and Hyprland are single-path 24×24 icons from
    Simple Icons (16.32.0, CC0-1.0).
  - **Drawings:** your cat, from `~/.config/matugen/templates/cat.svg`, which
    is the **default** subject (`DEFAULT_SUBJECT`) that a first visit sees. It's
    line art, stroked in the theme's primary exactly as the template strokes
    it, with the eyes filled. Its elements were copied from the template
    unchanged.
  - **Placement:** every subject is fitted into a 100×69 box centred where the
    Arch logo sits (x 184, y 98), and drawn at `SUBJECT_SIZE` (90%) of it. The
    Arch logo keeps its own Inkscape placement, shrunk about that same centre.
    Each one's outline, stroke and glow blur are divided by its own scale, so
    only the shape changes size. Each subject also brings its own glow filter.
  - **Glow region:** the filter's region is 50% of the subject's size on every
    side. The Inkscape margin of about 14% cut the glow of a wide, flat drawing
    off in a hard-edged box.
  - **Adding a subject:** an icon in `ICONS` or a drawing in `DRAWINGS`, plus
    an entry in `SUBJECTS`.
- `wallpaper.ts` builds the wallpaper SVG for a theme and subject and hands it
  to an `<img>` as a data URL. It isn't inline SVG: the glow is a large blur
  filter that an image rasterizes once, and the inline previews would resolve
  each other's `url(#…)` ids.
- `preferences.ts` reads and writes both choices in `localStorage`,
  `homepage.theme.v1` and `homepage.wallpaper.v1`. It falls back to the
  default when storage is missing, blocked or full.

Components keep their own variable names (`--wb-primary`, `--term-fg`,
`--arch-window-border`, `--launcher-accent`) but define them from
`var(--theme-*)`. Translucent tints are
`color-mix(in srgb, var(--theme-primary) N%, transparent)`. A new colour
belongs in a theme token, not in a literal.

The generator makes a few deliberate choices, each commented in the script:
- The bar's secondary is tone 90, not matugen's 80, which sits too close to
  primary where the two segments meet.
- Every derived logo is primary tone 25, the depth the original blue sits at.
  The raw sources differ fivefold in brightness.
- Blue keeps its hand-drawn logo and gradient exactly.

**Codium, Chromium, Obsidian and Kdenlive are not themed.** They keep the
VSCode, Chrome, Obsidian and Breeze Dark palettes in `App.css`, `Browser.css`,
`Notes.css` and `Kdenlive.css`, like real apps that ignore your GTK theme. The desktop chrome and jīzǐ follow the
theme. The one exception is markdown in Codium and Chromium: links take the
theme's primary and inline code its tertiary (`.vscode-md-area` in
`Content.css`). Obsidian overrides both with its own purple, `--obs-accent`.
Code blocks keep the plain text colour everywhere.

The theme and the wallpaper are both picked in the **launcher**, not by an app.

- **The rows:** the last rows of the app list, **Themes ›** and
  **Wallpapers ›**, sit below a hairline. `SUBMENUS` in `Launcher.tsx` gives
  each its own filter keywords: "colours" finds Themes; "tux" or "background"
  finds Wallpapers.
- **Opening one:** Enter, → or a click opens `PickerMenu` in the same panel,
  laid out like a rofi wallpaper menu: a preview on the left, the choices on
  the right.
- **Browsing:** moving the highlight changes only the preview. That's the
  wallpaper as the choice would leave it, zoomed in on the subject: a theme is
  previewed with the current subject, and a subject in the current theme.
- **Picking:** Enter or a click applies the choice and closes the launcher.
- **Going back:** Esc or ← returns to the apps rather than closing. That's why
  the list's Esc handler prevents the default, which would otherwise cancel
  the dialog.
- **Where they go:** apps never see either choice. Both go from `App` through
  `ArchDesktop` to the launcher and the wallpaper, and everything else reads
  the theme from CSS.

The circle reveal runs on any wallpaper change, whether theme or subject:
`Wallpaper` is keyed by the image URL, which `wallpaperUrl` memoizes per
pair.

**A theme change animates** over `THEME_TRANSITION` (0.8s).
- **Colours:** `registerThemeProperties` registers every `--theme-*` token
  with `CSS.registerProperty` as a `<color>`. An ordinary custom property is a
  string and can only switch. A registered one interpolates, so a single
  transition on `<html>` fades every border, pill and glyph that reads the
  palette through `var()`, with no transition rule of their own.
- **When the fade switches on:** `animateThemeChanges` sets that transition
  two animation frames after mount, so a page load never fades in from the
  registered defaults. A tab opened in the background doesn't get it until it
  is shown. Reduced motion skips it.
- **Wallpaper:** being an image, it can't interpolate, and it deliberately
  doesn't fade. `ArchDesktop`'s `Wallpaper` keeps the old image underneath and
  reveals the new one, once it has loaded, with a `clip-path` circle growing
  from the centre of the screen. The circle ends at 72%: a percentage radius
  is taken of the diagonal over √2, so reaching the corners takes 70.7%. The
  old image is dropped on `animationend`. Keep the keyframe's duration in step
  with `THEME_TRANSITION`.

The choice is kept in **`localStorage`** (`homepage.theme.v1`), not the
session. The window layout deliberately ends with the visit, but a theme is a
preference, so a new visit comes back to it. `App` applies it in a layout
effect, so the first paint is already in the stored theme.

### SEO

The site is one URL whose content only exists once React runs, so the build
gives crawlers what they need without it. None of it is written by hand:

- **The site's address** is `public/CNAME`, the file GitHub Pages already
  needs for the custom domain. `seoPlugin` (`src/services/seo.ts`) reads it,
  and fails the build if it is missing, rather than keeping a second copy.
- **`<head>`:** `seoPlugin` injects the description, canonical URL, Open Graph
  and Twitter tags, and schema.org `WebSite` + `Person` JSON-LD. What they say
  lives in the `seo` export of `vscode_website.config.ts`, so a new job or
  account is an edit there, not in `index.html`.
- **`robots.txt` and `sitemap.xml`** are emitted by the same plugin at build
  time; neither is in `public/`. The sitemap's `lastmod` is the date of the
  last commit to touch the open folder, which is why the deploy workflow checks
  out with `fetch-depth: 0` — a shallow clone would date it by whatever commit
  happened to be HEAD, or not at all.
- **`public/og-image.png`** is generated and committed:
  `npm run generate:og` (`scripts/generate-og-image.ts`) starts its own Vite
  server on a spare port, lays out the desktop (teal over the cat, Codium on
  the README with its sidebar collapsed, alone and tiled) and captures
  1200×630 with headless Chromium over the DevTools protocol. Re-run it when
  the desktop's look changes.
- **The open folder, prerendered:** `src/services/prerender.ts` renders every
  markdown file into `#root` as plain HTML, from the open-folder plugin's
  `transformIndexHtml`. React replaces it on mount, and until then `.prerender`
  (in `index.html`'s own `<style>`) hides it the way screen-reader text is
  hidden. Anything that would fetch while the page loads is dropped: images
  become their alt text, and videos, styles and scripts go. Links between files
  are unlinked, since a file has no URL a crawler could follow.

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

### The desktop shape (`Desktop`, `WorkspaceRecord`, `WindowRecord`)
- `src/utils/desktop.ts` — the types, the reducers, `repairDesktop`, `WORKSPACE_COUNT`, `WORKSPACE_LANGUAGES`, `MAX_WINDOWS`
- `src/utils/session.ts` — the shape validation, and `SESSION_KEY` (bump it whenever the stored shape changes)
- `src/utils/desktop.test.ts` — the reducer and invariant cases
- `src/utils/session.test.ts` — the round-trip and rejection cases
- `CLAUDE.md` — the Desktop state section above

### The themes (`blue`, `teal`, …, the `--theme-*` tokens)
- `scripts/generate-themes.ts` — `SOURCES`, and the token list in `tokensFor()`
- `src/themes/palettes.ts` — regenerate with `npm run generate:themes`, never edit
- `src/themes/theme.test.ts` — the theme ids, and blue's pinned values
- `src/themes/subjects.ts` / `subjects.test.ts` — the wallpaper subjects and their ids
- Every stylesheet that reads a token, when one is renamed or removed
- `CLAUDE.md` — the Themes section above

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
