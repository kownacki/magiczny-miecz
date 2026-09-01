/** The questions the table screen asks of an Envelope, away from the component that draws the answers. */

import { FIELDS, ringFields, type FieldId } from "@/lib/engine/board";
import { CARD_NAMES, type Seat } from "./table";
import type { FieldCard, Person } from "./use-table";

/** Every Obszar's printed name, by id. */
const FIELD_NAMES = new Map([...FIELDS.values()].map((field) => [field.id, field.name]));

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
    where: FIELD_NAMES.get(row.fieldId) ?? row.fieldId,
    moveTo: ringFields(row.fieldId)
      .filter(
        (fieldId) =>
          fieldId !== row.fieldId &&
          !seats.some((seat) => !seat.eliminated && seat.field_id === fieldId),
      )
      .map((fieldId) => ({ fieldId, name: FIELD_NAMES.get(fieldId) ?? fieldId })),
  }));
}
