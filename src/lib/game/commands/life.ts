/** Życie: healing it (4.7), spending it, and what happens to everything a character was carrying when it runs out (4.4). */

import { HEAL_CEILING, heal } from "@/lib/engine/derive";
import { apply, merge, mergeAll, type Changeset, type Outcome, type Snapshot } from "../change";
import { asReturnable, putOnPile } from "./piles";
import { passTurn } from "./turn";

/**
 * Uzdrowienie, up to the starting level and never past it (4.7).
 *
 * Refuses rather than doing nothing when there is nothing to restore, because
 * the offer is always paid for: a Znachor's shilling should not buy a character
 * already at four a fifth point they cannot have.
 */
export function healSeat(
  snapshot: Snapshot,
  command: { seatId: string; amount?: number },
): Outcome<number> {
  const seat = snapshot.seats.find((s) => s.id === command.seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const healed = heal({ zycie: seat.zycie }, command.amount ?? 1).zycie;
  if (healed === seat.zycie) {
    throw new Error(`Uzdrowienie przywraca punkty tylko do ${HEAL_CEILING} (4.7).`);
  }

  return {
    writes: {
      seats: [{ id: seat.id, patch: { zycie: healed } }],
      journal: [
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "uzdrowienie",
          payload: { from: seat.zycie, to: healed },
        },
      ],
    },
    result: healed,
  };
}

/**
 * Takes points of Życie off a seat, and kills it if they run out.
 *
 * Returns what is left as well as the writes, because most callers say
 * something about the number afterwards.
 */
export function spendLife(
  snapshot: Snapshot,
  seatId: string,
  points: number,
): Outcome<number> {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const left = Math.max(0, seat.zycie - points);
  const spent: Changeset = { seats: [{ id: seat.id, patch: { zycie: left } }] };

  if (left > 0 || seat.eliminated) return { writes: spent, result: left };

  const dead = killSeat(apply(snapshot, spent), seat.id);
  return { writes: merge(spent, dead), result: left };
}

/**
 * Death (4.4).
 *
 * "Karty Zaklęć umieszczane są wśród tych, które zostały już użyte" — so the
 * hand goes back to the pile it was dealt from, where 9.5 can shuffle it in
 * again. A trophy has nowhere else to be either. The gear and the friends stay
 * on the Obszar where the character fell, face up for whoever comes next.
 *
 * With the character gone, play must move on if it was their turn — and the
 * pass is decided against a table that already knows they are out, which is the
 * whole reason it is folded in here rather than run afterwards.
 */
export function killSeat(snapshot: Snapshot, seatId: string): Changeset {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  const mine = snapshot.holdings.filter((h) => h.seat_id === seatId);

  const left = mine.filter((h) => h.kind === "item" || h.kind === "friend");
  const spellCards = mine.filter((h) => h.kind === "spell");
  const trophies = mine.filter((h) => h.kind === "trophy");

  const dropped: Changeset =
    left.length > 0 && seat?.field_id
      ? {
          fieldCards: {
            insert: left.map((h) => ({
              field_id: seat.field_id as string,
              card_id: h.card_id,
              granted: h.granted,
            })),
          },
        }
      : {};

  const emptied: Changeset =
    mine.length > 0 ? { holdings: { delete: mine.map((h) => h.id) } } : {};

  const put = mergeAll(dropped, emptied);
  // Chained rather than merged: both write `deck`, and a merge would let the
  // second overwrite the first's pile instead of adding to it.
  const spellsBack = putOnPile(apply(snapshot, put), "spells", spellCards.map(asReturnable));
  const trophiesBack = putOnPile(
    apply(snapshot, mergeAll(put, spellsBack)),
    "events",
    trophies.map(asReturnable),
  );
  const returned = mergeAll(spellsBack, trophiesBack);

  const gone: Changeset = {
    seats: [{ id: seatId, patch: { eliminated: true } }],
    journal: [
      {
        seatId,
        turn: snapshot.game.turn,
        kind: "smierc",
        payload: {
          droppedOnField: left.map((h) => h.card_id),
          spellsDiscarded: spellCards.length,
          field: seat?.field_id ?? null,
        },
      },
    ],
  };

  const soFar = mergeAll(put, returned, gone);
  if (snapshot.game.active_seat !== seat?.seat_index) return soFar;
  return merge(soFar, passTurn(apply(snapshot, soFar)));
}
