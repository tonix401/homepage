/**
 * VSCode's Run and Debug view, before there is a launch.json: one big button
 * and a few lines under it. The button starts Eruda (`src/utils/debugger.ts`),
 * which is shared by the whole page, so every editor's panel shows the same
 * state and any of them can stop it.
 */
import { useSyncExternalStore } from "react";
import {
  debuggerStatus,
  hideDebugger,
  startDebugging,
  stopDebugging,
  subscribeDebugger,
} from "../utils/debugger";
import "./RunAndDebug.css";

interface RunAndDebugProps {
  title: string;
}

export function RunAndDebug({ title }: RunAndDebugProps) {
  const status = useSyncExternalStore(subscribeDebugger, debuggerStatus);
  const running = status === "open" || status === "hidden";
  const label =
    status === "starting"
      ? "Starting…"
      : status === "open"
        ? "Hide Debugger"
        : status === "hidden"
          ? "Show Debugger"
          : "Run and Debug";

  return (
    <div className="vscode-debug">
      <div className="vscode-explorer-heading">{title}</div>

      <div className="vscode-debug-body">
        <button
          className="vscode-debug-btn"
          disabled={status === "starting"}
          onClick={() => (status === "open" ? hideDebugger() : void startDebugging())}
        >
          <i className={`codicon codicon-${running ? "debug" : "debug-alt"}`} aria-hidden="true" />
          {label}
        </button>
        {running && (
          <button className="vscode-debug-btn vscode-debug-btn--secondary" onClick={stopDebugging}>
            <i className="codicon codicon-debug-stop" aria-hidden="true" />
            Stop Debugging
          </button>
        )}

        {status === "failed" && (
          <p className="vscode-debug-error">The debugger could not be loaded. Try again?</p>
        )}
        <p>
          A page can't open your browser's DevTools, so this starts{" "}
          <a href="https://github.com/liriliri/eruda" target="_blank" rel="noopener noreferrer">
            Eruda
          </a>
          , a DevTools that runs inside the page, docked on the right: elements, console, network,
          storage and sources. Drag its left edge to resize it.
        </p>
        <p>
          The real thing is still one keypress away: <kbd>F12</kbd> or <kbd>Ctrl</kbd>+
          <kbd>Shift</kbd>+<kbd>I</kbd>.
        </p>
      </div>
    </div>
  );
}
