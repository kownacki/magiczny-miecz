/** Every input that produced a game, so it can be produced again. */

/**
 * What replay needs, and why it is only these three things.
 *
 * A command is a pure function of its snapshot, its inputs and its randomness.
 * The snapshot is the game so far, so replaying from the start needs the other
 * two — and the randomness reaches the rules through two doors, of which only
 * one is written down anywhere.
 *
 * Shuffles are a function of the game's seed and the revision they happen at
 * (`prng.ts`), so they need nothing here: the same seed replayed reaches the
 * same order. Dice do not. They come off `appRandom` and are gone the moment
 * they land — the journal keeps a `roll` payload for some of them and nothing
 * at all for the rest — so a replay that re-threw them would be a different
 * game with the same moves.
 *
 * So the record is: what somebody typed, and what the dice said while it ran.
 *
 * # Why the dice are recorded rather than seeded
 *
 * Seeding them the way shuffles are seeded would make the record smaller — the
 * commands alone — and it was the first thing tried. It buys less than it
 * looks: a rule that throws one more die shifts every later draw off the same
 * stream, so a seeded record breaks on a rules change exactly as a recorded one
 * does. Recording touches no plumbing, and `scriptedRandom` — which exists — is
 * already the other half of it.
 */

/** One line somebody typed, and everything that was random while it ran. */
export interface Recorded {
  /** In order, from one. */
  seq: number;
  /** Who was driving when it was typed. A name rather than an id, as the journal does. */
  actor: string | null;
  /** Exactly what was typed, unparsed — the input, not what it became. */
  line: string;
  /** Every die thrown while it ran, in the order they were thrown. */
  rolls: number[];
}

/**
 * The dice of the change being made right now.
 *
 * Module-level and deliberately: a single console line can cause four changes —
 * `fight` begins one, throws twice and settles it — and the record wants them
 * as one entry, so something has to outlive an individual `change()`. Nothing
 * reads it except the runner that opened it.
 *
 * Null when nobody is recording, which is the browser's whole life: the record
 * lives in a save file, and Supabase has no column for it.
 */
let collecting: number[] | null = null;

/** Start collecting. Returns what the caller should hand back to `stopRecording`. */
export function startRecording(): void {
  collecting = [];
}

/** Everything thrown since `startRecording`, and stop. */
export function stopRecording(): number[] {
  const rolls = collecting ?? [];
  collecting = null;
  return rolls;
}

/** Called by `change` for every die a rule threw. Cheap and silent when nobody is listening. */
export function noteRolls(rolls: readonly number[]): void {
  if (collecting !== null) collecting.push(...rolls);
}
