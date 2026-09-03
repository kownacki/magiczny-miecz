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
   * Which copy this is, among the Karty on this Obszar.
   *
   * A square can hold two of one card — the deck prints fifteen 1 SZTUKA
   * ZŁOTA and four TARCZA TOLIMANA, Płaskowyż Mgieł draws three at once, and
   * `deal` will conjure as many as you ask for — and `resolved`, `fought` and
   * `beaten` all name a Karta by its id. So resolving one copy marked both: the
   * SKALNE WROTA drew a second SKALNE WROTA and it arrived already struck
   * through, which is a Karta nobody ever saw.
   *
   * A number and not a uuid, because it only has to be unique *here*: one
   * more than the highest on the frame when the card joins it, so it survives
   * `resolutionOrder` re-sorting the list and cannot be reused by a card that
   * arrives later.
   *
   * Optional, and absent means the old behaviour. A frame written before this
   * — a game part-played, a fixture — keys by bare id exactly as it did, so
   * nothing in flight has to be migrated to keep working. See `keyOf`.
   */
  nth?: number;
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
  /**
   * This Karta came off the board rather than off the pile.
   *
   * `liftFieldCards` sets it when somebody stops on an Obszar and everything
   * lying there joins their turn (12.1, 13.4, 16.8). Every other Karta in a
   * frame was drawn into it, so absent means "just turned over".
   *
   * It exists for 15.1, which is a rule about the *draw*: a Karta that sends
   * itself to a named Obszar is resolved first and does not touch the Postać
   * who turned it over. Once it has landed it is an ordinary Karta on its new
   * square, queued by numeral like anything else and saying whatever its text
   * says to whoever finds it — so the same card id has to be able to mean two
   * different things, and this is what tells them apart. See `instructionIn`
   * and `placedFirst`.
   *
   * Not persisted anywhere: the lift derives it from the row every time, and a
   * Karta nobody dealt with goes back onto the board at the end of the turn.
   */
  lying?: boolean;
}

/**
 * Whether this copy is one 15.1 puts before everything else.
 *
 * The card's instruction *and* the fact that it has not carried it out yet.
 * `goesToAField` alone is the card, and the card is not the whole question: an
 * EREMITA rolled onto the Bezdroża is one of that square's Nieznajomi from
 * then on, and jumping the kolejka a second time would put him ahead of a
 * Spotkanie 16.4 says goes first.
 */
export function placedFirst(card: TurnCard): boolean {
  return !card.lying && goesToAField(card.cardId);
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
 * needs nothing *here*, but it did need something: the shape gives half of it,
 * since `poloz-karte` lifts the card out of `drawn` and into `fieldCards` and
 * it stops being part of this turn as it resolves. The half the shape does not
 * give is a card that says something else as well — the Eremita's Magiczny
 * Miecz, which used to be handed over on the way past. That is `placed`'s, in
 * `cardScript.ts`, and `lying` is what this file contributes to it.
 *
 * **And a card that re-opens the badanie sits below its own class.** The Skalne
 * Wrota draw three more Karty into this same kolejka, and the community reading
 * of a card the box left ambiguous is that they are a fresh badanie — which
 * they are, exactly when the Wrota is resolved after everything else. It is a
 * Miejsce (VI) and so already last against every other numeral; this is the key
 * that also puts it behind another Miejsce drawn beside it. See
 * `reopensTheDrawing`, which carries the argument and the thread.
 */
/**
 * How `resolved`, `fought` and `beaten` name one Karta on this Obszar.
 *
 * Those three are lists of keys rather than of card ids, and always have been:
 * `fieldScript` puts an `offerKey` in the same list for an Obszar's own printed
 * offers, so the keyspace was never "the id of a card". This adds the other
 * thing it has to be able to say — *which copy* — and the answer is the arrival
 * number the frame gave it.
 *
 * A card with no `nth` keys as its bare id, which is what every one of them did
 * before. That is what lets a game part-played keep working: the frame it is
 * holding has no numbers on it, so it goes on behaving exactly as it did, one
 * name for however many copies. New frames get the numbers and the fix.
 */
export function keyOf(card: Pick<TurnCard, "cardId" | "nth">): string {
  return card.nth === undefined ? card.cardId : `${card.cardId}#${card.nth}`;
}

/**
 * Whether one of these keys names this Karta.
 *
 * The three lists beside `drawn` are one keyspace with three writers, and they
 * do not all say the same thing — deliberately.
 *
 * **`resolved` names a copy.** Reading a Karta is done to that Karta: two
 * Targowiska on one square are two shops and dealing with one leaves the other
 * standing.
 *
 * **`fought` and `beaten` name a card.** 17.5 is why — „Jeżeli Postać jest
 * atakowana przez więcej niż jedną istotę, Miecze tych istot są sumowane" — so
 * two WILKI on one Obszar are one fight and beating the pack beats both. A
 * per-copy key there would split a fight the rulebook joins.
 *
 * And a frame written before any of this carries no numbers at all, so every
 * list on it is names. One question, then, asked of the card rather than of the
 * caller: is it in here under either name?
 */
export function listed(
  keys: readonly string[],
  card: Pick<TurnCard, "cardId" | "nth">,
): boolean {
  return keys.includes(card.cardId) || keys.includes(keyOf(card));
}

/** The number the next Karta to join this frame should carry. See `nth`. */
export function nextNth(cards: readonly TurnCard[]): number {
  return cards.reduce((top, card) => Math.max(top, card.nth ?? 0), 0) + 1;
}

export function resolutionOrder(cards: readonly TurnCard[]): TurnCard[] {
  const placed = (card: TurnCard) => (placedFirst(card) ? 0 : 1);
  const last = (card: TurnCard) => (reopensTheDrawing(card.cardId) ? 1 : 0);
  return [...cards].sort(
    (a, b) =>
      placed(a) - placed(b) ||
      CARD_CLASS[a.cardClass] - CARD_CLASS[b.cardClass] ||
      last(a) - last(b),
  );
}
