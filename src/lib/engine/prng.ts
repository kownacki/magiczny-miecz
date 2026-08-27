/** Randomness you can ask for twice and get the same answer. */

/**
 * Why a game has a seed.
 *
 * A command is a pure function of its snapshot, its inputs and its randomness,
 * which is what makes replaying a game from its inputs possible at all — and
 * replay is how docs/TERMINAL.md winds a game back: to reach move 40, run 1–40
 * into a fresh store. No inverse patches, no undo stack, nothing to get subtly
 * wrong.
 *
 * Randomness reaches the rules through two doors and only one of them was ever
 * written down. Dice go through `RandomPort`, and `attempt()` already collects
 * every roll so a retry throws the same numbers. The other door is the
 * `Shuffle` the edge hands in when a used pile is turned over (9.5, 15.5) — and
 * `decks.ts` bound it to `Math.random` at module load, so the order a pile came
 * back in was gone the moment it happened.
 *
 * The note in `commands/draw.ts` weighed this and let it stand, correctly: it
 * was asking whether a *retry* should reshuffle identically, and the answer is
 * that a retry re-reads the snapshot and is not even turning over the same
 * pile. Replaying a whole game is a different question, and it needs the order
 * to be recoverable.
 *
 * So the game carries a seed, and every shuffle is a function of that seed and
 * the revision it happens at. Same game, same point, same order — and because
 * the revision is part of it, two shuffles in one game never share an order.
 */

/**
 * A 32-bit hash of a string, so a seed can be a word somebody could read out.
 *
 * FNV-1a: small, no dependencies, and good enough for what this is — the
 * requirement is that two different seeds land somewhere different, not that
 * anything be unguessable. Nothing here is a secret; a save file holds the
 * whole game anyway.
 */
export function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A stream of numbers in [0, 1), from a starting point.
 *
 * mulberry32, which is thirty years newer than this game and four lines long.
 * The only property that matters here is that the same seed gives the same
 * sequence on every machine and every run — so no `Math.random`, no date, and
 * nothing that varies with the platform.
 */
export function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = state;
    drawn = Math.imul(drawn ^ (drawn >>> 15), drawn | 1);
    drawn ^= drawn + Math.imul(drawn ^ (drawn >>> 7), drawn | 61);
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The stream for one moment in one game.
 *
 * Keyed on the revision as well as the seed, so the pile turned over on move
 * twelve does not come back in the same order as the one on move three — and so
 * that replaying move twelve reproduces exactly the order move twelve had.
 */
export function streamFor(seed: string, revision: number): () => number {
  return randomFrom(hashOf(`${seed}:${revision}`));
}
