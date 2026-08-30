/** Zamieniony w Kamień: three turns of nothing, and what a character does not take into the stone (20.1-20.5). */

import { apply, mergeAll, type Changeset, type Snapshot } from "../change";
import { asReturnable, putOnPile } from "./piles";
import { seatById } from "./seat";
import { untouchable } from "@/lib/engine/status";

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
/**
 * Whether this seat is stone right now (20.1).
 *
 * Read off the turn counter rather than a flag, because that is what 20.1
 * measures in: "przez trzy tury", and a turn a character sits out is still a
 * turn. `stone_until_turn` is the turn it becomes flesh again, so the
 * comparison is strict.
 */
export function isStone(snapshot: Snapshot, seatId: string): boolean {
  const seat = snapshot.seats.find((row) => row.id === seatId);
  return seat?.stone_until_turn != null && seat.stone_until_turn > snapshot.game.turn;
}

/**
 * 20.5's two prohibitions, which are one idea: stone is not a legal target.
 *
 * "Postaci Zamienionej w Kamień nie można odebrać punktu Życia. Na taką Postać
 * nie można rzucać Zaklęć."
 *
 * And 20.3's is the same idea seen from inside — "nie może ich używać" of Miecz
 * and Magia. The only moment a stone character would use either is defending an
 * attack, and an attack on stone is one of the things forbidden here, so the
 * ban never has to be enforced separately. That is why two rows of the coverage
 * table close on one guard.
 */
export function refuseAgainstStone(
  snapshot: Snapshot,
  seatId: string,
  what: "attack" | "spell",
): void {
  if (isStone(snapshot, seatId)) {
    throw new Error(
      what === "attack"
        ? "Ta Postać jest Zamieniona w Kamień — nie można jej odebrać punktu Życia (20.5)."
        : "Na Postać Zamienioną w Kamień nie można rzucać Zaklęć (20.5).",
    );
  }

  /**
   * The Krąg Płomieni says the same of an attack, and only of an attack.
   *
   * „Ofiary nie można zaatakować, jednak można się jej wymknąć" — so the
   * prohibition is narrower than 20.5's, which also bars Zaklęcia: a Postać in
   * the flames can be spoken at, and had better be, since the Władca Zaklęć is
   * how anybody gets them out.
   *
   * Read off the status rather than named here, so a second thing that puts a
   * character out of reach lands in one place. `tura-stracona` is left out by
   * `untouchable` for the obvious reason — somebody skipping a turn is standing
   * on the board like anybody else.
   */
  if (what !== "attack") return;
  const beyond = untouchable(
    snapshot.effects
      .filter((row) => row.seat_id === seatId)
      .map((row) => ({
        id: row.id,
        source: row.source,
        label: row.label,
        modifier: row.modifier,
        ends: row.ends,
      })),
  );
  if (beyond) throw new Error(`${beyond} — tej Postaci nie można zaatakować.`);
}

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
    const gold = Array.from({ length: seat.gold }, () => "1-sztuka-zlota");
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
    seats: [{ id: seat.id, patch: { stone_until_turn: until, gold: 0 } }],
    journal: [
      {
        seatId: seat.id,
        turn: snapshot.game.turn,
        kind: "stone",
        payload: {
          until,
          left: dropped.length,
          gold: seat.gold,
          friendsLost: friends.length,
        },
      },
    ],
  });
}
