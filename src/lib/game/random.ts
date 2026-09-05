/** Where a command's dice come from: the bindings of `RandomPort` this app actually has. */

import type { RandomPort } from "@/lib/engine/ports";

/**
 * The app throws the dice.
 *
 * The one binding the app itself uses, and the one the rules must never be
 * able to recognise as different from a die on a real table.
 */
export function appRandom(): RandomPort {
  return {
    async rollD6() {
      return 1 + Math.floor(Math.random() * 6);
    },
  };
}

/**
 * The same throw twice, when a commit had to be retried.
 *
 * A losing commit is a commit nobody saw — nothing was written and no response
 * went out — so re-running the command is safe. Re-*rolling* it would not be:
 * a retry that quietly changed a 6 into a 2 would be the app deciding a fight
 * on which attempt happened to win the race. So every roll is written down as
 * it is made, and a retry replays the log before it asks for anything new.
 *
 * One log outlives the attempts; a fresh wrapper per attempt rewinds to its
 * start.
 */
export function replayable(base: RandomPort, log: number[]): RandomPort {
  let next = 0;
  return {
    async rollD6(reason) {
      if (next < log.length) return log[next++];
      const rolled = await base.rollD6(reason);
      log.push(rolled);
      next++;
      return rolled;
    },
  };
}
