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
 * What a verb says when the frame it needs is not the one on screen.
 *
 * One sentence per frame kind, so "there is no fight" is phrased the same way
 * wherever it is said. It was written out at each site before this table, six
 * times verbatim for `fight` alone, and the copies had begun to disagree.
 *
 * These are refusals about the *shape of the turn*, not about a printed rule,
 * so they carry no rule number — see CLAUDE.md on where numbers go. A verb
 * whose refusal does enforce a rule passes its own sentence to `requireTop`,
 * which is why the override exists: "Zabierać można tylko po zakończeniu ruchu
 * na tym Obszarze (12.1)" is about 12.1, not about there being no field frame.
 */
const NOT_ON_SCREEN: Record<TurnPhase["phase"], string> = {
  roll: "Nie czas na rzut.",
  move: "Nie czas na ruch.",
  field: "Nie ma czego rozpatrywać.",
  fight: "Nie ma walki.",
  bridge: "Nie ma teraz próby wejścia na Most.",
  script: "Nic tu nie czeka na dokończenie.",
  loop: "Nie ma walki w rundach.",
  ask: "Nic tu nie czeka na odpowiedź.",
  overflow: "Nie ma nadmiaru Kart do odłożenia.",
  end: "Tura jeszcze się nie skończyła.",
};

/**
 * What is standing in the way, when something is — the inverse of the table
 * above.
 *
 * `NOT_ON_SCREEN` answers "the frame you wanted is not here"; this answers "and
 * here is what *is*", which is the half a player can act on. Four of the ten
 * are not in anybody's way: `roll`, `move` and `end` are a turn between things
 * and `field` is a turn doing the ordinary thing, so they answer null and the
 * caller says whatever it says when nothing is wrong.
 *
 * Clauses rather than sentences, each one able to stand after a dash: "Nie czas
 * na ciągnięcie Kart — trwa walka." A refusal that names only what you cannot
 * do leaves you to guess what to type next.
 *
 * No rule numbers, for the reason written over `NOT_ON_SCREEN`: these are facts
 * about the shape of the turn, not about a printed rule, and the honest answer
 * to "which rule?" is none.
 */
const IN_THE_WAY: Record<TurnPhase["phase"], string | null> = {
  roll: null,
  move: null,
  field: null,
  end: null,
  fight: "trwa walka",
  loop: "trwa walka w rundach",
  bridge: "trwa próba wejścia na Most",
  overflow: "trzeba odłożyć nadmiar Kart",
  script: "Karta jest w trakcie rozpatrywania",
  ask: "Karta czeka na odpowiedź",
};

/**
 * The frame in the way, named — with the Karta it belongs to where there is one.
 *
 * The two frames a Karta opens carry their own `reason`, which is the card's
 * name, and it is the thing worth saying: "KUGLARZ jest w trakcie
 * rozpatrywania" tells you what to type next and "trwa coś" does not. The
 * table's own wording is what a frame carrying no reason falls back to.
 *
 * Null when the top frame is not in anybody's way. That is not the same as
 * "nothing is wrong" — a stack deeper than one frame can have an ordinary
 * `field` on top — so a caller that refused for its own reasons still needs a
 * sentence of its own to fall back on.
 */
export function whatIsOpen(state: TurnState): string | null {
  const frame = top(state);
  if (frame.phase === "script" && frame.reason) {
    return `${frame.reason} jest w trakcie rozpatrywania`;
  }
  if (frame.phase === "ask" && frame.reason) return `${frame.reason} czeka na odpowiedź`;
  return IN_THE_WAY[frame.phase];
}

/**
 * The frame on screen, insisting it is the kind asked for.
 *
 * The narrowed frame comes back, so a caller that needed `fight.fight` reads it
 * off the return value instead of casting the union open — which is what the
 * `as Extract<TurnPhase, …>` casts scattered through the tests were doing.
 *
 * The cast inside is the one thing TypeScript cannot follow: it does not narrow
 * a union through a comparison against a generic parameter, even when the
 * comparison is exactly the discriminant. It is sound because `phase` is that
 * discriminant and the check immediately precedes it.
 */
export function requireTop<K extends TurnPhase["phase"]>(
  state: TurnState,
  kind: K,
  refusal?: string,
): Extract<TurnPhase, { phase: K }> {
  const frame = top(state);
  if (frame.phase !== kind) throw new Error(refusal ?? NOT_ON_SCREEN[kind]);
  return frame as Extract<TurnPhase, { phase: K }>;
}

/**
 * The same question asked quietly: the narrowed frame, or null.
 *
 * For the verbs that have something sensible to do when the frame is not there
 * — an empty Changeset, an empty list, `false` — rather than a refusal to show
 * the player.
 */
export function topIf<K extends TurnPhase["phase"]>(
  state: TurnState,
  kind: K,
): Extract<TurnPhase, { phase: K }> | null {
  const frame = top(state);
  return frame.phase === kind ? (frame as Extract<TurnPhase, { phase: K }>) : null;
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
