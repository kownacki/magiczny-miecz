/** The slotted equipment variant: which Przedmiot goes where on a character. */
import type { CardId, SpellId } from "@/data/ids";

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
  // The two that only have to be found. See RELICS.
  "magiczny-miecz",
  "tarcza-tolimana",
] as const;

export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  glowa: "Głowa",
  amulet: "Amulet",
  tulow: "Tułów",
  "reka-glowna": "Ręka główna",
  "magiczny-miecz": "Magiczny Miecz",
  "tarcza-tolimana": "Tarcza Tolimana",
  "reka-pomocnicza": "Ręka pomocnicza",
  rekawice: "Rękawice",
  pierscien: "Pierścień",
  wierzchowiec: "Wierzchowiec",
  sakwa: "Sakwa",
};

/**
 * Where each Przedmiot is worn.
 *
 * A list rather than a single place so a card can name more than one, but in
 * the base game none does: a weapon goes in the main hand, a shield in the off
 * hand, and that is that. Two weapons at once is a character ability — a
 * Barbarzyńca who fights with a sword in each hand — and no character in this
 * box has one, so the rule waits until one does rather than being invented for
 * nobody.
 *
 * **Nothing here is two-handed.** The two candidates by weapon type are the
 * Święta Włócznia and the Topór Światła i Ciemności, and the art on both cards
 * shows a single gauntleted hand on the haft. No card text mentions hands.
 *
 * Anything absent has no place on the body, lives in the pack — and, unlike the
 * worn things, goes on working from there. That is most of the box: the
 * Latarnia, the Kij i sznur, the Łódź, the Tabliczka and the Manuskrypt, the
 * one-use fruits and potions, the Diament and the Szkatuła, and the relics and
 * crystals whose whole effect is having them about you: the Graal, the
 * Relikwiarz, the Kryształ Magów, the Kryształ Losu, the Zwierciadło
 * Zniszczenia and the Srebrna Strzała.
 */
export const SLOT_OF: Partial<Record<CardId, readonly Slot[]>> = {
  // Głowa, tułów, ręce, palec — the four the box has exactly one card for.
  helm: ["glowa"],
  zbroja: ["tulow"],
  rekawice: ["rekawice"],
  "pierscien-mocy": ["pierscien"],

  // Amulet: the two talizmany, the only things in the box worn round a neck.
  "talizman-ognia": ["amulet"],
  "talizman-powietrza": ["amulet"],

  // Broń i różdżki — ręka główna.
  miecz: ["reka-glowna"],
  sztylet: ["reka-glowna"],
  "magiczny-miecz": ["magiczny-miecz"],
  arondight: ["reka-glowna"],
  excalibur: ["reka-glowna"],
  "miecz-chaosu": ["reka-glowna"],
  "swieta-wlocznia": ["reka-glowna"],
  "topor-swiatla-i-ciemnosci": ["reka-glowna"],
  "rozdzka-przeznaczenia": ["reka-glowna"],
  "rozdzka-zaklec": ["reka-glowna"],

  // Tarcze — ręka pomocnicza.
  tarcza: ["reka-pomocnicza"],
  "tarcza-tolimana": ["tarcza-tolimana"],
  "tarcza-boga-tolimana": ["tarcza-tolimana"],

  // Wierzchowce i sakwy.
  kon: ["wierzchowiec"],
  mul: ["wierzchowiec"],
  zaprzeg: ["wierzchowiec"],
  wierzchowiec: ["wierzchowiec"],
  "bojowy-rumak": ["wierzchowiec"],
  "magiczna-sakwa": ["sakwa"],
  "tajemna-sakwa": ["sakwa"],
};

/**
 * The two that only have to be found.
 *
 * Neither adds anything to a fight. p3: "Magiczne Miecze i Tarcze Tolimana są
 * przedmiotami wyjątkowymi" — one lets a character onto the Kamienny Most and
 * the other into the Zamek, and that is the whole of what they do. Carrying
 * them is not a choice anybody makes, so they get places of their own instead
 * of competing with a real weapon for a hand.
 *
 * DELIBERATE DEVIATION, documented per CLAUDE.md: they also stop counting
 * against 5.4. The rulebook exempts only Sztuki Złota from the four-item limit
 * and says nothing about these — so this is a house rule, not the book. It
 * exists because spending two of your four places on things you cannot use is
 * a tax on attempting to win at all.
 */
export const RELICS: ReadonlySet<string> = new Set([
  "magiczny-miecz",
  "tarcza-tolimana",
  "tarcza-boga-tolimana",
]);

/** The places this Przedmiot may be worn; empty when it is only ever carried. */
export function slotsFor(cardId: string): readonly Slot[] {
  return SLOT_OF[cardId as CardId] ?? [];
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
