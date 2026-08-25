/** The slotted equipment variant: which Przedmiot goes where on a character. */

/**
 * Two ways to hold your things.
 *
 * **Klasyczny** is the rulebook: four Przedmioty, no distinction between what
 * you wear and what you carry, and every one of them works wherever it is
 * (5.4). This is the game as printed and stays the default.
 *
 * **Slotowy** is a house variant in the Diablo mould: what you wear goes in the
 * place it is worn, and only what is worn has any effect. It is not in the
 * book — no rule anywhere distinguishes a worn Hełm from a carried one — so it
 * is a setting on the table, chosen when the table is opened, and never a
 * silent change to how the printed rules behave.
 */
export type EqMode = "klasyczny" | "slotowy";

/**
 * The places on a character, in the order they are drawn.
 *
 * `dlon` is the only one that appears twice — a character has two hands, and
 * the game is full of pairs worth arguing over (a Miecz and a Tarcza, or two
 * swords, or Excalibur and the Tarcza Tolimana on the way to the Zamek).
 */
export const SLOTS = [
  "glowa",
  "amulet",
  "tulow",
  "dlon",
  "dlon",
  "rekawice",
  "pas",
  "pierscien",
  "buty",
  "wierzchowiec",
  "sakwa",
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  glowa: "Głowa",
  amulet: "Amulet",
  tulow: "Tułów",
  dlon: "Dłoń",
  rekawice: "Rękawice",
  pas: "Pas",
  pierscien: "Pierścień",
  buty: "Buty",
  wierzchowiec: "Wierzchowiec",
  sakwa: "Sakwa",
};

/** How many of each place a character has. */
export function slotCapacity(slot: Slot): number {
  return SLOTS.filter((each) => each === slot).length;
}

/**
 * Where each Przedmiot is worn.
 *
 * Anything absent from this map has no place on the body and lives in the pack,
 * which is most of the box: the Latarnia, the Kij i sznur, the Łódź, the
 * Tabliczka and the Manuskrypt, the one-use fruits and potions, the Diament and
 * the Szkatuła. They are things you carry and use, not things you wear, and in
 * slotted play they go on working from the pack exactly as they always did —
 * otherwise half the deck would become inert the moment the variant was turned
 * on.
 *
 * The assignments are a judgement call about a variant the rulebook never
 * mentions, so they all live here where they can be argued with in one place.
 * Two are worth saying out loud: the Srebrna Strzała is an arrow and is held
 * rather than worn, and the Święty Graal and the Relikwiarz sit in the amulet
 * place because both are relics whose bonus is for having them about you — the
 * alternative was inventing a place for exactly two cards.
 */
export const SLOT_OF: Record<string, Slot> = {
  // Głowa
  helm: "glowa",

  // Tułów
  zbroja: "tulow",

  // Ręce: broń, tarcze, różdżki — everything wielded.
  miecz: "dlon",
  sztylet: "dlon",
  "magiczny-miecz": "dlon",
  arondight: "dlon",
  excalibur: "dlon",
  "miecz-chaosu": "dlon",
  "swieta-wlocznia": "dlon",
  "topor-swiatla-i-ciemnosci": "dlon",
  "srebrna-strzala": "dlon",
  tarcza: "dlon",
  "tarcza-tolimana": "dlon",
  "tarcza-boga-tolimana": "dlon",
  "rozdzka-przeznaczenia": "dlon",
  "rozdzka-zaklec": "dlon",
  "krysztal-losu": "dlon",
  "zwierciadlo-zniszczenia": "dlon",

  // Rękawice
  rekawice: "rekawice",

  // Amulet — talizmany i relikwie.
  "talizman-ognia": "amulet",
  "talizman-powietrza": "amulet",
  relikwiarz: "amulet",
  "swiety-graal": "amulet",
  "krysztal-magow": "amulet",

  // Pierścień
  "pierscien-mocy": "pierscien",

  // Wierzchowiec
  kon: "wierzchowiec",
  mul: "wierzchowiec",
  zaprzeg: "wierzchowiec",
  wierzchowiec: "wierzchowiec",
  "bojowy-rumak": "wierzchowiec",

  // Sakwa
  "magiczna-sakwa": "sakwa",
  "tajemna-sakwa": "sakwa",
};

/** The place this Przedmiot is worn, or null when it is only ever carried. */
export function slotOf(cardId: string): Slot | null {
  return SLOT_OF[cardId] ?? null;
}

/**
 * Places the base game has no card for.
 *
 * Both are drawn, and both stay empty for the whole game: there is no belt and
 * there are no boots anywhere in the box — not among the 63 Przedmiot cards,
 * not in the Wyposażenie, and not in the text of any of the 165 Karty Zdarzeń.
 * They are kept because a character with a gap where its boots go looks like a
 * character who has not found any boots yet, which is the more useful lie, and
 * because the expansions may yet fill them.
 */
export const EMPTY_IN_BASE_GAME: readonly Slot[] = ["pas", "buty"];
