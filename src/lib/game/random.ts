/** Where a command's dice come from: the bindings of `RandomPort` this app actually has. */

import type { RandomPort } from "@/lib/engine/ports";

/**
 * The app throws the dice.
 *
 * Simulation's binding, and the one the rules must never be able to recognise
 * as different from a human reading a die off the table.
 */
export function appRandom(): RandomPort {
  return {
    async rollD6() {
      return 1 + Math.floor(Math.random() * 6);
    },
  };
}

/**
 * A human already threw them, and typed in what came up.
 *
 * Companion mode's binding. The values are consumed in the order the command
 * asks for them, which is why a command's rolls are documented in the order it
 * makes them — the same contract `scriptedRandom` has always had in the engine
 * tests.
 *
 * A missing or null value falls through to `fallback` rather than failing.
 * That is not laxity: it is exactly the `value ?? roll` the store used to write
 * out at every die, kept intact so this change moves the branch without
 * changing what it decides. The difference is that the branch now lives in one
 * adapter at the edge instead of fifteen times inside the rules.
 */
export function supplied(
  values: readonly (number | null | undefined)[],
  fallback: RandomPort,
): RandomPort {
  let next = 0;
  return {
    async rollD6(reason) {
      const given = values[next++];
      if (given === null || given === undefined) return fallback.rollD6(reason);
      if (!Number.isInteger(given) || given < 1 || given > 6) {
        throw new Error("Kostka daje wynik od 1 do 6.");
      }
      return given;
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
