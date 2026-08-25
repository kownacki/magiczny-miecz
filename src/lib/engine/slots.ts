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
 * The two hands are separate places rather than one place holding two, because
 * they do not take the same things: a Tarcza only ever goes in the off hand,
 * while a Miecz goes in either. That is where the interesting decisions in this
 * variant are — everything else has at most a handful of cards competing for
 * it, and four of the places have exactly one card in the whole box.
 */
export const SLOTS = [
  "glowa",
  "amulet",
  "tulow",
  "reka-glowna",
  "reka-pomocnicza",
  "rekawice",
  "pierscien",
  "wierzchowiec",
  "sakwa",
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  glowa: "Głowa",
  amulet: "Amulet",
  tulow: "Tułów",
  "reka-glowna": "Ręka główna",
  "reka-pomocnicza": "Ręka pomocnicza",
  rekawice: "Rękawice",
  pierscien: "Pierścień",
  wierzchowiec: "Wierzchowiec",
  sakwa: "Sakwa",
};

/** Both hands, for the cards that may go in either. */
const OBIE_RECE = ["reka-glowna", "reka-pomocnicza"] as const;

/**
 * Where each Przedmiot may be worn.
 *
 * A list rather than a single place, because a Miecz goes in either hand and a
 * Tarcza only in the off one — which is the whole of the interesting decision
 * in this variant, since almost everything else has exactly one card competing
 * for its place.
 *
 * Anything absent has no place on the body and lives in the pack, which is most
 * of the box: the Latarnia's neighbours the Kij i sznur and the Łódź, the
 * Tabliczka and the Manuskrypt, the one-use fruits and potions, the Diament and
 * the Szkatuła. They are things a character carries and uses, not things it
 * wears, and in slotted play they go on working from the pack exactly as they
 * always did — otherwise half the deck would fall inert the moment the variant
 * was switched on.
 *
 * These are judgement about a variant the rulebook never mentions, so they all
 * live here where they can be argued with in one place. Three are worth saying
 * out loud: the Latarnia is held up rather than worn and so costs you a shield;
 * the Srebrna Strzała is an arrow and is held; and the Kryształ Losu is used in
 * a fight rather than carried through one.
 */
export const SLOT_OF: Record<string, readonly Slot[]> = {
  // Głowa, tułów, ręce, palec — the four the box has exactly one card for.
  helm: ["glowa"],
  zbroja: ["tulow"],
  rekawice: ["rekawice"],
  "pierscien-mocy": ["pierscien"],

  // Amulet: talizmany i relikwie.
  "talizman-ognia": ["amulet"],
  "talizman-powietrza": ["amulet"],
  relikwiarz: ["amulet"],
  "swiety-graal": ["amulet"],
  "krysztal-magow": ["amulet"],

  // Broń i różdżki — either hand.
  miecz: OBIE_RECE,
  sztylet: OBIE_RECE,
  "magiczny-miecz": OBIE_RECE,
  arondight: OBIE_RECE,
  excalibur: OBIE_RECE,
  "miecz-chaosu": OBIE_RECE,
  "swieta-wlocznia": OBIE_RECE,
  "topor-swiatla-i-ciemnosci": OBIE_RECE,
  "srebrna-strzala": OBIE_RECE,
  "rozdzka-przeznaczenia": OBIE_RECE,
  "rozdzka-zaklec": OBIE_RECE,

  // Tarcze i to, co się trzyma w drugiej ręce — off hand only.
  tarcza: ["reka-pomocnicza"],
  "tarcza-tolimana": ["reka-pomocnicza"],
  "tarcza-boga-tolimana": ["reka-pomocnicza"],
  "zwierciadlo-zniszczenia": ["reka-pomocnicza"],
  "krysztal-losu": ["reka-pomocnicza"],
  latarnia: ["reka-pomocnicza"],

  // Wierzchowce i sakwy.
  kon: ["wierzchowiec"],
  mul: ["wierzchowiec"],
  zaprzeg: ["wierzchowiec"],
  wierzchowiec: ["wierzchowiec"],
  "bojowy-rumak": ["wierzchowiec"],
  "magiczna-sakwa": ["sakwa"],
  "tajemna-sakwa": ["sakwa"],
};

/** The places this Przedmiot may be worn; empty when it is only ever carried. */
export function slotsFor(cardId: string): readonly Slot[] {
  return SLOT_OF[cardId] ?? [];
}

/** Whether this card may be worn in this place. */
export function fitsIn(cardId: string, slot: Slot): boolean {
  return slotsFor(cardId).includes(slot);
}

/** Whether this card has any place on the body at all. */
export function isWearable(cardId: string): boolean {
  return slotsFor(cardId).length > 0;
}

/**
 * Places the base game has no card for: there are none.
 *
 * There were two — a belt and boots — and neither has a card anywhere in the
 * box: not among the 63 Przedmiot cards, not in the Wyposażenie, and not in the
 * text of any of the 165 Karty Zdarzeń. They were dropped rather than drawn
 * empty for the whole game.
 *
 * The five expansions are out of scope (see CLAUDE.md) and their scans are
 * untouched, so if a Pas or a pair of Butów turns up in one of them, this is
 * where the places come back: add them to `SLOTS`, a label, and the cards.
 */
export const EMPTY_IN_BASE_GAME: readonly Slot[] = [];
