/** Beaten Wrogowie, and the arithmetic of turning them into Miecz (1.4). */

import { combatValueOf } from "./cards";
import { EVENTS } from "@/lib/game/decks";

/**
 * 1.4: seven points of beaten Wróg buy one point of Miecz.
 *
 * A rule, so it lives in the engine rather than beside the command that spends
 * it. Re-exported from `commands/shop.ts`, which is where it used to be and
 * where most callers still reach for it.
 */
export const TROPHY_RATE = 7;

/** One beaten Wróg, and the Miecz printed on it. */
export interface Trophy {
  readonly cardId: string;
  readonly points: number;
}

/**
 * A trade somebody could make: this many Miecze, for these Karty.
 *
 * `cardIds` is empty in „Punkty" mode, where there are no Karty to hand in and
 * the same shape still answers the same question.
 */
export interface Offer {
  /** Miecze bought. Never zero — an offer that buys nothing is not an offer. */
  readonly swords: number;
  /** The Karty handed in, in the order they were held. */
  readonly cardIds: readonly string[];
  /** What they total. */
  readonly points: number;
  /** Points above the multiple of seven, which 1.4 says are lost. */
  readonly wasted: number;
}

/**
 * Every number of Miecze this hand can buy, each by its cheapest set.
 *
 * # Why this is a search and not a division
 *
 * 1.4 gives you a choice — "za każde 7 punktów" says the rate and never says
 * you must hand in everything you hold — and the subset ruling in
 * docs/TROFEA.md settled that you may pick. But picking well is arithmetic
 * nobody wants to do at a table: holding 6, 5, 2, 2 you can pay 5+2 for one
 * Miecz and waste nothing, or hand in all fifteen and burn one. Those are
 * different trades, and the difference is invisible until somebody adds it up.
 *
 * So the engine adds it up. For each number of Miecze the hand can reach, the
 * set that reaches it with the least waste — and among equally wasteful sets,
 * the fewest Karty, which keeps the small denominations back for the next
 * trade. A hand of ones and twos is what lets you hit an exact seven later; a
 * hand of tens is not.
 *
 * # Why exhaustively
 *
 * Subset-sum is the honest shape of the question and greedy gets it wrong:
 * take the biggest first from 6, 5, 2, 2 and you spend 6+5 for one Miecz,
 * burning four, when 5+2 burns nothing. The hand is at most the twenty-one
 * hoardable Wrogowie in the box and their total is 75, so the whole table of
 * reachable sums is 76 entries wide and costs nothing to fill.
 */
export function offersFor(held: readonly Trophy[]): Offer[] {
  const best = new Map<number, Offer>();
  for (const [points, picked] of reachable(held)) {
    const swords = Math.floor(points / TROPHY_RATE);
    if (swords < 1) continue;
    const offer: Offer = {
      swords,
      cardIds: picked.map((at) => held[at].cardId),
      points,
      wasted: points - swords * TROPHY_RATE,
    };
    const standing = best.get(swords);
    if (standing === undefined || better(offer, standing)) best.set(swords, offer);
  }
  return [...best.values()].sort((a, b) => a.swords - b.swords);
}

/**
 * The cheapest way to buy exactly this many Miecze, or null if the hand cannot.
 *
 * Null rather than the nearest thing, because "you cannot" and "here is
 * something else" are different answers and only the caller knows which its
 * player asked for.
 */
export function offerFor(held: readonly Trophy[], swords: number): Offer | null {
  if (!Number.isInteger(swords) || swords < 1) return null;
  return offersFor(held).find((one) => one.swords === swords) ?? null;
}

/** The most Miecze this hand can buy at once. Zero when it cannot buy one. */
export function mostSwords(held: readonly Trophy[]): number {
  return Math.floor(held.reduce((sum, one) => sum + one.points, 0) / TROPHY_RATE);
}

/**
 * „Punkty" mode's offers, where the hand is a number and nothing is wasted.
 *
 * Same shape deliberately: a surface that can draw one can draw the other, and
 * the fork between the modes stays in the one place that has to know.
 */
export function pointOffers(points: number): Offer[] {
  const most = Math.floor(points / TROPHY_RATE);
  return Array.from({ length: Math.max(0, most) }, (_unused, at) => ({
    swords: at + 1,
    cardIds: [],
    points: (at + 1) * TROPHY_RATE,
    wasted: 0,
  }));
}

/**
 * Every total this hand can make, with the fewest Karty that makes it.
 *
 * The indices are into `held`, so the caller keeps the order the cards were in
 * — a list that comes back sorted by value would be a list nobody recognises.
 */
function reachable(held: readonly Trophy[]): Map<number, number[]> {
  const sums = new Map<number, number[]>([[0, []]]);
  held.forEach((trophy, at) => {
    // A snapshot, so a card cannot be spent twice within its own round.
    for (const [points, picked] of [...sums]) {
      const total = points + trophy.points;
      const grown = [...picked, at];
      const standing = sums.get(total);
      if (standing === undefined || grown.length < standing.length) sums.set(total, grown);
    }
  });
  sums.delete(0);
  return sums;
}

/** Less wasted first; then fewer Karty handed over. */
function better(one: Offer, than: Offer): boolean {
  if (one.wasted !== than.wasted) return one.wasted < than.wasted;
  return one.cardIds.length < than.cardIds.length;
}

/**
 * What one beaten Wróg is worth towards 1.4's sevens.
 *
 * `mirror` is the holder's own Miecz, for the one Karta with no number of its
 * own: „Posiada zawsze tyle punktów Miecza, ile jego przeciwnik", and the
 * character holding a Sobowtór's Karta is the one who made him. Asked for
 * rather than defaulted, because a trophy priced at zero because nobody said
 * is exactly the silent wrongness this avoids.
 *
 * Here rather than in `commands/shop.ts` because three places needed it and
 * only one could reach it: the console had a byte-identical private copy and
 * the trophy panel a third variant. The engine is the one home every caller
 * may import — the console included, which is what docs/STACK.md's open
 * thread thought was the obstacle.
 */
export function trophyPointsOf(cardId: string, mirror?: { miecz: number }): number {
  const card = EVENTS.find((one) => one.id === cardId);
  return (card ? combatValueOf(card, mirror)?.total : 0) ?? 0;
}

/** One beaten Wróg on the shelf, and whether his Karta is still in hand. */
export interface Beaten {
  readonly cardId: string;
  /** Beaten, and no longer held: traded away (1.4) or put down. */
  readonly gone: boolean;
  /**
   * The holding this trophy still is, absent once it has gone.
   *
   * Carried because a choice needs an identity and a card id is not one: two
   * Nobbiny are one name and two trophies, and a player picking the second one
   * out of the row means *that* tile. `trophy_beaten` has only names, so the
   * id comes from the holding it was matched to.
   */
  readonly holdingId?: string;
}

/**
 * Everyone beaten, newest first, with the spent ones pushed to the end.
 *
 * `trophy_beaten` is written on every win in both modes and never shrinks, and
 * the holdings are what is still held, so the difference is what has gone.
 * Two things about that difference, from docs/TROFEA.md and each a way to get
 * it wrong:
 *
 * - **A multiset, not a set.** Two Nobbiny are two entries and two holdings,
 *   and `filter(id => !held.includes(id))` calls the second one gone. So the
 *   held list is spent down one entry at a time.
 * - **Not „sold".** 1.4's trade is the usual way a trophy goes, and putting one
 *   down is another; which happened is recorded nowhere. Hence `gone`, and a
 *   caption that claims no more than that.
 *
 * It answers for both variants. It used to refuse in „Punkty", which held no
 * trophies to subtract from — that was a wrong reading of the variant, which
 * hoards exactly as the printed rule does and differs only in having sent the
 * Karty back at the kill.
 *
 * # The order, which is the whole of the arrangement
 *
 * Newest first, spent last, and nobody drags anything. A pack is arranged by
 * hand because a card is recognised by where you put it; a shelf of Wrogowie is
 * not — it grows at one end every time you win a fight, and the one you just
 * beat is the one you are looking for. So the newest is where the eye starts,
 * the spent are out of the way on the right, and each half runs newest to
 * oldest so the two read the same direction.
 *
 * A held Karta that is *not* on the shelf is kept too, and counted as the
 * oldest thing there is: that is a table whose fights were won before the shelf
 * was written, so it predates every entry that has a date at all.
 */
export function shelfFor(
  beaten: readonly string[],
  held: readonly { holdingId: string; cardId: string }[],
): Beaten[] {
  const left = [...held];
  const dated: Beaten[] = beaten.map((cardId) => {
    const at = left.findIndex((one) => one.cardId === cardId);
    if (at === -1) return { cardId, gone: true };
    const [taken] = left.splice(at, 1);
    return { cardId, gone: false, holdingId: taken.holdingId };
  });

  // Oldest first while it is being built, so one reverse settles both halves.
  const all: Beaten[] = [
    ...left.map((one) => ({ cardId: one.cardId, gone: false, holdingId: one.holdingId })),
    ...dated,
  ].reverse();
  return [...all.filter((one) => !one.gone), ...all.filter((one) => one.gone)];
}
