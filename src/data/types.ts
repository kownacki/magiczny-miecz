/** The shape of every transcribed game component, shared by the engine and the transcription pipeline. */

import type { CharacterId, EventId, ItemId, SpellId } from "./ids";

/**
 * Resolution class, printed as a Roman numeral at the top of every event card.
 * Rule 16 fixes both the names and the order, and rule 15.2 resolves a stack of
 * drawn cards by ascending numeral — so this enum's *values* are load-bearing,
 * not cosmetic. Sorting by them is how a turn gets resolved correctly.
 */
export const CARD_CLASS = {
  encounter: 1,
  foe: 2,
  // III is not used by any base-game card. Rule 16.3 singles out the Demon as a
  // second kind of Wróg, which is the likeliest owner of the gap; no card was
  // found printing it.
  stranger: 4,
  // Przedmiot and Przyjaciel BOTH print V — verified against the card headers,
  // and matching rule 16.6, which names "Przedmioty, Przedmioty Magiczne i
  // Przyjaciele" together in a single clause. They resolve as equals, and the
  // sort is stable, so cards of equal rank keep the order they were drawn in.
  friend: 5,
  item: 5,
  place: 6,
} as const;

export type CardClass = keyof typeof CARD_CLASS;

/**
 * How each class is actually printed on the cards.
 *
 * The keys are English because they are identifiers and the code branches on
 * them; the board and the cards say "Wróg" and "Przyjaciel", so anything shown
 * to a player comes from here rather than from the key. The card *names* are
 * another matter and stay as printed — MAGICZNY MIECZ is what the card is
 * called, not a term this app chose.
 */
export const CARD_CLASS_LABEL: Record<CardClass, string> = {
  encounter: "Spotkanie",
  foe: "Wróg",
  stranger: "Nieznajomy",
  friend: "Przyjaciel",
  item: "Przedmiot",
  place: "Miejsce",
};

export type Nature = "good" | "evil" | "chaotic";

/**
 * What a character card prints in its `natura:` slot. Kat is the exception the
 * three-value enum cannot express: its card reads `natura: dowolna` and its
 * first ability lets the player pick a Nature at setup. So the *card* carries
 * this wider type and the *seat* carries the narrow `Nature`, resolved once the
 * choice is made. Not a one-off, as it turns out — Labirynt Magów's HEGEMON
 * prints the same thing.
 */
export type StartingNature = Nature | "any";

/** Which of the three rings a board field belongs to, or the bridge across them. */
export type Region = "dolny" | "srodkowy" | "gorny" | "most";

/**
 * Which box a card came out of.
 *
 * One value today, and the whole point of writing it down now: the five
 * expansions are out of scope (CLAUDE.md) but they exist, and a card's *home
 * deck* is the fact nothing else can be derived from. 21.2 counts the printed
 * copies of a card in play and a discarded card goes back to its own pile —
 * both of which are implicit while there is one box and wrong the moment there
 * are two.
 *
 * The id is deliberately NOT namespaced. Every trading-card game that has
 * solved this keeps two identifiers with different jobs — the card as a rules
 * object, and the printing it came from — and `set:slug` is only the first half
 * of that. It would not be enough here anyway: the Magia set prints PRZEWODNIK
 * KRYPTY three times on one sheet, twice as a Nieznajomy and once as a
 * Przyjaciel, with different text — two cards, one name, one set. What tells
 * those apart is `source`, which is a collector number and the only handle in
 * this data guaranteed to be unique. See docs/EXPANSIONS.md.
 */
export type SetId = "base";

export interface EventCard {
  /** Slug of the Polish name, unique across the deck. */
  id: EventId;
  set: SetId;
  name: string;
  cardClass: CardClass;
  /** Sheet and 1-based position it was sliced from, so any card traces back to its scan. */
  source: { sheet: string; index: number };
  /** Verbatim Polish text from the card, newlines preserved. */
  text: string;
  /**
   * Combat values for cards that fight. `miecz` for ordinary enemies (17.1),
   * `magia` for Demons, which force magical combat instead (16.3, 18.1).
   */
  miecz?: number;
  magia?: number;
  /** Present when the card is worth Miecz points on defeat, per rule 1.4. */
  trophy?: number;
}

export interface Spell {
  id: SpellId;
  set: SetId;
  name: string;
  source: { sheet: string; index: number };
  text: string;
}

export interface Item {
  id: ItemId;
  set: SetId;
  name: string;
  source: { sheet: string; index: number };
  text: string;
  /** Bonuses the item confers; these are derived points, never token-tracked (1.2, 2.2). */
  miecz?: number;
  magia?: number;
  /** Natures forbidden from carrying it (5.3). Absent means anyone may. */
  forbiddenTo?: Nature[];
  /** Price in Sztuki Złota where the item can be bought (3.3). */
  price?: number;
  magical?: boolean;
}

export interface Character {
  id: CharacterId;
  set: SetId;
  name: string;
  source: { sheet: string; index: number };
  /** Kat prints "any" — the player chooses at setup. See StartingNature. */
  nature: StartingNature;
  /** Starting Miecz and Magia, printed down the card's left edge. */
  miecz: number;
  magia: number;
  /** Field the character starts on — "MGR" (Miejsce Gracza) on the card. */
  start: string;
  /** The numbered special abilities in the card's body, in printed order. */
  abilities: string[];
}

export interface Field {
  id: string;
  name: string;
  region: Region;
  /**
   * Neighbouring fields in ring order. Movement is around a ring in either
   * direction (10.2), so this is exactly two entries for an ordinary field.
   */
  adjacent: [string, string];
  /** Verbatim instruction printed on the board for this field. */
  text: string;
  /** How many event cards this field makes you draw, if any. */
  draw?: number;
}
