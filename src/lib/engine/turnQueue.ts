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
      /**
       * Mirrors finishTurn, which spends a lost turn on any skipped seat that
       * has one — including a frozen one. A statue owed turns pays them off
       * *while* it is stone rather than after, so being stoned mid-debt costs
       * three rounds and not three plus the debt.
       *
       * This was written down as an open rules question and it has an answer.
       * 16.1 is what settles it: „Jeżeli spowodowałoby to utratę tury przez
       * Postać, musi ona powstrzymać się od podejmowania jakichkolwiek dalszych
       * działań — **ta właśnie tura** liczy się jako stracona." The character
       * there has already rolled, already moved and already arrived, and the
       * turn still counts as the lost one — so what makes a turn *lost* in this
       * box is that the character spends it doing nothing, not that it was a
       * turn they would otherwise have enjoyed. A round in Kamień is exactly a
       * turn spent doing nothing.
       *
       * 20.1 and 20.4 agree from the other end: „powraca... po zakończeniu 3
       * tury" and „przez trzy tury nie może się poruszać" both state the
       * incapacity as three, and a debt that survived the stone would keep a
       * character out for three plus however many it owed.
       *
       * So does this file's own vocabulary, which is where the doubt came from:
       * `DEBT` is the one countdown that "counts turns NOT taken — each go it
       * names is one the holder does not get", and three of them are not got.
       *
       * (Nothing can *add* to the debt while the stone lasts: `seatsTargeted`
       * passes a statue over, so a Burza Siedmiu Słońc drawn by somebody else
       * does not reach it. The only way into this state is to owe turns first
       * and be stoned after — a Fatum, which can be spoken at any moment.)
       */
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
