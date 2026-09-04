/** Two ways of getting to a fight's ending without arranging the dice to reach it: the test console's `settle` and `endgame`. */

import type { CombatResult } from "@/lib/engine/combat";
import { only, replaceTop, top } from "@/lib/engine/stack";
import { apply, merge, type Changeset, type Outcome, type Snapshot } from "../change";
import { adjustSeat } from "./adjust";
import { seatById } from "./seat";

/**
 * Writes a fight's result without rolling for it (17.4).
 *
 * Rolling until the answer comes out right is what a tester would otherwise
 * have to do, and against a Wilkołak with Miecz 10 there are totals no pair of
 * dice can reach — so the result is written here and then *applied* by
 * `resolveFight`, the same function the last die calls. Everything that
 * follows a loss follows from that: 17.4's Zbroja rolled against the point of
 * Życie, 4.4 if it was the last one, the guardian's own price on the Kamienny
 * Most. None of it lives here — `resolveFight` is the door for all of it,
 * whichever die closed the fight.
 */
export function settleFight(
  snapshot: Snapshot,
  command: { outcome: CombatResult["outcome"] },
): Outcome<string> {
  const state = top(snapshot.game.turn_state);
  if (state.phase !== "fight") throw new Error("No fight is happening.");
  const fight = state.fight;
  const settled: CombatResult =
    command.outcome === "remis"
      ? { outcome: "remis", kind: fight.kind }
      : {
          outcome: command.outcome,
          kind: fight.kind,
          winner: command.outcome === "wygrana" ? "Postać" : fight.cardName,
          loser: command.outcome === "wygrana" ? fight.cardName : "Postać",
        };
  return {
    writes: {
      game: {
        turn_state: replaceTop(snapshot.game.turn_state, {
          ...state,
          // The dice are filled in as well, because everything downstream
          // reads a settled fight as one that was rolled.
          fight: {
            ...fight,
            playerRoll: fight.playerRoll ?? 0,
            enemyRoll: fight.enemyRoll ?? 0,
            result: settled,
          },
        }),
      },
    },
    result: fight.cardName,
  };
}

/**
 * The end of the whole thing, which in this box has only one door (14.7, 22).
 *
 * "CEL GRY" makes beating the Bestia the win and there is no other, so
 * winning is that: the game finished, the turn over, and the victory in the
 * journal — the state `fightBeast` leaves behind, without walking the
 * Kamienny Most to get there.
 *
 * Losing is not its mirror, because the rulebook has no losing condition.
 * What it has is 14.7 — the Bestia takes two points of Życie from whoever
 * loses to it, and 4.4 does the rest if that was the last of them. So a lost
 * `endgame` loses to the Bestia rather than inventing a defeat the game does
 * not have, and spends the two points through `adjustSeat` rather than
 * `spendLife` — a manual "korekta" line beside the `beast-loss` one, which is
 * what the console verb this replaced always wrote, and not the silent
 * `spendLife` a rolled fight uses.
 */
export function endGame(
  snapshot: Snapshot,
  command: { seatId: string; won: boolean },
): Outcome<void> {
  const seat = seatById(snapshot, command.seatId);

  if (command.won) {
    return {
      writes: {
        game: { status: "finished", turn_state: only({ phase: "end" }) },
        journal: [
          {
            seatId: seat.id,
            round: snapshot.game.round,
            kind: "victory",
            payload: { kind: "ordinary", beastTotal: 0 },
          },
        ],
      },
      result: undefined,
    };
  }

  const lost: Changeset = {
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "beast-loss",
        payload: { kind: "ordinary", beastTotal: 0 },
      },
    ],
  };
  // Chained through `apply`, the way `fightBeast`'s own loss is: `lost` only
  // writes a journal line today, so it makes no difference yet — but a step
  // that reads what the step before it wrote is the rule here.
  const adjusted = adjustSeat(apply(snapshot, lost), {
    seatId: seat.id,
    stat: "life",
    delta: -2,
    reason: null,
  });
  return { writes: merge(lost, adjusted.writes), result: undefined };
}
