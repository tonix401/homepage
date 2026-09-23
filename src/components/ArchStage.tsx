/**
 * The workspace switch, as a slide.
 *
 * A scrolling compositor does not cut between workspaces, it travels: going to
 * a higher-numbered one carries the strip you were on off to the left and
 * brings the new one in from the right, and going back does the reverse. So
 * for the third of a second that takes, two strips are on screen at once — the
 * one arriving and the one leaving — which is the whole reason this sits
 * between `App` and `ArchStrip` rather than inside either.
 *
 * The departing strip renders the windows of a workspace that is no longer the
 * current one. `App` therefore builds a handle for every window the desktop
 * holds, not just the visible ones, or these would slide off as empty boxes.
 *
 * It asks for those windows by number rather than keeping a copy of them. The
 * records outlive the switch — they live in `desktop.windows`, not in the
 * workspace — so the only thing worth remembering here is which workspace was
 * on screen, and that changes once per switch rather than once per render.
 */

import { useCallback, useState, type ReactNode } from "react";
import { ArchStrip } from "./ArchStrip";
import { type WindowId, type WindowRecord } from "../utils/desktop";

interface Leaving {
  /**
   * Bumped per switch so React remounts rather than reusing the element, which
   * is what restarts the animation when one switch interrupts another.
   */
  seq: number;
  windows: readonly WindowRecord[];
  dir: -1 | 1;
}

interface ArchStageProps {
  workspace: number;
  windows: readonly WindowRecord[];
  focusedId: WindowId | null;
  onFocus: (id: WindowId) => void;
  renderWindow: (window: WindowRecord) => ReactNode;
  /** The windows of any workspace, for the one being left behind. */
  windowsOfWorkspace: (workspace: number) => readonly WindowRecord[];
}

export function ArchStage({
  workspace,
  windows,
  focusedId,
  onFocus,
  renderWindow,
  windowsOfWorkspace,
}: ArchStageProps) {
  const [shown, setShown] = useState(workspace);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [entering, setEntering] = useState<-1 | 1 | null>(null);
  // Stable, so the strips' slide-watching effect does not re-run every render.
  const endLeave = useCallback(() => setLeaving(null), []);
  const endEnter = useCallback(() => setEntering(null), []);

  // Adjusting state during the render that notices the change, rather than in
  // an effect, keeps the outgoing strip from missing a frame — the same reason
  // `BrowserApp` updates its trail this way.
  if (shown !== workspace) {
    // Higher workspace: the strips travel left. Lower: right.
    const dir: -1 | 1 = workspace > shown ? -1 : 1;
    const going = windowsOfWorkspace(shown);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setShown(workspace);
    // Nothing animates for someone who asked for less motion, and an empty
    // workspace has nothing to carry off. In both cases no `animationend` is
    // coming, so no departing strip may be left waiting for one.
    setLeaving((previous) =>
      !still && going.length > 0
        ? { seq: (previous?.seq ?? 0) + 1, windows: going, dir }
        : null,
    );
    setEntering(still ? null : dir);
  }

  return (
    <>
      {/* First in tree order, so the arriving strip paints over it. */}
      {leaving && (
        <ArchStrip
          key={leaving.seq}
          windows={leaving.windows}
          focusedId={null}
          onFocus={noop}
          renderWindow={renderWindow}
          slide={{ phase: "out", dir: leaving.dir }}
          onSlideEnd={endLeave}
        />
      )}
      {windows.length > 0 && (
        <ArchStrip
          key={workspace}
          windows={windows}
          focusedId={focusedId}
          onFocus={onFocus}
          renderWindow={renderWindow}
          slide={entering ? { phase: "in", dir: entering } : undefined}
          // Cleared once it has arrived: the class suppresses the columns' own
          // entry animation, which a window opened later on this workspace
          // still wants.
          onSlideEnd={endEnter}
        />
      )}
    </>
  );
}

/** The departing strip is `inert`, so nothing can ask it to focus anything. */
function noop() {}
