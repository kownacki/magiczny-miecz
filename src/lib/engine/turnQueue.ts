/** Projects who acts next, and who gets passed over on the way, for the turn bar. */

import { nextSeat, type TurnOrderSeat } from "./turn";
import { stillStone } from "./status";

/** How many actual turns to look ahead. Skips do not count against this. */
export const DEFAULT_DEPTH = 10;

export type QueueStatus = "active" | "upcoming" | "skipped";

/** Why a seat is being passed over. Stone and a lost turn are different things (20.4). */
export type SkipReason = "stone" | "lost";

export interface QueueEntry {
  seatIndex: number;
  /** The round this entry falls on, on the same clock `games.round` uses. */
  round: number;
  status: QueueStatus;
  reason?: SkipReason;
  /**
   * Turns still to sit out, counting this one. Three for a character turned to
   * Stone on the turn it happened, one for the last of a run of lost turns —
   * so the bar can say "jeszcze 2 tury" rather than only "pomijana".
   */
  remaining?: number;
}

/**
 * Walks the order forward from the current seat.
 *
 * This is a *forecast*, not a schedule. Almost everything that costs a turn in
 * this game is created during a turn — Labirynt and Spalona Ziemia catch
 * whoever lands on them, Burza Siedmiu Słońc and Zaklinacz Czasu hit the whole
 * table at once — so anything past the active seat can be invalidated by the
 * next card drawn. The bar has to show it as provisional, and this function
 * cannot promise otherwise.
 *
 * It deliberately mirrors `finishTurn` step for step rather than reimplementing
 * the rules: same `nextSeat`, same decrement, same wrap test. A projection that
 * disagrees with what the app then does is worse than no projection, because
 * players would trust it.
 */
export function projectQueue(
  seats: readonly TurnOrderSeat[],
  current: number | null,
  round: number,
  depth: number = DEFAULT_DEPTH,
): QueueEntry[] {
  // A working copy: lost turns are spent as the walk passes over them, exactly
  // as finishTurn spends them in the database.
  const state = seats.map((seat) => ({ ...seat }));
  const entries: QueueEntry[] = [];

  if (current !== null && state.some((seat) => seat.index === current)) {
    entries.push({ seatIndex: current, round, status: "active" });
  }

  let cursor = current;
  let clock = round;
  let taken = 0;

  while (taken < depth) {
    const { seat: next, skipped } = nextSeat(state, cursor, clock);

    for (const index of skipped) {
      const seat = state.find((candidate) => candidate.index === index);
      if (!seat) continue;
      // Stone is tested first, because that is the order nextSeat tests them
      // in: a character who is both frozen and owed a lost turn reads as frozen.
      const frozen = stillStone(seat.stoneUntilRound, clock);
      // Which round the skipped slot belongs to.
      //
      // The walk passes seats in index order, so any seat at or below the one
      // we came from is on the far side of the wrap and its slot is in the NEXT
      // round — the same test finishTurn makes for the seat that lands. Stamping
      // the pre-wrap turn instead put the skip in the round the player had just
      // finished, so with two seats you saw yourself active in Tura 1 and
      // skipped in Tura 1, when the turn being lost is the one in Tura 2.
      //
      // Only the label moves: `frozen` and the decrement below still use
      // `clock`, because that is the turn nextSeat judged them against and the
      // forecast must not decide anything differently from finishTurn.
      const slotTurn = index <= (cursor ?? -1) ? clock + 1 : clock;
      entries.push({
        seatIndex: index,
        round: slotTurn,
        status: "skipped",
        reason: frozen ? "stone" : "lost",
        remaining: frozen ? seat.stoneUntilRound! - clock : seat.turnsLost,
      });
      // Mirrors finishTurn, which spends a lost turn on any skipped seat that
      // has one — including a frozen one. Whether that is right is a rules
      // question (a character in Stone arguably cannot be spending turns), but
      // it is what the app does, and the forecast has to match the app.
      if (seat.turnsLost > 0) seat.turnsLost -= 1;
    }

    // Nobody can act: everyone is eliminated, frozen or sitting out. finishTurn
    // parks `active_seat` at null here, so the forecast stops too.
    if (next === null) break;

    // The turn counter advances when play comes back round to or past the first
    // seat — the same test finishTurn makes, and what the Stone timer counts.
    if (next <= (cursor ?? 0)) clock += 1;
    cursor = next;
    entries.push({ seatIndex: next, round: clock, status: "upcoming" });
    taken += 1;
  }

  return entries;
}

/** The seats a viewer is waiting on before their own next turn, in order. */
export function turnsUntil(queue: readonly QueueEntry[], seatIndex: number): number | null {
  let waited = 0;
  for (const entry of queue) {
    if (entry.status === "skipped") continue;
    if (entry.seatIndex === seatIndex && entry.status !== "active") return waited;
    if (entry.status === "upcoming") waited += 1;
  }
  return null;
}
