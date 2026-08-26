/** The one effect a rule cannot work out for itself: a die. */

/*
 * There used to be three interfaces here, and two of them were furniture.
 *
 * `DeckPort` and `ChoicePort` described a layering this app never built, and
 * `EnginePorts` bundled all three for a caller that never existed — so the file
 * read as though randomness, card identity and human choice all arrived the
 * same way, when only one of them arrived at all. An interface with no
 * implementation is worse than a missing one: it reads as done.
 *
 * What replaced them, in the end, was not ports. Which card comes up is settled
 * by handing a command the shuffled pile or the `Shuffle` itself — the rule
 * decides whether the deck is turned over, the edge decides what order it comes
 * back in — and a human choice arrives as `Decisions`, a list of numbers the
 * server re-walks the card against, so that a card cannot be talked into doing
 * something it does not say. Both are better than the ports they replace, and
 * neither is one.
 *
 * The die really is a port, and has three bindings: the app throws it, a table
 * types it in, or a test scripts it.
 */

/**
 * Where a die result comes from.
 *
 * At a physical table a human rolls and types the number in; in simulation the
 * app rolls. The rules must not be able to tell the difference — that is the
 * whole reason this is a port rather than a branch inside the rules. `reason`
 * is passed so a companion-mode implementation can prompt for the right thing
 * ("roll for Kurhan") instead of an anonymous number box.
 */
export interface RandomPort {
  /** One six-sided die. The only randomiser the base game uses. */
  rollD6(reason: string): Promise<number>;
}

/**
 * A deterministic `RandomPort` for tests and for reproducing a reported table
 * state: it hands out the given results in order, then refuses rather than
 * silently inventing one, so a test that rolls more often than it meant to
 * fails loudly instead of drifting.
 */
export function scriptedRandom(results: readonly number[]): RandomPort {
  let next = 0;
  return {
    async rollD6(reason) {
      if (next >= results.length) {
        throw new Error(`scriptedRandom exhausted: unexpected roll for "${reason}"`);
      }
      return results[next++];
    },
  };
}
