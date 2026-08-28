/** Beaten Wrogowie, and the arithmetic of turning them into Miecz (1.4). */

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
