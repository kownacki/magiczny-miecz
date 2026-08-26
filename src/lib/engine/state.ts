/** The game state the engine reads and returns, independent of how it is stored or rendered. */

import { CARD_CLASS, type CardClass, type Nature } from "@/data/types";
import type { Slot } from "./slots";
import type { FieldId } from "./board";

/**
 * One player's live state.
 *
 * `mieczOwn`/`magiaOwn` are the token-tracked points only. Rules 1.5 and 2.5
 * define the *total* as own points plus whatever items and friends contribute,
 * and that total is derived on read — never stored — so it cannot drift out of
 * step with the cards actually held. `mieczFloor`/`magiaFloor` capture 1.3 and
 * 2.3: own points may never drop below where the character started.
 */
export interface Seat {
  id: string;
  index: number;
  name: string | null;
  characterId: string | null;
  fieldId: FieldId | null;

  mieczOwn: number;
  magiaOwn: number;
  mieczFloor: number;
  magiaFloor: number;

  zycie: number;
  zloto: number;

  /** Nature can change mid-game (7.2), so it lives here rather than on the character. */
  nature: Nature | null;

  turnsLost: number;
  /** Set while Zamieniony w Kamień; clears after three turns (20.1). */
  stoneUntilTurn: number | null;
  eliminated: boolean;

  holdings: Holding[];
}

export interface Holding {
  cardId: string;
  kind: "spell" | "item" | "friend" | "trophy";
  /** Spells are held concealed (9.3); items and friends lie open (5.2, 6.2). */
  face: "open" | "hidden";
  /**
   * Where it is worn, in the slotted variant. Null means it is in the pack,
   * which is the only place anything is in klasyczny play.
   */
  slot?: Slot | null;
  /** Conjured by the test shortcut: it belongs to no pile (see `db/schema.sql`). */
  granted?: boolean;
}

export interface TurnCard {
  cardId: string;
  cardClass: CardClass;
  /**
   * Which physical slice this is, when the app owns the deck. Absent in
   * companion mode, where the player is holding the card and the app only
   * knows which one they named.
   */
  ref?: string;
  /**
   * Staged by the test shortcut rather than drawn.
   *
   * The same fact as `Holding.granted` and for the same reason: the deck never
   * gave this card up, so nothing about it should look like a card that came
   * off the top.
   */
  granted?: boolean;
}

/**
 * Rule 15.2: a field that makes you draw several cards resolves them in
 * ascending order of the class numeral printed at the top, lowest first. Rule
 * 16.4 adds that every Spotkanie and every Wróg on the field must be dealt with
 * before the rest are looked at, which this ordering already produces.
 *
 * Ties keep draw order, which is why this is a stable sort by class alone.
 */
export function resolutionOrder(cards: readonly TurnCard[]): TurnCard[] {
  return [...cards].sort((a, b) => CARD_CLASS[a.cardClass] - CARD_CLASS[b.cardClass]);
}
