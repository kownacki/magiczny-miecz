/** What each frame on the stack looks like on screen: which panel draws it, and what it stops the player doing while it is up. */

import type { TurnPhase } from "@/lib/engine/turn";

/**
 * How one frame is shown, and what it withholds while it is showing.
 *
 * The browser's counterpart to `engine/stack.ts`. The stack itself is a deep
 * module with laws; the page had no equivalent and re-interrogated `top()` by
 * hand at twenty-seven places, so a new frame kind cost eight files and none
 * of them failed to compile — `loop` and `overflow` have been in the union
 * with no panel and nothing said so.
 */
export interface FramePanel {
  /**
   * Whether the turn's own sheet has anything to show for this frame.
   *
   * `when-drawn` is the field: an Obszar opens the sheet only once there are
   * Karty on it or an offer nobody may walk past, which is a question about
   * the frame's contents rather than its kind, so the call site finishes it.
   */
  sheet: "always" | "when-drawn" | "no";
  /**
   * Whether the turn may be handed on while this is on screen.
   *
   * `passTurn` refuses these server-side too; the button knowing as well is
   * what stops the player pressing a thing that cannot work.
   */
  blocksEnding: boolean;
}

/**
 * One row per frame kind, so adding a kind to `TurnPhase` is a compile error
 * here rather than a panel that silently never draws.
 *
 * Two rows are worth reading twice:
 *
 * - `ask` does **not** block ending, which is what the page did before this
 *   table existed and is preserved rather than quietly corrected. A question
 *   owed is unfinished business in exactly the way a suspended `script` is,
 *   so this is probably wrong — but changing it is a rule decision about
 *   whether `passTurn` should refuse, not a refactor's to take.
 * - `loop` and `overflow` have no panel of their own. A loop is never the top
 *   of the stack at rest (docs/STACK.md, law 3) so nothing should ever draw
 *   it; the overflow frame is drawn by its own control rather than the sheet.
 */
export const FRAME_PANEL: Record<TurnPhase["phase"], FramePanel> = {
  roll: { sheet: "no", blocksEnding: false },
  move: { sheet: "always", blocksEnding: false },
  field: { sheet: "when-drawn", blocksEnding: false },
  fight: { sheet: "always", blocksEnding: true },
  bridge: { sheet: "always", blocksEnding: false },
  script: { sheet: "no", blocksEnding: true },
  loop: { sheet: "no", blocksEnding: false },
  ask: { sheet: "no", blocksEnding: false },
  overflow: { sheet: "no", blocksEnding: false },
  end: { sheet: "no", blocksEnding: false },
};

/** How the frame on screen is shown. */
export function panelFor(frame: TurnPhase): FramePanel {
  return FRAME_PANEL[frame.phase];
}
