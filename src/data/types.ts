/** The shape of every transcribed game component, shared by the engine and the transcription pipeline. */

/**
 * Resolution class, printed as a Roman numeral at the top of every event card.
 * Rule 16 fixes both the names and the order, and rule 15.2 resolves a stack of
 * drawn cards by ascending numeral — so this enum's *values* are load-bearing,
 * not cosmetic. Sorting by them is how a turn gets resolved correctly.
 */
export const CARD_CLASS = {
  spotkanie: 1,
  wrog: 2,
  nieznajomy: 3,
  przyjaciel: 4,
  przedmiot: 5,
  miejsce: 6,
} as const;

export type CardClass = keyof typeof CARD_CLASS;

export type Nature = "dobra" | "zla" | "chaotyczna";

/** Which of the three rings a board field belongs to, or the bridge across them. */
export type Region = "dolny" | "srodkowy" | "gorny" | "most";

export interface EventCard {
  /** Slug of the Polish name, unique across the deck. */
  id: string;
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
  id: string;
  name: string;
  source: { sheet: string; index: number };
  text: string;
}

export interface Item {
  id: string;
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
  id: string;
  name: string;
  source: { sheet: string; index: number };
  nature: Nature;
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
