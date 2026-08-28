/** Which rule each journal line is an instance of — the "why" under the "what". */

import spells from "@/data/spells.json";
import { JOURNAL_KINDS, type JournalKind } from "./journal";

const SPELL_IDS = new Set((spells as { id: string }[]).map((one) => one.id));

/** Whether an effect's source is a Zaklęcie rather than a Przedmiot or an Obszar. */
function isSpell(source: unknown): boolean {
  return typeof source === "string" && SPELL_IDS.has(source);
}

/**
 * The journal says what happened. This says under what rule.
 *
 * Fifty-odd kinds of line and not one of them named the rule it came from, so
 * a reader could see that a spell pile had been reshuffled, that a Natura
 * change had cost somebody a Topór, that a Postać came back with a fresh Karta
 * — and had nowhere to go with "why is that allowed?". The sentences could
 * each have been given a number by hand, which is how three of them would have
 * got one and forty-eight would not. One table instead, keyed by kind, so a
 * new kind cannot be added without the compiler asking what rule it is.
 *
 * `null` is an answer, and a common one: joining a table, leaving it, a manual
 * override, anything the test console conjured. Those are not events in
 * Magiczny Miecz at all — the rulebook has nothing to say about them because
 * they happen to the *table*, not in the game. Saying so here is worth more
 * than leaving them out, because it is the difference between "no rule covers
 * this" and "nobody has looked yet".
 *
 * One rule each, and the most specific one. A line that could cite three is a
 * line whose reader has to read three; the rest are a click away inside the
 * Instrukcja, which cross-references itself forty-one times.
 */
export const RULE_FOR: Record<JournalKind, string | null> = {
  // — the table, not the game ——————————————————————————————————————————
  /** People arriving, leaving and correcting: the poczekalnia's, not the box's. */
  joined: null,
  "table-opened": null,
  "joined-table": null,
  "took-seat": null,
  "left-seat": null,
  "new-host": null,
  "left-table": null,
  override: null,
  "moved-by-hand": null,
  "test-card": null,
  "test-card-field": null,
  "test-fight-end": null,
  /** Bookkeeping rows the reader never sees as prose. */
  card: null,
  "card-table": null,
  "field-table": null,
  roll: null,
  "fight-roll": null,
  "guardian-strength": null,

  // — a turn ———————————————————————————————————————————————————————————
  start: null,
  /** "Grę rozpoczyna gracz, który wyrzuci najwięcej oczek" and what follows. */
  "turn-end": "10.1",
  /** Rzut i ruch o tyle Obszarów, ile oczek. */
  move: "10.2",
  "turn-lost": "16.1",
  /** What a character starts the game holding is printed on its own Karta. */
  "starting-kit": "8.1",
  victory: "14.7",

  // — cards ————————————————————————————————————————————————————————————
  /** "Postać może zabrać te Karty ze sobą" — the taking, not the drawing. */
  taken: "16.6",
  /** Two piles, two rules — see `refine`. */
  reshuffle: "9.5",
  /** Odrzucenie Przedmiotu — jego Karta zostaje odkryta na Obszarze. */
  discarded: "5.5",
  /** Zbieranie z planszy odkrytych Kart. */
  "left-behind": "12.1",
  /**
   * Using a Karta you are holding is that Karta's instruction and nothing
   * else's — chapter 15 is about the order drawn cards are resolved in, and 16
   * about what each kind of card is. No numbered rule says "you may drink the
   * Eliksir", so none is cited.
   */
  used: null,
  /** Zakupy: Magiczne Miecze, Tarcze i Karty Wyposażenia. */
  bought: "21.1",
  sold: null,
  /** Trofea wymieniane na punkty Miecza. */
  "trophies-traded": "1.4",
  /**
   * Whatever took it said so on its own Karta — the Awanturnik takes a Koń,
   * the Łotr a point of Miecz. 16.6 is the opposite rule, about what you may
   * carry away, and reading it after losing something explains nothing.
   */
  "lost-card": null,

  // — Zaklęcia —————————————————————————————————————————————————————————
  /** Wolno mieć tyle Zaklęć, ile wynosi parametr Magii. */
  spell: "2.6",
  /** A Przyjaciel who arrives with a Zaklęcie of his own — still 2.6's limit. */
  "carried-spell": "2.6",
  /** A spell's rule; anything else that lays an effect has its own — `refine`. */
  effect: "9.6",
  /** Zaklęcie, które zapobiegło stracie punktu Życia. */
  shielded: "17.4",

  // — walka ————————————————————————————————————————————————————————————
  "fight-start": "17.1",
  "fight-end": "17.4",
  /** Walka między Postaciami, którą wolno wypowiedzieć na wspólnym Obszarze. */
  duel: "13.3",
  escape: "19.1",
  "escape-failed": "19.1",
  /** Bestia w Zamku — the fight the whole game is for. */
  "beast-draw": "14.7",
  "beast-loss": "14.7",

  // — Życie, śmierć i powrót ————————————————————————————————————————————
  healed: "4.7",
  healing: "4.7",
  points: "1.2",
  death: "4.4",
  "new-character": "4.4",
  /** Przyjaciel ginie zamiast ciebie. */
  "died-for-you": "6.4",
  /**
   * Najemnik, opłacony za turę of his help. The price and the bargain are
   * printed on his own Karta; chapter 6 is about custody and says nothing
   * about hiring anybody, so there is no rule to point at.
   */
  "paid-friend": null,

  // — Natura i Kamień ——————————————————————————————————————————————————
  /** Zmiana Natury: najwyżej raz na turę, i Karta Zmiany obok Karty Postaci. */
  "nature-change": "7.2",
  stone: "20.1",

  // — granice Kręgów i Kamienny Most ————————————————————————————————————
  crossing: "11.1",
  "crossing-failed": "11.1",
  /** Przewoźnik i jego opłata. */
  ferry: "11.2",
  "ferry-refused": "11.2",
  "bridge-entry": "11.9",
  "bridge-attempt": "11.9",
  "bridge-failed": "11.9",
  "bridge-guardian": "11.9",
  /** Rycerz Wiecznych Śniegów, napotkany przy przeprawie. */
  "guardian-start": "11.7",
  "guardian-end": "11.8",
  /** Cerber i Pułapka, dwie z sześciu rzeczy na Moście. */
  "bridge-cerberus": "14.6",
  "bridge-trap": "14.5",
  "bridge-death-game": null,
};

/**
 * Three kinds whose rule depends on what the line is about.
 *
 * The kind alone is too coarse for these, and being too coarse is how a line
 * about drinking an Eliksir Siły came to cite 9.6, which is the rule for
 * casting a Zaklęcie. A wrong citation is worse than none: it is a link, so
 * somebody follows it, lands on a rule about something else, and trusts the
 * next one less.
 *
 * Deliberately three and not thirty. Every other kind means one thing, and a
 * refinement per kind would be a second table drifting from the first.
 */
const REFINE: Partial<Record<JournalKind, (payload: Payload) => string | null>> = {
  /** Which pile ran out: 9.5 says it for Zaklęcia, 13.4 for Karty Zdarzeń. */
  reshuffle: (payload) => (payload?.pile === "zaklecia" ? "9.5" : "13.4"),
  /**
   * What laid the effect. 9.6 is "po wypowiedzeniu Zaklęcia... Karta jest
   * odkładana na stos" and belongs only to a Zaklęcie; an Eliksir, a Karta
   * Postaci or an Obszar doing the same thing is that thing's own business.
   */
  effect: (payload) => (isSpell(payload?.source) ? "9.6" : null),
  /** Which border: the Trzęsawiska are 11.1, the Lodowy Las 11.7. */
  crossing: (payload) => (payload?.obstacle === "lodowy-las" ? "11.7" : "11.1"),
};

/** What a journal row carries, as much of it as this file reads. */
type Payload = Record<string, unknown> | null | undefined;

/**
 * The rule a line cites, or nothing.
 *
 * A function rather than the record itself so that a kind stored by an older
 * version — one that knew a kind this one does not — answers with silence
 * instead of `undefined` leaking into a sentence.
 */
export function ruleForKind(kind: string, payload?: Payload): string | null {
  const refine = (REFINE as Record<string, ((p: Payload) => string | null) | undefined>)[kind];
  if (refine) return refine(payload ?? null);
  return (RULE_FOR as Record<string, string | null | undefined>)[kind] ?? null;
}

/** Every kind, for the test that keeps this table honest against the list. */
export const ALL_KINDS = JOURNAL_KINDS;
