/** Reading a seat off a snapshot in the shapes the engine asks for. The seed of one seat view, which is still seven shapes today. */

import { bonusFromHoldings, type Reckoning } from "@/lib/engine/holdings";
import type { Holding } from "@/lib/engine/state";
import type { EqMode, Slot } from "@/lib/engine/slots";
import type { HoldingRow, SeatRow } from "../store";
import type { Snapshot } from "../change";

export function eqModeOf(game: { eq_mode: string }): EqMode {
  return game.eq_mode === "slotowy" ? "slotowy" : "klasyczny";
}

export function asHolding(row: HoldingRow): Holding {
  return {
    cardId: row.card_id,
    kind: row.kind,
    face: row.face,
    slot: (row.slot ?? null) as Slot | null,
  };
}

export function seatById(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  return seat;
}

export function activeSeat(snapshot: Snapshot): SeatRow {
  const seat = snapshot.seats.find((s) => s.seat_index === snapshot.game.active_seat);
  if (!seat) throw new Error("Brak aktywnego gracza.");
  return seat;
}

export function holdingsOf(snapshot: Snapshot, seatId: string): Holding[] {
  return snapshot.holdings.filter((h) => h.seat_id === seatId).map(asHolding);
}

/**
 * Own points plus what the cards lend (1.5, 2.5).
 *
 * The one expression this replaces was written out eleven times in the store
 * and once more in the read route, each of them re-deriving the same sum with
 * its own `Reckoning` argument. Only the character's own points are stored;
 * this is the read-time addition the non-negotiable insists on, kept in one
 * place so it cannot be two different sums.
 */
export function pointsOf(
  snapshot: Snapshot,
  seatId: string,
  as: Reckoning,
): { miecz: number; magia: number } {
  const seat = seatById(snapshot, seatId);
  const bonus = bonusFromHoldings(holdingsOf(snapshot, seatId), eqModeOf(snapshot.game), as);
  return { miecz: seat.miecz_own + bonus.miecz, magia: seat.magia_own + bonus.magia };
}
