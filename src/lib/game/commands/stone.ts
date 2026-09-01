/** Zamieniony w Kamień: three turns of nothing, and what a character does not take into the stone (20.1-20.5). */

import { apply, merge, mergeAll, type Changeset, type Snapshot } from "../change";
import { asReturnable, dropGold, putOnPile } from "./piles";
import { seatById } from "./seat";
import { stillStone, untouchable } from "@/lib/engine/status";

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
 * them once it is flesh again — keeps, and may not speak until then, which is
 * `refuseWhileHeld`'s job rather than this one's.
 *
 * **The box contradicts itself about the Przyjaciele, and 20.2 wins.** 12.1's
 * worked example lays out what a stoned Hummit left on the Ruchome Skały — "2
 * Sztuki Złota, Opiekun (Przyjaciel), Sztylet i Rękawice, Magiczny Miecz i
 * Różdżka Zaklęć" — and has the Książę pick the Opiekun up. A Przyjaciel
 * cannot be lying there if 20.2's sentence is true, and 20.2's sentence is as
 * plain as they come. A numbered rule beats an example, so the friends go to
 * the used pile and are gone; it is written down here because a reader who
 * finds the example first will otherwise read this function as a bug.
 */
/**
 * Whether this seat is stone right now (20.1).
 *
 * Read off the turn counter rather than a flag, because that is what 20.1
 * measures in: "przez trzy tury", and a turn a character sits out is still a
 * turn. `stone_until_round` is the turn it becomes flesh again, so the
 * comparison is strict.
 */
export function isStone(snapshot: Snapshot, seatId: string): boolean {
  const seat = snapshot.seats.find((row) => row.id === seatId);
  return stillStone(seat?.stone_until_round ?? null, snapshot.game.round);
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
    /**
     * "Karty Przedmiotów i złota należy pozostawić na Obszarze" (20.2) — and
     * the two are left in different ways, because they are different things.
     *
     * The Przedmioty are Karty and go down as rows on the square. The gold is
     * not: 3.5 keeps it out of the Przedmiot limit and 3.4 draws it from a
     * supply of żetony rather than from a deck. This used to put down one
     * `1-sztuka-zlota` Karta per coin, which minted copies the deck had never
     * given up — picked up, they reached the used pile having never been dealt,
     * and 21.2's `copiesInPlay` counted them as real. A purse is a number now.
     */
    const onField = dropped.map((h) => h.card_id);
    const cards: Changeset =
      onField.length > 0
        ? {
            fieldCards: {
              insert: onField.map((cardId) => ({
                field_id: seat.field_id as string,
                card_id: cardId,
              })),
            },
          }
        : {};
    left = merge(cards, dropGold(apply(snapshot, merge(taken, cards)), seat.field_id, seat.gold));
  }

  const until = snapshot.game.round + STONE_TURNS;
  return mergeAll(taken, gone, left, {
    seats: [{ id: seat.id, patch: { stone_until_round: until, gold: 0 } }],
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
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

/**
 * Lifts a Kamień before its three rounds are up.
 *
 * The console could inflict this state and not undo it, which is the one
 * asymmetry CLAUDE.md's "every tracked value needs a manual override" names
 * outright: *a referee you cannot correct is worse than no referee*. Every
 * other tracked number has a way back — `tury =0` for a debt, `life +1` for a
 * point taken by mistake — and the only way out of a mis-aimed `stone` was to
 * wait three rounds or destroy the character, because `takeNewCharacter` and
 * `withdrawSeat` were the two things in the app that cleared the column.
 *
 * A lift and not a dial. There is no such thing as a shorter Kamień: 20.1
 * prints three turns and nothing in the box shortens them, so an override that
 * let a referee set "two more rounds" would be offering a state the game does
 * not have. What a table actually needs is *undo*, and `stone` / `unstone` is
 * that pair — the same shape as `ready` / `unready`.
 *
 * Filed as an `override`, which is what it is. 20.1 is the rule for turning to
 * stone; there is no rule for a person deciding it should not have happened,
 * and `journalRules` answers `null` for the kind rather than guessing at one.
 *
 * Null rather than a round already past, though `stillStone` reads the two the
 * same. The column means "the round this wears off in", and a game that has
 * never been stone should say so by having no date rather than a stale one.
 */
export function freeFromStone(snapshot: Snapshot, command: { seatId: string }): Changeset {
  const seat = seatById(snapshot, command.seatId);
  if (!isStone(snapshot, command.seatId)) {
    // Nobody named, the way `refuseAgainstStone` above says the same thing the
    // other way round. A raw `character_id` here read "elf nie jest Zamieniona
    // w Kamień" — an id where a name belongs, in the wrong gender, and the
    // console has already said whose seat it is.
    //
    // And no rule number: 20.1 is the rule for turning to stone, and there is
    // none for a person deciding it should not have happened.
    throw new Error("Ta Postać nie jest Zamieniona w Kamień.");
  }
  return {
    seats: [{ id: seat.id, patch: { stone_until_round: null } }],
    journal: [
      {
        seatId: seat.id,
        round: snapshot.game.round,
        kind: "override",
        // What it was going to wear off on, because that is the fact the line
        // is undoing and the only one a reader cannot reconstruct afterwards.
        payload: { what: "unstone", until: seat.stone_until_round },
        manual: true,
      },
    ],
  };
}
