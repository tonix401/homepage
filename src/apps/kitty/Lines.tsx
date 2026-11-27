/** Output as the shell prints it: lines of coloured segments (`utils/shell.ts`). */

import { type Line } from "../../utils/shell";

export function Segments({ segments }: { segments: Line }) {
  return segments.map((s, j) => (
    <span
      key={j}
      className={[s.tone && `kitty-${s.tone}`, s.bold && "kitty-bold", s.underline && "kitty-underline"]
        .filter(Boolean)
        .join(" ")}
    >
      {s.text}
    </span>
  ));
}

export function Lines({ lines }: { lines: readonly Line[] }) {
  return lines.map((segments, i) => (
    <div key={i} className="kitty-line">
      <Segments segments={segments} />
    </div>
  ));
}
