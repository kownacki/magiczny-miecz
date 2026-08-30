/** The resolution stack: the turn as a pile of frames, of which the top is on screen. */

import type { TurnPhase } from "./turn";

/**
 * What `games.turn_state` holds — see docs/STACK.md.
 *
 * A frame is today's `TurnPhase`, unchanged: the union and its `phase`
 * discriminant stay exactly as they were, because step 1 changes where a phase
 * *sits*, not what it is. New frame kinds (`script`, `ask`, `cast`, `loop`)
 * arrive in step 2 and join the same union.
 *
 * The stack is never empty. An empty stack has no answer to "what is on
 * screen", and every operation below preserves non-emptiness rather than
 * checking it at each read.
 */
export interface TurnState {
  stack: TurnPhase[];
}

/** The frame on screen. */
export function top(state: TurnState): TurnPhase {
  return state.stack[state.stack.length - 1];
}

/**
 * A one-frame stack.
 *
 * Step 1's workhorse: every write that used to replace the whole `turn_state`
 * with a phase now replaces it with `only(phase)` — same meaning, new shape.
 * Each of these call sites is a candidate to become `push`/`replaceTop` in
 * step 2, which is when what is *beneath* starts being worth keeping.
 */
export function only(phase: TurnPhase): TurnState {
  return { stack: [phase] };
}

/** A frame opens on top of what is running; what is beneath waits. */
export function push(state: TurnState, frame: TurnPhase): TurnState {
  return { stack: [...state.stack, frame] };
}

/**
 * The top frame is done; the one beneath resumes.
 *
 * Popping the last frame is a programming error, not a game state — some frame
 * must be on screen — so it throws rather than minting an empty stack for the
 * next read to trip over.
 */
export function pop(state: TurnState): TurnState {
  if (state.stack.length < 2) {
    throw new Error("Nie ma dokąd wrócić — to ostatnia ramka.");
  }
  return { stack: state.stack.slice(0, -1) };
}

/** The top frame advances in place: a roll recorded, a card drawn, a total set. */
export function replaceTop(state: TurnState, frame: TurnPhase): TurnState {
  return { stack: [...state.stack.slice(0, -1), frame] };
}

/**
 * Reads whatever the database holds as a stack.
 *
 * Three shapes arrive here and each has a reason:
 *
 * - `{ stack: [...] }` — a row written after step 1.
 * - `{ phase: ... }` — a row written before it. The column's own default is
 *   still `'{"phase":"roll"}'` until the schema moves, and Michał ruled the
 *   live tables disposable (docs/STACK.md, "Rulings taken"), so old rows are
 *   read as a one-frame stack rather than migrated: tolerate for one release,
 *   then this branch and the old default go together.
 * - anything else — a row that never had a turn (a lobby created before the
 *   column's default existed, a test fixture that left it out). `end` rather
 *   than `roll`, because inventing a turn nobody started is worse than
 *   admitting there is nothing on screen.
 */
export function asTurnState(raw: unknown): TurnState {
  if (raw && typeof raw === "object" && Array.isArray((raw as TurnState).stack)) {
    const state = raw as TurnState;
    if (state.stack.length > 0) return state;
  }
  if (raw && typeof raw === "object" && "phase" in raw) {
    return only(raw as TurnPhase);
  }
  return only({ phase: "end" });
}
