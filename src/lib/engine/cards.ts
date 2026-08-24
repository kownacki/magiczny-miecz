/** Interprets a card's printed Miecz and Magia numbers, which mean different things depending on the card's class. */

import type { EventCard } from "@/data/types";
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
