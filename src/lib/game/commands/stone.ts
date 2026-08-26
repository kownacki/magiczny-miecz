/** Zamieniony w Kamień: three turns of nothing, and what a character does not take into the stone (20.1-20.5). */

import { apply, mergeAll, type Changeset, type Snapshot } from "../change";
import { asReturnable, putOnPile } from "./piles";
import { seatById } from "./seat";

/** 20.1 measures it in turn numbers, so a skipped turn cannot make it drift. */
export const STONE_TURNS = 3;

/**
 * Turns a character to stone.
 *
 * 20.2: stone carries nothing. Przedmioty and gold are left on the Obszar the
 * change happened on and can be picked up by whoever passes (12.1); the
 * Przyjaciele simply leave — "wszyscy Przyjaciele opuszczają Zamienionego w
 * Kamień, odłóż ich Karty na stos Kart zużytych" — and are not recoverable.
 *
 * Zaklęcia stay: 20.5 is explicit that the character keeps them and may use
 * them once it is flesh again.
 */
export function turnToStone(snapshot: Snapshot, command: { seatId: string }): Changeset {
  const seat = seatById(snapshot, command.seatId);
  const held = snapshot.holdings.filter((h) => h.seat_id === seat.id);
  const dropped = held.filter((h) => h.kind === "item");
  const friends = held.filter((h) => h.kind === "friend");

  const taken: Changeset =
    dropped.length + friends.length > 0
      ? { holdings: { delete: [...dropped, ...friends].map((h) => h.id) } }
      : {};

  // "odłóż ich Karty na stos Kart zużytych" — the sentence names the pile, and
  // the friends were reaching it by being deleted, which is a different place.
  const gone = putOnPile(apply(snapshot, taken), "events", friends.map(asReturnable));

  let left: Changeset = {};
  if (seat.field_id) {
    // Gold is left there too, and the deck already has a card that *is* one
    // Sztuka Złota — so a purse of three becomes three of them lying on the
    // Obszar, which is exactly what 12.1 lets the next character pick up.
    const gold = Array.from({ length: seat.zloto }, () => "1-sztuka-zlota");
    const onField = [...dropped.map((h) => h.card_id), ...gold];
    if (onField.length > 0) {
      left = {
        fieldCards: {
          insert: onField.map((cardId) => ({
            field_id: seat.field_id as string,
            card_id: cardId,
          })),
        },
      };
    }
  }

  const until = snapshot.game.turn + STONE_TURNS;
  return mergeAll(taken, gone, left, {
    seats: [{ id: seat.id, patch: { stone_until_turn: until, zloto: 0 } }],
    journal: [
      {
        seatId: seat.id,
        turn: snapshot.game.turn,
        kind: "stone",
        payload: {
          until,
          left: dropped.length,
          zloto: seat.zloto,
          friendsLost: friends.length,
        },
      },
    ],
  });
}
