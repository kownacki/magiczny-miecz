/** The game state the engine reads and returns, independent of how it is stored or rendered. */

import { CARD_CLASS, type CardClass, type Nature } from "@/data/types";
import type { Slot } from "./slots";
import type { FieldId } from "./board";
import { goesToAField, reopensTheDrawing } from "./cardScript";

/**
 * One player's live state.
 *
 * `swordOwn`/`magicOwn` are the token-tracked points only. Rules 1.5 and 2.5
 * define the *total* as own points plus whatever items and friends contribute,
 * and that total is derived on read — never stored — so it cannot drift out of
 * step with the cards actually held. `swordFloor`/`magicFloor` capture 1.3 and
 * 2.3: own points may never drop below where the character started.
 */
export interface Seat {
  id: string;
  index: number;
  name: string | null;
  characterId: string | null;
  fieldId: FieldId | null;

  swordOwn: number;
  magicOwn: number;
  swordFloor: number;
  magicFloor: number;

  life: number;
  gold: number;

  /** Nature can change mid-game (7.2), so it lives here rather than on the character. */
  nature: Nature | null;

  turnsLost: number;
  /** Set while Zamieniony w Kamień; clears after three turns (20.1). */
  stoneUntilRound: number | null;
  eliminated: boolean;

  holdings: Holding[];
}

export interface Holding {
  cardId: string;
  /**
   * `carried` belongs to another card rather than to the character — the
   * Zaklęcie the Krzyżowiec and the Gnom walk around with. Not in the hand, so
   * 2.6 never counts it and nothing that takes "your Zaklęcia" reaches it.
   */
  kind: "spell" | "item" | "friend" | "trophy" | "carried";
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
  /**
   * What is left of a Miejsce's pool of points (16.7), for the three Karty
   * that lie on an Obszar with one.
   *
   * Here rather than only on the row because the row does not survive a visit:
   * `liftFieldCards` deletes every Karta on the Obszar when somebody stops
   * there and `leaveCardsBehind` writes back whatever they did not take, so a
   * Drzewo Życia is off the board for the length of a turn. A count that lived
   * only in `field_cards` would be four again every time anybody walked past.
   *
   * Absent on every other card, and absent means "ask `startingPool`" rather
   * than "empty" — see `afterVisit`.
   */
  pool?: number | null;
}

/**
 * Rule 15.2: a field that makes you draw several cards resolves them in
 * ascending order of the class numeral printed at the top, lowest first. Rule
 * 16.4 adds that every Spotkanie and every Wróg on the field must be dealt with
 * before the rest are looked at, which this ordering already produces.
 *
 * Ties keep draw order, which is why this is a stable sort by class alone.
 *
 * **15.1 sits above 15.2.** A card whose instruction sends it to a named Obszar
 * is "rozpatrywana w pierwszej kolejności" whatever numeral it prints — the
 * Upiór is a Demon (III) and the Eremita a Nieznajomy (IV), and both go before
 * either class would put them. So the sort has two keys and this is the first
 * of them.
 *
 * The other half of 15.1 — "nie mają wpływu na Postać, która je wyciągnęła" —
 * needs nothing here and is not enforced anywhere either, because the shape
 * already gives it: `poloz-karte` lifts the card out of `drawn` and inserts it
 * into `fieldCards`, so it stops being part of this turn at the moment it is
 * resolved and waits for whoever ends a move there next.
 *
 * **And a card that re-opens the badanie sits below its own class.** The Skalne
 * Wrota draw three more Karty into this same kolejka, and the community reading
 * of a card the box left ambiguous is that they are a fresh badanie — which
 * they are, exactly when the Wrota is resolved after everything else. It is a
 * Miejsce (VI) and so already last against every other numeral; this is the key
 * that also puts it behind another Miejsce drawn beside it. See
 * `reopensTheDrawing`, which carries the argument and the thread.
 */
export function resolutionOrder(cards: readonly TurnCard[]): TurnCard[] {
  const placed = (card: TurnCard) => (goesToAField(card.cardId) ? 0 : 1);
  const last = (card: TurnCard) => (reopensTheDrawing(card.cardId) ? 1 : 0);
  return [...cards].sort(
    (a, b) =>
      placed(a) - placed(b) ||
      CARD_CLASS[a.cardClass] - CARD_CLASS[b.cardClass] ||
      last(a) - last(b),
  );
}
