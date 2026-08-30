/** A Wróg fought in rounds: the frame that owns the count, and the four things that happen to it (law 3, docs/STACK.md). */

import type { CombatResult } from "./combat";
import { pop, push, replaceTop, type TurnState } from "./stack";
import type { TurnPhase } from "./turn";

export type LoopFrame = Extract<TurnPhase, { phase: "loop" }>;
export type FightFrame = Extract<TurnPhase, { phase: "fight" }>;

/**
 * The frame for the round now being fought — `done + 1` of `times`.
 *
 * Minted from the template rather than kept on the frame, so a round cannot
 * inherit the last one's dice: every round is a fresh comparison under 17.4,
 * with an empty floor for the Zaklęcia 17.3 puts before the roll.
 *
 * `fought` is the round's one asymmetry. It is empty on every round but the
 * last, which is what keeps the ordinary settle from paying out three times:
 * `trophiesFrom` reads it, and a head is not a trophy. On the last round it
 * carries what the creature settles, so beating it pays out exactly once, from
 * the same code every other fight uses.
 */
export function roundOf(loop: LoopFrame): FightFrame {
  const last = loop.done + 1 === loop.times;
  return {
    phase: "fight",
    fight: {
      ...loop.of,
      cardName: `${loop.of.cardName} (${loop.round} ${loop.done + 1} z ${loop.times})`,
      playerRoll: null,
      enemyRoll: null,
      result: null,
      caster: null,
      fought: last ? [...loop.settles] : [],
    },
  };
}

/** Opens the loop with its first round already on top of it. */
export function openLoop(state: TurnState, loop: LoopFrame): TurnState {
  return push(push(state, loop), roundOf(loop));
}

/**
 * What the round just settled does to the count.
 *
 * A win cuts a head; anything else ends the attempt. 17.4 settles a fight the
 * moment the dice are compared, and neither a loss nor a draw (17.10) leaves
 * the character still swinging — so there is no third answer where the loop
 * carries on.
 *
 * `regrown` is what the ending cost: the rounds that had been won and are not
 * any more, which is the card's "głowy, które odcięła odrastają" as a number
 * the journal can say out loud.
 */
export type LoopStep =
  | { go: "again"; loop: LoopFrame }
  | { go: "won" }
  | { go: "over"; regrown: number };

export function advanceLoop(loop: LoopFrame, outcome: CombatResult["outcome"]): LoopStep {
  if (outcome !== "wygrana") return { go: "over", regrown: loop.done };
  const done = loop.done + 1;
  return done >= loop.times ? { go: "won" } : { go: "again", loop: { ...loop, done } };
}

/**
 * Pops the loop and tells the field beneath what was fought (17.4).
 *
 * The same shape as `closeFightFrame`, and for the same reason: the frame
 * beneath is where "this turn is done rolling against him" has to land, and it
 * is a field only when the creature was one lying on the Obszar. A loop opened
 * from inside a card script pops onto that script instead, and the settling is
 * the script's business — exactly as an ordinary pushed fight's is.
 */
export function closeLoopFrame(state: TurnState, loop: LoopFrame): TurnState {
  // A loop is always pushed over something — the field the creature is lying
  // on, or the script that named it — so there is no one-frame stack to read
  // for one more release here, and `pop` saying so is better than a guess.
  const below = state.stack[state.stack.length - 2];
  if (!below) return pop(state);
  if (below.phase !== "field") return pop(state);
  return replaceTop(pop(state), {
    ...below,
    fought: [...new Set([...(below.fought ?? []), ...loop.settles])],
  });
}

/**
 * A loop left standing with no round above it, which means the attempt ended
 * some way other than by the dice — 19.1's escape, or the test hatch.
 *
 * The invariant a loop frame keeps is that it is never on top at rest, so
 * every path that closes a fight has to ask this. Nothing is cut and nothing
 * is kept: walking away from the second head is walking away from the Smok.
 */
export function settleExposedLoop(state: TurnState): TurnState {
  const above = state.stack[state.stack.length - 1];
  return above.phase === "loop" ? closeLoopFrame(state, above) : state;
}

/**
 * The loop this fight is a round of, if it is one.
 *
 * Asked by the settle, which has to know whether a win is a head or a kill.
 */
export function loopBeneath(state: TurnState): LoopFrame | null {
  const below = state.stack[state.stack.length - 2];
  return below && below.phase === "loop" ? below : null;
}

/**
 * Whether settling this round settles the creature.
 *
 * Only the winning last round does. Everything the ordinary settle pays out
 * for a kill — the trophy (1.4), the Władca's errand, Excalibur's stolen point
 * — is owed for beating the Wróg, and a head is not the Wróg. The point of
 * Życie a loss costs is not on this list: 17.4 charges that for losing a
 * fight, and a head is a fight.
 */
export function roundFinishes(loop: LoopFrame, outcome: CombatResult["outcome"]): boolean {
  return outcome === "wygrana" && loop.done + 1 >= loop.times;
}
