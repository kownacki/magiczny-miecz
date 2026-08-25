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
}

/**
 * What this card fights with, or null if it does not fight.
 *
 * Only a Wróg fights. Rule 16.3 makes a Demon fight magically, which the deck
 * marks by printing Magia instead of Miecz.
 */
export function combatValueOf(card: Pick<EventCard, "cardClass" | "miecz" | "magia">): CombatValue | null {
  if (card.cardClass !== "wrog") return null;
  if (typeof card.magia === "number") return { kind: "magiczna", total: card.magia };
  if (typeof card.miecz === "number") return { kind: "zwykla", total: card.miecz };
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
  if (card.cardClass !== "przedmiot" && card.cardClass !== "przyjaciel") return null;
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
