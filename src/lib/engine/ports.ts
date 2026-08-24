/** The effects ports every rule in the engine reaches through, so the same rules drive a physical table and a browser simulation. */

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
 * Where a drawn card comes from.
 *
 * In companion mode the physical deck is authoritative and a human names the
 * card they drew; in simulation the app owns a shuffled deck. Both answer the
 * same question: which card is now in play.
 *
 * `drawEvent` returns card ids. A companion implementation may return an id for
 * a card that has not been transcribed yet — the referee is deliberately usable
 * before the deck is complete, so callers must tolerate an unknown id and fall
 * back to asking the player what happened.
 */
export interface DeckPort {
  drawEvent(count: number, reason: string): Promise<string[]>;
  drawSpell(count: number, reason: string): Promise<string[]>;
}

/**
 * Choices that belong to a human, not to the rules.
 *
 * Plenty of instructions end in a decision the rulebook leaves open — which
 * direction to walk (10.2), whether to fight or flee (17.2), which item to
 * discard when over the carrying limit (5.6). The engine surfaces them rather
 * than picking, and the same port serves a phone prompt or a scripted test.
 */
export interface ChoicePort {
  choose<T extends string>(prompt: string, options: readonly T[]): Promise<T>;
  confirm(prompt: string): Promise<boolean>;
}

export interface EnginePorts {
  random: RandomPort;
  deck: DeckPort;
  choice: ChoicePort;
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
