/** Interprets a card's printed Miecz and Magia numbers, which mean different things depending on the card's class. */

import events from "@/data/events.json";
import { CARD_CLASS, type CardClass, type EventCard } from "@/data/types";
import type { CombatKind } from "./combat";

/**
 * The same two numbers appear on cards that fight and on cards you carry, and
 * they mean opposite things:
 *
 * - On a **Wróg** (16.2) they are the creature's strength, rolled against.
 * - On a **Przedmiot** or **Przyjaciel** they are a bonus added to the holder's
 *   total (1.5, 2.5) — Excalibur's Miecz 1 makes *you* stronger.
 *
 * Reading them without the class turns Pierścień Mocy, which grants +2 Magii,
 * into a monster with Magia 2 that the app offers to fight. Ten cards in the
 * deck were doing exactly that.
 */

export interface CombatValue {
  kind: CombatKind;
  total: number;
  /**
   * The total is not printed on the card — it is whoever is opposite.
   *
   * True only for the Sobowtór, and carried so that a caller drawing a number
   * can say where it came from rather than showing a figure that looks printed.
   */
  mirrors?: boolean;
}

/**
 * The one Wróg in the box with no number on him.
 *
 * "Sobowtór to monstrum, które tworzy sama Postać... Posiada zawsze tyle
 * punktów Miecza, ile jego przeciwnik." So his strength is a question about
 * somebody else, and every other creature's is a fact about itself.
 *
 * A set of one, rather than a flag on the card or a special case at the fight,
 * because the shape is what matters: `combatValueOf` is asked *what does this
 * fight with* everywhere in the app, and the honest answer for this card is
 * "as much as you" — which it can only give if it is told who you are. The set
 * is where a second such card would go if an expansion prints one.
 */
const MIRRORS_ITS_OPPONENT = new Set(["sobowtor"]);

/** How many fights a creature is, and what one of them is called. */
export interface FightRounds {
  times: number;
  /** The word for one round, so a round can be named: "głowa 2 z 3". */
  round: string;
}

/**
 * The one Wróg in the box you have to beat more than once.
 *
 * "Postać, która podejmie z nim walkę, będzie musiała pokonać jego trzy głowy
 * (każda głowa ma 2 punkty Miecza)." The 2 is what the card prints and what
 * `combatValueOf` reads, so nothing here touches the number — the head is an
 * ordinary Wróg of Miecz 2. What is not ordinary is that there are three of
 * them, one after another, and 17.4 ends a fight after one comparison.
 *
 * A map beside `MIRRORS_ITS_OPPONENT` and for the same reason: the shape is
 * the point. "How many fights is this creature" is a question about the card,
 * asked in one place, and the map is where a second such creature would go.
 */
const FIGHTS_IN_ROUNDS: ReadonlyMap<string, FightRounds> = new Map([
  ["trogglowy-smok", { times: 3, round: "głowa" }],
]);

export function roundsOf(cardId: string): FightRounds | null {
  return FIGHTS_IN_ROUNDS.get(cardId) ?? null;
}

/**
 * The Przedmioty printed "Przedmiot V Magiczny" rather than "Przedmiot V
 * Przedmiot".
 *
 * A printed class and not an adjective in a name: MAGICZNY MANUSKRYPT is
 * titled Magiczny and classed Przedmiot, which is exactly the card reading the
 * names would get wrong. Transcribed off the header band — see
 * `src/data/magical.test.ts`, which is that transcription's own record.
 *
 * Three rules ask this. The Wojna Żywiołów suspends them, the Przybysz z
 * Krainy Cieni refuses them, and the Kryształ Magów's bargain is written in
 * terms of them.
 */
const MAGICAL = new Set(
  (events as { id: string; magical?: boolean }[])
    .filter((card) => card.magical === true)
    .map((card) => card.id),
);

export function isMagicalItem(cardId: string): boolean {
  return MAGICAL.has(cardId);
}

/**
 * What this card fights with, or null if it does not fight.
 *
 * Only a Wróg fights. Rule 16.3 makes a Demon fight magically, which the deck
 * marks by printing Magia instead of Miecz.
 *
 * `mirror` is whoever is standing opposite — their own Miecz, for the one card
 * whose strength is theirs. Asked without it, that card still answers that it
 * fights, which is the question most callers are really asking (12.1a's guard,
 * "is this a Wróg at all", the raid's targets); the number is zero and says so
 * with `mirrors`, so nothing prints a strength it has not been given.
 */
export function combatValueOf(
  card: Pick<EventCard, "cardClass" | "miecz" | "magia"> & { id?: string },
  mirror?: { miecz: number },
): CombatValue | null {
  if (card.cardClass !== "foe") return null;
  if (typeof card.magia === "number") return { kind: "magical", total: card.magia };
  if (typeof card.miecz === "number") return { kind: "ordinary", total: card.miecz };
  if (card.id && MIRRORS_ITS_OPPONENT.has(card.id)) {
    return { kind: "ordinary", total: Math.max(0, mirror?.miecz ?? 0), mirrors: true };
  }
  return null;
}

export interface CardBonus {
  miecz: number;
  magia: number;
}

/**
 * What holding this card adds to its owner's totals.
 *
 * Only Przedmioty and Przyjaciele confer bonuses. A defeated Wróg's card is
 * kept as a trophy to trade for Miecz later (1.4), which is a different
 * mechanism entirely and deliberately not counted here.
 */
export function bonusOf(card: Pick<EventCard, "cardClass" | "miecz" | "magia">): CardBonus | null {
  if (card.cardClass !== "item" && card.cardClass !== "friend") return null;
  const miecz = card.miecz ?? 0;
  const magia = card.magia ?? 0;
  if (miecz === 0 && magia === 0) return null;
  return { miecz, magia };
}

/**
 * The Roman numeral printed at the top of a Karta Zdarzeń.
 *
 * It is not an identity and not a level — four Magiczne Miecze all print V, and
 * so does a Sztuka Złota. It is the card's *class*, and it is an instruction
 * about order: 15.2 has a stack of cards drawn on one Obszar resolved by
 * ascending numeral, "Karta o najniższym numerze rozpatrywana jest jako
 * pierwsza". So a Spotkanie happens before the Wróg standing next to it, and
 * you only reach the Przedmiot if you survived both.
 *
 * That is worth showing rather than leaving as a mark nobody can read. The
 * ranks themselves already live in `CARD_CLASS` and are load-bearing — the
 * sort in `state.ts` is what makes a turn resolve in the printed order.
 */
const NUMERAL = ["", "I", "II", "III", "IV", "V", "VI"] as const;

const CLASS_BY_ID = new Map<string, CardClass>(
  (events as EventCard[]).map((card) => [card.id, card.cardClass] as const),
);

/** The class a card belongs to, or null for anything that is not a Karta Zdarzeń. */
export function classOf(cardId: string): CardClass | null {
  return CLASS_BY_ID.get(cardId) ?? null;
}

/** What is printed at the top of the card, or null when nothing is. */
export function numeralOf(cardId: string): string | null {
  const cardClass = classOf(cardId);
  return cardClass ? NUMERAL[CARD_CLASS[cardClass]] : null;
}

/** What the numeral means, said in full for a hover. */
export function numeralMeaning(cardId: string): string | null {
  const cardClass = classOf(cardId);
  if (!cardClass) return null;
  return (
    `${NUMERAL[CARD_CLASS[cardClass]]} — klasa Karty. ` +
    `Karty wyciągnięte na jednym Obszarze rozpatruje się od najniższej (15.2).`
  );
}
