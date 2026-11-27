/**
 * kitty, the terminal, running a shell over the open folder. A new window
 * runs fastfetch and leaves a prompt under it; every command it knows is in
 * `programs/index.tsx`, and `help` lists them.
 *
 * A command either prints into the scrollback, or — btop and jīzǐ — takes the
 * window over until it is quit with `q`, as a real terminal's alternate
 * screen does. That program's command line is the window's payload
 * (`parseArg` in `utils/shell.ts`), so a reload comes back to it, and the
 * launcher's btop and jīzǐ are this window opened on theirs. The working
 * folder, the scrollback and the history are the window's own state, and a
 * reload starts them over. Only the last `SCROLLBACK` lines are kept.
 *
 * The prompt is a real `<input>`, so typing, pasting and a phone's keyboard
 * all work. It is unmounted while a full-screen program runs, because those
 * listen on the window and leave keys aimed at a text field alone — and while
 * a command such as `curl` is still running, as a shell's prompt waits for it.
 *
 * Files dropped on the shell are fetched into the working folder by `curl`,
 * as if typed; jīzǐ takes its own drops.
 */

import {
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./Kitty.css";
import { Icon } from "../../components/Icon";
import { WindowButtons } from "../../components/WindowButtons";
import { useTree } from "../../utils/fileStore";
import { carriesFiles } from "../../utils/drop";
import {
  USER,
  complete,
  formatArg,
  highlight,
  line,
  parseArg,
  promptPath,
  promptTime,
  quote,
  suggest,
  tokenize,
  trimScrollback,
} from "../../utils/shell";
import { Lines, Segments } from "./Lines";
import { COMMAND_NAMES, PROGRAMS, findProgram } from "./programs";
import { Fastfetch } from "./programs/fastfetch";
import { APP_ICONS } from "../icons";
import { type AppRenderProps } from "../types";

/**
 * What a prompt shows besides the folder: the time it was drawn, and whether
 * the command before it succeeded.
 */
interface PromptState {
  ok: boolean;
  time: string;
}

/** One command in the scrollback: the prompt it was typed at, and what it printed. */
interface Block {
  id: number;
  cwd: string;
  prompt: PromptState;
  input: string;
  /** Ended with Ctrl+C rather than run. */
  interrupted?: boolean;
  /** Ran, and was stopped with Ctrl+C while the shell waited for it. */
  aborted?: boolean;
  output: ReactNode;
  /** Lines it takes in the scrollback, for `trimScrollback`. */
  rows: number;
}

/** A command the shell is waiting for: its block, and what Ctrl+C stops. */
interface Busy {
  block: number;
  controller: AbortController;
  status: { failed: boolean };
}

/**
 * How many lines stay in the scrollback, kitty's own default: the oldest
 * commands go first, so a long session (or a `curl` loop) cannot grow the page
 * without end. A command is dropped whole, and the newest never is.
 */
const SCROLLBACK = 2000;
/** The lines a command takes besides its output: the powerline and the input. */
const PROMPT_ROWS = 2;
/** What an output that is an element (fastfetch, `curl`'s meter, an image) counts as, as it has no lines to count. */
const ELEMENT_ROWS = 16;

const freshPrompt = (ok = true): PromptState => ({ ok, time: promptTime(new Date()) });

/** What a new shell shows first, as Tom's own shell does on opening. */
function greeting(id: number): Block {
  return { id, cwd: "", prompt: freshPrompt(), input: "fastfetch", output: <Fastfetch />, rows: PROMPT_ROWS + ELEMENT_ROWS };
}

/** A powerline arrow, from one segment's fill into the next one's. */
function Arrow({ from, to }: { from: string; to: string }) {
  return <span className="kitty-pl-arrow" style={{ "--from": from, "--to": to } as CSSProperties} />;
}

const FILL = {
  user: "var(--theme-primary)",
  dir: "var(--theme-secondary)",
  shell: "var(--theme-surface-highest)",
  time: "var(--theme-surface)",
  none: "transparent",
};

/**
 * Tom's starship prompt (`~/.config/starship.toml`), in the theme's colours as
 * matugen fills it in: the user on primary, the folder on secondary, the shell
 * on the highest surface, the time on a container, then a second line with
 * the status mark. The OS logo (a Nerd Font glyph), git, nix-shell and
 * toolchain modules are cut: the open folder is not a repository and there is
 * no toolchain to report.
 */
function Prompt({ cwd, prompt }: { cwd: string; prompt: PromptState }) {
  const wrapInSpaces = (input: string) => " " + input + " ";

  return (
    <div className="kitty-pl" aria-label={`${USER} in ${promptPath(cwd)}`}>
      <span className="kitty-pl-cap" style={{ "--to": FILL.user } as CSSProperties} />
      <span className="kitty-pl-seg kitty-pl-user">{wrapInSpaces(USER)}</span>
      <Arrow from={FILL.user} to={FILL.dir} />
      <span className="kitty-pl-seg kitty-pl-dir">{wrapInSpaces(promptPath(cwd))}</span>
      <Arrow from={FILL.dir} to={FILL.shell} />
      <span className="kitty-pl-seg kitty-pl-shell">{wrapInSpaces("zsh")}</span>
      <Arrow from={FILL.shell} to={FILL.time} />
      <span className="kitty-pl-seg kitty-pl-time">{wrapInSpaces(prompt.time)}</span>
      <Arrow from={FILL.time} to={FILL.none} />
    </div>
  );
}

/**
 * starship's `character`, the glyphs from Tom's config: a dot and a play mark,
 * or a cross after a failure. They come from `kitty-prompt` (see `Kitty.css`).
 */
function Character({ ok }: { ok: boolean }) {
  return (
    <span className={`kitty-char${ok ? "" : " kitty-char--error"}`}>
      {ok ? "\uEA71 \uF04B " : "\uF00D \uF04B "}
    </span>
  );
}

export function KittyApp({ arg, focused, maximized, handle, desktop }: AppRenderProps) {
  const foreground = parseArg(arg);
  const program = foreground ? findProgram(foreground.program) : undefined;
  const Screen = program?.Screen;

  const tree = useTree();
  const [cwd, setCwd] = useState("");
  const [input, setInput] = useState("");
  const [typed, setTyped] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(() => freshPrompt());
  // `null` until the prompt first shows: a window opened on btop greets you
  // when you quit it, not underneath it.
  const [blocks, setBlocks] = useState<Block[] | null>(() => (Screen ? null : [greeting(0)]));
  const nextId = useRef(1);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [dropping, setDropping] = useState(false);
  /** Where ↑ has walked to in the history, and the line it was walked away from. */
  const walk = useRef<{ at: number; draft: string } | null>(null);

  const append = useCallback((block: Omit<Block, "id" | "rows">, outputRows = 0) => {
    const id = nextId.current++;
    const rows = PROMPT_ROWS + outputRows;
    setBlocks((b) => trimScrollback([...(b ?? []), { ...block, id, rows }], SCROLLBACK));
    return id;
  }, []);

  const setArgs = useCallback(
    (args: string[]) => {
      const name = parseArg(arg)?.program;
      if (name) handle.setArg(formatArg(name, args));
    },
    [handle, arg],
  );
  const exit = useCallback(() => {
    handle.setArg(null);
    setPrompt(freshPrompt());
    const id = nextId.current++;
    setBlocks((b) => b ?? [greeting(id)]);
  }, [handle]);

  /**
   * Runs a command line typed at `shell.prompt`, with `shell.typed` before it
   * in the history. Resolves with the prompt drawn after it once it is done,
   * or `null` when Ctrl+C stopped it, so dropped files can run in turn.
   */
  function run(text: string, shell = { prompt, typed }): Promise<PromptState | null> {
    const history = text.trim() ? [...shell.typed, text] : shell.typed;
    setTyped(history);
    const next = (ok: boolean) => {
      const drawn = freshPrompt(ok);
      setPrompt(drawn);
      return Promise.resolve(drawn);
    };

    const block = { cwd, prompt: shell.prompt, input: text, output: null };
    const [command, ...args] = tokenize(text);
    if (!command) {
      append(block);
      return next(shell.prompt.ok);
    }
    const found = findProgram(command);
    if (!found) {
      append({ ...block, output: <Lines lines={[line(`zsh: command not found: ${command}`)]} /> }, 1);
      return next(false);
    }
    if (found.Screen) {
      append(block);
      handle.setArg(formatArg(found.name, found.launch?.(args, cwd) ?? args));
      return Promise.resolve(null);
    }

    let cleared = false;
    const waited: { job?: Promise<unknown> } = {};
    const status = { failed: false };
    const controller = new AbortController();
    const result = found.run?.({
      args,
      cwd,
      cd: setCwd,
      history,
      clear: () => (cleared = true),
      fail: () => (status.failed = true),
      wait: (promise) => (waited.job = promise),
      signal: controller.signal,
      commands: PROGRAMS,
      open: handle.open,
      close: handle.close,
    });
    if (cleared) {
      setBlocks([]);
      return next(!status.failed);
    }
    const outputRows = isValidElement(result) ? ELEMENT_ROWS : (result?.length ?? 0);
    const id = append({ ...block, output: isValidElement(result) ? result : result ? <Lines lines={result} /> : null }, outputRows);
    const { job } = waited;
    if (!job) return next(!status.failed);
    // The next prompt is drawn when the command is done, not when it started.
    setBusy({ block: id, controller, status });
    return job
      .catch(() => (status.failed = true))
      .then(() => {
        setBusy(null);
        const drawn = next(!status.failed);
        return controller.signal.aborted ? null : drawn;
      });
  }

  // Ctrl+C stops the command the shell is waiting for; the prompt is gone
  // meanwhile, so the window listens. Closing the window stops it too.
  useEffect(() => {
    if (!busy || !focused) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.ctrlKey || event.key !== "c" || window.getSelection()?.toString()) return;
      event.preventDefault();
      busy.status.failed = true;
      busy.controller.abort();
      setBlocks((b) => b?.map((x) => (x.id === busy.block ? { ...x, aborted: true } : x)) ?? b);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, focused]);
  useEffect(() => () => busy?.controller.abort(), [busy]);

  /**
   * Files dropped at the prompt are fetched into the working folder by
   * `curl <url> <name>`, one after another, as if each were typed: the URL is
   * the one the browser gives a dropped file. What is being typed stays.
   */
  async function receive(files: File[]) {
    let shell = { prompt, typed };
    for (const file of files) {
      // A name starting with `-` would read as an option.
      const name = file.name.startsWith("-") ? `./${file.name}` : file.name;
      const url = URL.createObjectURL(file);
      const text = `curl ${url} ${quote(name)}`;
      // The store keeps its own copy of the bytes, so the address is done with.
      const drawn = await run(text, shell).finally(() => URL.revokeObjectURL(url));
      if (!drawn) return;
      shell = { prompt: drawn, typed: [...shell.typed, text] };
    }
  }

  const suggestion = suggest(tree, cwd, input, typed, COMMAND_NAMES);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const key = event.key;
    const field = event.currentTarget;
    const atEnd = field.selectionStart === input.length && field.selectionEnd === input.length;
    if (suggestion && (key === "Tab" || ((key === "ArrowRight" || key === "End") && atEnd))) {
      // Taken whole, as zsh-autosuggestions' accept does.
      setInput(suggestion);
      walk.current = null;
    } else if (key === "Enter") {
      setInput("");
      walk.current = null;
      void run(input);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      if (typed.length === 0) return;
      const at = walk.current?.at ?? typed.length;
      const draft = walk.current?.draft ?? input;
      const next = Math.min(Math.max(at + (key === "ArrowUp" ? -1 : 1), 0), typed.length);
      walk.current = next === typed.length ? null : { at: next, draft };
      setInput(next === typed.length ? draft : typed[next]);
    } else if (key === "Tab") {
      const { line: completed, options } = complete(tree, cwd, input, COMMAND_NAMES);
      // Several candidates are listed under the line, as a shell lists them.
      if (options.length > 1) append({ cwd, prompt, input, output: <Lines lines={[line(options.join("  "))]} /> }, 1);
      setInput(completed);
    } else if (event.ctrlKey && key === "c") {
      // Copying a selection is still Ctrl+C's job.
      if (field.selectionStart !== field.selectionEnd || window.getSelection()?.toString()) return;
      // An interrupted line exits non-zero, so the next prompt is red.
      append({ cwd, prompt, input, interrupted: true, output: null });
      setPrompt(freshPrompt(false));
      setInput("");
      walk.current = null;
    } else if (event.ctrlKey && key === "l") {
      setBlocks([]);
    } else if (event.ctrlKey && key === "d" && input === "") {
      handle.close();
    } else {
      return;
    }
    event.preventDefault();
  }

  // The prompt takes the keyboard while its window has focus, and gives it up
  // when another window takes it, so that window's keys are not typed here.
  const field = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLSpanElement>(null);
  const prompting = !Screen && !busy;
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    if (focused) el.focus({ preventScroll: true });
    else el.blur();
  }, [focused, prompting]);

  // Follow the output down: after every command, and whenever it grows
  // while you are at the bottom — fastfetch fills fields in after it prints.
  // Set by hand rather than with `scrollIntoView`, which would also scroll the
  // desktop's strip.
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    following.current = true;
  }, [blocks, prompting]);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [prompting]);

  return (
    <div
      className={`kitty${maximized ? "" : " kitty--windowed"}${dropping ? " kitty--dropping" : ""}`}
      // Only the prompt takes a drop: btop has nowhere to put one, and a
      // command still running has the terminal.
      onDragOver={(event) => {
        if (!carriesFiles(event) || Screen || busy) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!carriesFiles(event) || Screen || busy) return;
        event.preventDefault();
        void receive([...event.dataTransfer.files]);
      }}
    >
      <div className="kitty-topline">
        {Screen && (
          // `q` for a finger: a phone shows no keyboard while a program runs.
          <button
            className="win-btn kitty-quit"
            onClick={exit}
            aria-label="Back to the shell (q)"
            title="Back to the shell (q)"
          >
            <Icon path={APP_ICONS.kitty} />
          </button>
        )}
        <WindowButtons handle={handle} maximized={maximized} />
      </div>

      {Screen && foreground ? (
        <Screen
          args={foreground.args}
          setArgs={setArgs}
          exit={exit}
          focused={focused}
          open={handle.open}
          windowId={handle.id}
          desktop={desktop}
        />
      ) : (
        <div
          className="kitty-scroll"
          ref={scroller}
          onScroll={(event) => {
            const el = event.currentTarget;
            following.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
          }}
          // A click anywhere goes to the prompt — unless it selected text.
          onMouseUp={() => {
            if (!window.getSelection()?.toString()) field.current?.focus({ preventScroll: true });
          }}
        >
          <div ref={content}>
            {blocks?.map((block) => (
              <div key={block.id} className="kitty-block">
                <Prompt cwd={block.cwd} prompt={block.prompt} />
                <div className="kitty-line">
                  <Character ok={block.prompt.ok} />
                  <Segments segments={highlight(block.input, COMMAND_NAMES)} />
                  {block.interrupted && "^C"}
                </div>
                {block.output}
                {block.aborted && <div className="kitty-line">^C</div>}
              </div>
            ))}
            {!busy && (
              <div className="kitty-block">
                <Prompt cwd={cwd} prompt={prompt} />
                <label className="kitty-line kitty-input-line">
                  <Character ok={prompt.ok} />
                  {/* The field's own text is transparent: this coloured copy
                      under it is what shows, scrolled along with it. */}
                  <span className="kitty-field">
                    <span ref={mirror} className="kitty-mirror" aria-hidden>
                      <Segments segments={highlight(input, COMMAND_NAMES)} />
                      {suggestion && <span className="kitty-suggestion">{suggestion.slice(input.length)}</span>}
                    </span>
                    <input
                      ref={field}
                      className="kitty-input"
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value);
                        walk.current = null;
                      }}
                      onScroll={(event) => {
                        if (mirror.current) mirror.current.scrollLeft = event.currentTarget.scrollLeft;
                      }}
                      onKeyDown={onKeyDown}
                      aria-label="Command"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
