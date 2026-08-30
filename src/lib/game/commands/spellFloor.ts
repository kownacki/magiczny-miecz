/** Who has the floor before the dice, and for how long (17.3, 17.7). */

import { castableNow, momentsIn, spellScript } from "@/lib/engine/spells";
import type { SpellFloor } from "@/lib/engine/turn";
import type { Changeset, CommandPorts, Outcome, Snapshot } from "../change";
import { seatById } from "./seat";
import { nameOfSeat } from "./lobby";
import { replaceTop, top } from "@/lib/engine/stack";

/**
 * How long a claim lasts before it lapses.
 *
 * Long enough to read a hand and decide, short enough that a tab left open on a
 * bus does not hold the table. Fifteen seconds was not enough to read a hand.
 */
export const FLOOR_MS = 30_000;

/** The claim on this fight, or null when nobody holds it or the last one lapsed. */
export function floorOf(
  fight: { caster?: SpellFloor | null },
  now: number,
): SpellFloor | null {
  const floor = fight.caster ?? null;
  return floor && floor.until > now ? floor : null;
}

/**
 * Asks for the floor before the dice (17.3), or answers somebody who has it.
 *
 * The claim is exclusive, so nobody speaks over anybody — and answering is
 * itself a claim, which is what lets WŁADCA ZAKLĘĆ negate a spell and
 * ZWIERCIADŁO reflect one back. A single window before the dice could never
 * hold that.
 */
export function claimFloor(
  snapshot: Snapshot,
  command: { seatId: string },
  ports: CommandPorts,
): Outcome<void> {
  const state = top(snapshot.game.turn_state);
  if (state.phase !== "fight") throw new Error("Nie ma walki.");

  const seat = seatById(snapshot, command.seatId);
  if (seat.eliminated) throw new Error("Zmarła Postać nie rzuca Zaklęć (4.4).");

  const held = floorOf(state.fight, ports.now());
  if (held && held.seat !== seat.seat_index) {
    throw new Error(`${nameOfSeat(snapshot.users, held.seat)} właśnie rzuca Zaklęcie — poczekaj.`);
  }

  // 17.4 ends the fight at the dice, so there is nothing left to react to.
  if (state.fight.result) throw new Error("Walka jest już rozstrzygnięta (17.4).");

  // The same reading `castSpell` will refuse against, so the floor is never
  // granted for a hand that could not legally speak anyway.
  const open = momentsIn(state);
  const canCast = snapshot.holdings.some((held2) => {
    if (held2.seat_id !== seat.id || held2.kind !== "spell") return false;
    const script = spellScript(held2.card_id);
    return script ? castableNow(script, open) : false;
  });
  if (!canCast) throw new Error("Nie masz Zaklęcia, które można teraz rzucić (9.1).");

  return {
    writes: {
      game: {
        turn_state: replaceTop(snapshot.game.turn_state, {
          ...state,
          fight: {
            ...state.fight,
            caster: { seat: seat.seat_index, until: ports.now() + FLOOR_MS },
          },
        }),
      },
    },
    result: undefined,
  };
}

/** Gives it up again, so the next person does not have to wait it out. */
export function releaseFloor(
  snapshot: Snapshot,
  command: { seatId: string },
  ports: CommandPorts,
): Outcome<void> {
  const state = top(snapshot.game.turn_state);
  const nothing: Changeset = {};
  if (state.phase !== "fight") return { writes: nothing, result: undefined };

  const seat = seatById(snapshot, command.seatId);
  const held = floorOf(state.fight, ports.now());
  // Somebody else's claim is not this seat's to drop.
  if (held && held.seat !== seat.seat_index) return { writes: nothing, result: undefined };

  return {
    writes: {
      game: {
        turn_state: replaceTop(snapshot.game.turn_state, {
          ...state,
          fight: { ...state.fight, caster: null },
        }),
      },
    },
    result: undefined,
  };
}
