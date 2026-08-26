/** The Bestia in the Zamek, and the end of the game (14.7, 22). */

import { beastCombatKind, beastStrength, compareCombat } from "@/lib/engine/combat";
import { apply, merge, type Changeset, type CommandPorts, type Outcome, type Snapshot } from "../change";
import { activeSeat, pointsOf } from "./seat";
import { spendLife } from "./life";

/**
 * Fights the Bestia.
 *
 * Four dice, in this order — the order a companion-mode table types them in:
 * one for the kind of fight, one for its strength, then one each for the two
 * combatants. Nothing here reaches for a die itself; where the numbers come
 * from is the port's business and neither binding is visible from in here.
 */
export async function fightBeast(
  snapshot: Snapshot,
  _command: void,
  ports: CommandPorts,
): Promise<Outcome<void>> {
  const seat = activeSeat(snapshot);

  const kindDie = await ports.random.rollD6("bestia: rodzaj walki");
  const strengthDie = await ports.random.rollD6("bestia: siła");

  const kind = beastCombatKind(kindDie);
  const beastTotal = beastStrength(strengthDie);
  const totals = pointsOf(snapshot, seat.id, "walka");
  const mine = kind === "magical" ? totals.magia : totals.miecz;

  const myDie = await ports.random.rollD6("bestia: rzut Postaci");
  const itsDie = await ports.random.rollD6("bestia: rzut Bestii");

  const result = compareCombat(
    { label: "Postać", total: mine, roll: myDie },
    { label: "Bestia", total: beastTotal, roll: itsDie },
    kind,
  );

  if (result.outcome === "wygrana") {
    return {
      writes: {
        game: { status: "finished", turn_state: { phase: "end" } },
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "victory",
            payload: { kind, beastTotal, rolls: { kindDie, strengthDie, myDie, itsDie } },
          },
        ],
      },
      result: undefined,
    };
  }

  if (result.outcome === "przegrana") {
    // Two points, not one (14.7).
    const lost: Changeset = {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "beast-loss",
          payload: { kind, beastTotal },
        },
      ],
    };
    // Chained through `apply` rather than handed the bare snapshot: `lost` only
    // writes a journal line today, so it makes no difference — but a step that
    // reads what the step before it wrote is the rule here, and the one place
    // it was not followed is the one place a write went missing.
    const spent = spendLife(apply(snapshot, lost), seat.id, 2);
    return { writes: merge(lost, spent.writes), result: undefined };
  }

  return {
    writes: {
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "beast-draw",
          payload: { kind, beastTotal },
        },
      ],
    },
    result: undefined,
  };
}
