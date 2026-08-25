/** What a seat is carrying, and what that adds to its totals. */

import events from "@/data/events.json";
import type { EventCard } from "@/data/types";
import { bonusOf } from "./cards";
import { ABILITIES } from "./abilities";
import { isUsable } from "./uses";
import type { EqMode } from "./slots";
import { isWearable } from "./slots";
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
 *
 * A card you spend is the exception, and reading the corner is exactly wrong
 * for it: the Eliksir Siły prints a 2 because drinking it is worth two points
 * of Miecza *for one turn*, and carrying an unopened bottle around is worth
 * nothing at all. Left in, holding one was a permanent +2 that vanished when it
 * was finally drunk — the opposite of the card. `uses.ts` is what knows the
 * difference between a payoff and a standing rule.
 *
 * Each card is filed under both figures, because a character has two: 1.5's
 * example gives the Troll a "parametr Miecza równy 8" and "podczas walki 11
 * punktom". Only an encoded ability can tell them apart — a printed corner
 * number says how much and never when — so a card nobody has encoded counts
 * towards both, which is what it did before this existed.
 */
interface Lent {
  /** The character's parameter (1.5): what they are worth standing still. */
  parametr: HeldTotals;
  /** What they are worth in a fight, which is the same or more. */
  walka: HeldTotals;
}

const BONUS_BY_ID = new Map<string, Lent>();
for (const card of EVENTS) {
  if (isUsable(card.id)) continue;
  const printed = bonusOf(card);
  if (printed) BONUS_BY_ID.set(card.id, { parametr: printed, walka: printed });
}
for (const [cardId, abilities] of Object.entries(ABILITIES)) {
  const points = abilities.find((ability) => ability.kind === "punkty");
  if (points && points.kind === "punkty") {
    const lent = { miecz: points.miecz ?? 0, magia: points.magia ?? 0 };
    BONUS_BY_ID.set(cardId, {
      parametr: points.tylkoWalka ? { miecz: 0, magia: 0 } : lent,
      walka: lent,
    });
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
/**
 * The cards that are actually doing something.
 *
 * In klasyczny play, all of them: the rulebook has one kind of possession and
 * a Miecz in your pack is a Miecz (5.4).
 *
 * In slotowy, a card that *has* a place only works when it is in it — that is
 * the whole of the variant — while a card with no place goes on working from
 * the pack, because otherwise a quarter of the deck would fall silent. So a
 * sheathed Excalibur adds nothing and a Latarnia in the pack still lights the
 * Lodowy Las.
 *
 * Friends are never worn and always count. So are trophies, which are not
 * carried at all but kept for trading (1.4).
 */
export function inEffect<T extends { cardId: string; slot?: string | null }>(
  holdings: readonly T[],
  eqMode: EqMode,
): T[] {
  if (eqMode === "klasyczny") return [...holdings];
  return holdings.filter((held) => held.slot != null || !isWearable(held.cardId));
}

/**
 * Which of the two figures is being asked for.
 *
 * Named at every call site rather than defaulted, because both defaults are
 * wrong in one direction: assume `parametr` and a forgotten fight leaves a
 * character weaker than their cards make them; assume `walka` and everything
 * that is not a fight — the Pułapka of 14.5, the number on their card — reads
 * high. The compiler asking is cheaper than either.
 */
export type Reckoning = keyof Lent;

export function bonusFromHoldings(
  holdings: readonly Holding[],
  eqMode: EqMode,
  as: Reckoning,
): HeldTotals {
  let miecz = 0;
  let magia = 0;
  for (const holding of inEffect(holdings, eqMode)) {
    if (holding.kind !== "item" && holding.kind !== "friend") continue;
    const bonus = BONUS_BY_ID.get(holding.cardId);
    if (!bonus) continue;
    miecz += bonus[as].miecz;
    magia += bonus[as].magia;
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
