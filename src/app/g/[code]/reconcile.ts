/** What a device believes about the table, against what the server just said. */

import type { SeatCharacter } from "@/lib/engine/characters";
import type { Slot } from "@/lib/engine/slots";
import type { Seat } from "./table";

/**
 * The three decisions inside a refresh, taken out of it.
 *
 * A poll and the refetch after a move are in flight at the same time, and this
 * device is showing two things at once: what the server last said, and what the
 * player just did that the server has not confirmed yet. Deciding which of
 * those survives a new answer is the whole of what makes the table feel
 * immediate rather than laggy — and every one of these rules is here because
 * the obvious version of it was wrong first.
 *
 * They lived inside `refresh` as two `setState` callbacks and an early return,
 * which is a place nothing can be asked a question. The bugs they fix are all
 * of the kind that look like a rendering glitch: a card snapping back to where
 * it was for one tick, a Postać you picked flickering off the seat, a Hełm
 * pinned to a head for the rest of the evening because one request never
 * arrived.
 */

/**
 * How long an unconfirmed move is allowed to stand.
 *
 * Two polls at the fast rate. Long enough that the ordinary round trip is never
 * interrupted, short enough that a request which never arrived does not hold a
 * card somewhere the table does not know about for the rest of the game.
 */
export const MOVE_HOLDS_FOR_MS = 4000;

/**
 * Whether an answer is older than what is already on screen.
 *
 * The poll and a move's own refetch race, and a poll that *started* before the
 * write can land after it — putting the old state back and snapping the card
 * the player just moved into its old place until the next tick moved it again.
 * The revision counter already numbers every change the table makes, so an
 * answer behind the one being rendered is simply dropped.
 *
 * Equal is not stale. Two reads of an unchanged table carry the same number,
 * and refusing the second would drop every answer after the first.
 */
export function isStale(incoming: number, rendered: number): boolean {
  return incoming < rendered;
}

/**
 * Which characters taken client-first are still waiting to be confirmed.
 *
 * Only ever the surprise: any number of seats may ask to be surprised, so there
 * is no race to lose and the pick can land on the seat before the request goes
 * out. Everything else waits for the server, because two people can want the
 * Kapłanka and only the server knows who asked first.
 *
 * A pick is dropped the moment the server reports the same thing — and dropped
 * too when its seat has gone, because a seat that is no longer at the table
 * cannot be waiting for anything.
 */
export function standingPicks(
  pending: Readonly<Record<string, SeatCharacter>>,
  seats: readonly Seat[],
): Record<string, SeatCharacter> {
  return keepIf(pending, (seatId, characterId) => {
    const seat = seats.find((row) => row.id === seatId);
    return seat ? seat.character_id !== characterId : false;
  });
}

/**
 * Which slot moves made on screen are still waiting to be confirmed.
 *
 * Three ways to stop standing, and the middle one is the one that took two
 * attempts. A move is dropped when the card it moved is gone, when the server
 * reports it in the place the player put it — and when it has waited longer
 * than `MOVE_HOLDS_FOR_MS`.
 *
 * Timed from when the move was made rather than from when the request was
 * answered. Timing it to the request meant the card fell back the moment a
 * stale answer arrived, which is the same race in a different coat: what the
 * move is waiting for is the table agreeing with it, not a particular reply.
 */
export function standingMoves(
  pending: Readonly<Record<string, Slot | null>>,
  seats: readonly Seat[],
  madeAt: Readonly<Record<string, number>>,
  now: number,
): Record<string, Slot | null> {
  const held = seats.flatMap((seat) => seat.holdings);
  return keepIf(pending, (holdingId, slot) => {
    const card = held.find((candidate) => candidate.id === holdingId);
    if (!card) return false;
    if (now - (madeAt[holdingId] ?? 0) > MOVE_HOLDS_FOR_MS) return false;
    return (card.slot ?? null) !== slot;
  });
}

/**
 * The same object back when nothing was dropped.
 *
 * These are React state, and a filter that rebuilds an identical object is a
 * re-render — every two seconds, per device, for the whole game, in the case
 * that is by far the commonest: nothing pending and nothing to decide.
 */
function keepIf<T>(
  pending: Readonly<Record<string, T>>,
  stands: (key: string, value: T) => boolean,
): Record<string, T> {
  const kept = Object.fromEntries(
    Object.entries(pending).filter(([key, value]) => stands(key, value)),
  );
  return Object.keys(kept).length === Object.keys(pending).length
    ? (pending as Record<string, T>)
    : kept;
}
