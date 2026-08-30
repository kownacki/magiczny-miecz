/** A question owed to a seat that no card script is asking: the `ask` frame's own operations (docs/STACK.md). */

import type { CardRef } from "./deck";
import { pop, push, type TurnState } from "./stack";
import type { Question, TurnPhase } from "./turn";

export type AskFrame = Extract<TurnPhase, { phase: "ask" }>;

/** How many answers the question has, so an index can be checked against it. */
export function optionsOf(question: Question): number {
  return question.count;
}

/** The question opens above whatever is running; what is beneath waits. */
export function openAsk(state: TurnState, ask: AskFrame): TurnState {
  return push(state, ask);
}

/** Answered: the frame comes off and the thing beneath resumes. */
export function closeAsk(state: TurnState): TurnState {
  return pop(state);
}

/**
 * Which card the answer takes, and which go back.
 *
 * The whole of the Chochlik's rule, as arithmetic: one of the two lifted cards
 * is kept and the rest are put back. Null for an index that is not one of the
 * options — the server re-walks the answer against what it actually offered,
 * the same way `Decisions` is re-walked against the card, so a number arriving
 * from a browser cannot take a card that was never on the table.
 */
export function pickFrom(
  question: Question,
  choice: number,
): { kept: CardRef; back: CardRef[] } | null {
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.refs.length) return null;
  return {
    kept: question.refs[choice],
    back: question.refs.filter((_, at) => at !== choice),
  };
}

/**
 * The question on top, if the thing on screen is one.
 *
 * Asked by the answering command and by the console, both of which have a
 * stack and want to know whether it is theirs to answer.
 */
export function askOnTop(state: TurnState): AskFrame | null {
  const frame = state.stack[state.stack.length - 1];
  return frame.phase === "ask" ? frame : null;
}
