/** What a seat is carrying, and what that adds to its totals. */

import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { bonusOf } from "./cards";
import { ABILITIES } from "./abilities";
import type { Holding } from "./state";

const EVENTS = events as EventCard[];

export type HoldingKind = Holding["kind"];

/**
 * Which pile a drawn card joins when a character takes it.
 *
 * Rule 16.6 lets a character take Przedmioty, Przedmioty Magiczne and
 * Przyjaciele with them. A defeated Wróg's card is kept too, but as a trophy to
 * trade for Miecz points later (1.4) — a different mechanism, and one that must
 * not add its Miecz to the holder, or beating a Cyklop would make you six
 * points stronger.
 */
export function kindForCard(card: Pick<EventCard, "cardClass">): HoldingKind | null {
  switch (card.cardClass) {
    case "przedmiot":
      return "item";
    case "przyjaciel":
      return "friend";
    case "wrog":
      return "trophy";
    default:
      // Spotkania, Nieznajomi and Miejsca are resolved and set aside; nobody
      // carries them.
      return null;
  }
}

/**
 * Bonuses conferred by each card that grants one, by card id.
 *
 * Two sources, and the order between them matters. A card may print its bonus
 * as a number in the corner (Excalibur, Miecz Chaosu) or state it only in its
 * text (Srebrna Strzała, Święty Graal), and the encoded `punkty` ability is the
 * one that can express both. So the ability wins where there is one, and the
 * printed number fills in for every card nobody has encoded yet.
 *
 * Taking the sum of the two instead would double every card that has both,
 * which is the natural mistake here and an invisible one — Excalibur would
 * quietly be worth two points of Miecza rather than one.
 */
const BONUS_BY_ID = new Map<string, { miecz: number; magia: number }>();
for (const card of EVENTS) {
  const printed = bonusOf(card);
  if (printed) BONUS_BY_ID.set(card.id, printed);
}
for (const [cardId, abilities] of Object.entries(ABILITIES)) {
  const points = abilities.find((ability) => ability.kind === "punkty");
  if (points && points.kind === "punkty") {
    BONUS_BY_ID.set(cardId, { miecz: points.miecz ?? 0, magia: points.magia ?? 0 });
  }
}

export interface HeldTotals {
  miecz: number;
  magia: number;
}

/**
 * What a seat's held cards add to its own points (1.5, 2.5).
 *
 * Trophies contribute nothing, spells contribute nothing, and a card the app
 * has no bonus recorded for contributes nothing — the referee is usable before
 * every card is transcribed, so an unknown card must be inert rather than a
 * crash.
 */
export function bonusFromHoldings(holdings: readonly Holding[]): HeldTotals {
  let miecz = 0;
  let magia = 0;
  for (const holding of holdings) {
    if (holding.kind !== "item" && holding.kind !== "friend") continue;
    const bonus = BONUS_BY_ID.get(holding.cardId);
    if (!bonus) continue;
    miecz += bonus.miecz;
    magia += bonus.magia;
  }
  return { miecz, magia };
}

/**
 * What one viewer may see of another seat's hand.
 *
 * Items and friends lie face up on the table (5.2, 6.2) and are public. Spells
 * are held concealed (9.3), so another player learns only how many there are —
 * which is itself public, since the cards are visibly in someone's hand.
 *
 * A seat always sees its own hand in full. In companion mode nothing is hidden
 * at all: the cards are physically in people's hands and the app is not the one
 * keeping the secret.
 */
export function visibleTo(
  holdings: readonly Holding[],
  options: { own: boolean; mode: string },
): { cards: Holding[]; hiddenCount: number } {
  if (options.own || options.mode === "companion") {
    return { cards: [...holdings], hiddenCount: 0 };
  }
  const cards = holdings.filter((holding) => holding.face !== "hidden");
  return { cards, hiddenCount: holdings.length - cards.length };
}
