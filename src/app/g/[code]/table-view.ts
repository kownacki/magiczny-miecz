/** The questions the table screen asks of an Envelope, away from the component that draws the answers. */

import { ringFields, type FieldId } from "@/lib/engine/board";
import { fieldName } from "@/lib/engine/polish";
import { CARD_NAMES, CARD_TEXTS, KIND_LABEL, type Seat } from "./table";
import type { FieldCard, Person } from "./use-table";
import type { LobbySeat } from "./lobby-view";
import type { PublicSeat } from "./table-layout";

/**
 * The twin of `lobby-view.ts`, and here for the reason its own header gives:
 * "It lived inside a 565-line component, which is a place nothing can be asked
 * a question."
 *
 * Only what passes that test is here. The page's drawers, its rule shelf and
 * its chrome are big because UI is big, and extracting them would make the
 * file shorter without making anything answerable. What moved is the handful of
 * derivations that are really rules — who is driving a chair, which Obszary a
 * Karta could be moved to, whose Postać is being chosen — each of which the
 * page worked out inline and none of which had a test.
 */

/**
 * Whoever is driving a given chair, or nobody.
 *
 * The one thing the browser has to do for itself now that a chair and a person
 * are two rows: the seat carries a `driver_id` and everything about the person
 * is in `users`. Running the table, being ready and having gone quiet are all
 * facts about somebody, and a chair has none of them.
 */
export function driverOf(
  users: readonly Person[],
  seat: { driver_id?: string | null } | null | undefined,
): Person | null {
  return users.find((one) => one.id === seat?.driver_id) ?? null;
}

/** Whoever is holding the shared screen, for the line that says so. */
export function tableScreenHolder(users: readonly Person[]): string | null {
  return users.find((one) => one.isHost)?.name ?? null;
}

/** Everybody else with a Postać — the rows the page draws beside your own. */
export function otherSeats(seats: readonly Seat[], mineId: string | undefined): Seat[] {
  return seats.filter((seat) => seat.id !== mineId && seat.character_id);
}

/**
 * Whose character is being chosen.
 *
 * Left to the app until somebody says otherwise: this device's own seat first,
 * then — only where the host is choosing on behalf of people with no device —
 * a companion seat still without one. It used to fall through to *any*
 * characterless seat, which is why opening a table could leave you aiming at a
 * stranger's slot.
 */
export function pickingFor(
  picking: string | null,
  seats: readonly Seat[],
  mySeat: Seat | undefined,
  hostOfCompanion: boolean,
): Seat | null {
  if (picking !== "auto") return seats.find((seat) => seat.id === picking) ?? null;
  if (mySeat && !mySeat.character_id) return mySeat;
  if (!hostOfCompanion) return null;
  // A chair with nobody driving it and nothing in it: somebody in the room the
  // host is setting up, which is what `no_device` used to mark and is now
  // simply the absence of a driver.
  return seats.find((seat) => seat.driver_id === null && !seat.character_id) ?? null;
}

/** One Karta lying face up, with the Obszary it could be moved to. */
export interface BoardCard {
  id: string;
  name: string;
  where: string;
  moveTo: { fieldId: FieldId; name: string }[];
}

/**
 * Every Karta lying face up on the board, and where each could be moved to.
 *
 * What a Zaklęcie aimed at a Karta may be aimed at — the Siewca takes one off
 * the board and the Władca Zdarzeń picks one up and puts it down somewhere
 * else, and both of them need this list rather than the drawn cards of a turn.
 * Read once, because two hands are given it: the seat card's and the fight
 * sheet's.
 *
 * The destinations are „na innym Obszarze w tym samym Kręgu", and „nowy Obszar
 * nie może być zajęty przez inną Postać". Worked out here because this is what
 * knows where everybody stands — the hand only draws the answer. The engine
 * checks all three again; this is so the offer is not a list of refusals.
 */
export function boardCards(
  fieldCards: readonly FieldCard[],
  seats: readonly Seat[],
): BoardCard[] {
  return fieldCards.map((row) => ({
    id: row.id,
    name: CARD_NAMES.get(row.cardId) ?? row.cardId,
    where: fieldName(row.fieldId),
    moveTo: ringFields(row.fieldId)
      .filter(
        (fieldId) =>
          fieldId !== row.fieldId &&
          !seats.some((seat) => !seat.eliminated && seat.field_id === fieldId),
      )
      .map((fieldId) => ({ fieldId, name: fieldName(fieldId) })),
  }));
}

/**
 * A chair as the poczekalnia draws it, and as the table draws it.
 *
 * Both were inside the page component, which is exactly what this file's header
 * says is the wrong place for them: they are questions asked of an Envelope,
 * they have one right answer, and nothing could ask them. `asPublicSeat` is the
 * bigger of the two and the one worth having reachable — it is where a rival's
 * Postać becomes the numbers everybody at the table is allowed to see, and it
 * decides what is *not* among them.
 */
export function asLobbySeat(seat: Seat, driver: Person | null): LobbySeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: driver?.name ?? seat.player_name,
    characterId: seat.character_id,
    isHost: driver?.isHost ?? false,
    driven: driver !== null,
    driverId: driver?.id ?? null,
    away: seat.away,
    ready: driver?.ready ?? false,
  };
}

/**
 * A seat as the rest of the table is allowed to see it.
 *
 * Everything the rulebook lays out face up (5.2, 6.2, and the tokens beside a
 * character card) is copied across in full. Concealed spells never reach the
 * browser at all — the server already replaced them with a count (9.3) — so
 * there is nothing here that could leak by being careless.
 */
export function asPublicSeat(seat: Seat, driver: Person | null): PublicSeat {
  return {
    id: seat.id,
    seatIndex: seat.seat_index,
    playerName: driver?.name ?? seat.player_name,
    driverId: driver?.id ?? null,
    characterId: seat.character_id,
    fieldName: seat.field_id ? (fieldName(seat.field_id)) : "—",
    fieldId: seat.field_id,
    miecz: seat.sword_total,
    swordOwn: seat.sword_own,
    magia: seat.magic_total,
    magicOwn: seat.magic_own,
    mieczWWalce: seat.sword_in_fight,
    magiaWWalce: seat.magic_in_fight,
    life: seat.life,
    gold: seat.gold,
    nature: seat.nature,
    eliminated: seat.eliminated,
    driven: driver !== null,
    away: seat.away,
    isHost: driver?.isHost ?? false,
    turnsLost: seat.turns_lost,
    effects: seat.effects,
    cards: seat.holdings
      .filter((held) => held.kind !== "spell")
      .map((held) => ({
        cardId: held.cardId,
        name: CARD_NAMES.get(held.cardId) ?? held.cardId,
        text: CARD_TEXTS.get(held.cardId),
        kindLabel: KIND_LABEL[held.kind],
        // The roster is the one place a rival's Przedmioty are drawn with no
        // body under them, so what is worn and what is merely carried is a
        // mark on the tile — see `WornMark`.
        slot: held.slot ?? null,
      })),
    hiddenSpells:
      seat.hidden_count + seat.holdings.filter((held) => held.kind === "spell").length,
  };
}
