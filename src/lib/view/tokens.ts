/** Which Żetony Pomocnicze stand for a number of points (1.3, 2.3, 4.1). */

/**
 * The denominations the box prints, largest first.
 *
 * Ten of each, in each of the three colours. There is no 5 and no 10: a
 * character with nine points of Miecz has three tokens in front of it, not a
 * numeral, and that is the thing the interface is trying to look like.
 */
export const DENOMINATIONS = [4, 3, 2, 1] as const;

/** A column holds five, and a rail is one column wide before it turns a corner. */
const PER_COLUMN = 5;

/**
 * The tokens a number of points is made of, largest first.
 *
 * NOT the fewest tokens, which is what this used to be. Fewest gives a Miecz of
 * 3 a single żeton with a 3 printed on it, and then the numeral under the pile
 * is the same fact written twice — a rail that says "3" beside a tile that says
 * "3" and looks like a stat block rather than a pile of tokens.
 *
 * So: small change while small change fits. Five ones for five points, and past
 * that the ones are topped up one at a time — six is 2+1+1+1+1, nine is
 * 4+2+1+1+1 — so the rail stays exactly one column deep and keeps looking like
 * a handful of tokens rather than a number in disguise.
 *
 * Past twenty no arrangement fits a column, and the point of the exercise is
 * gone: from there it is the fewest tokens again, which is what somebody
 * actually has in front of them when they are that rich.
 *
 * Greedy is optimal for "fewest" here — with 1, 2, 3 and 4 available there is no
 * amount a bigger token makes worse, the way a 4 would if the set were 1, 3
 * and 4.
 *
 * The rulebook asks only for "żetony o odpowiednim nominale" (1.4, 2.4, 4.5) —
 * change of the appropriate denomination. It never says which change, so five
 * ones and one four are both it.
 */
export function tokensFor(points: number): number[] {
  const total = Math.max(0, Math.floor(points));
  const biggest = DENOMINATIONS[0];

  // Small enough to be ones, or small enough to be ones topped up.
  if (total <= PER_COLUMN) return Array.from({ length: total }, () => 1);
  if (total <= biggest * PER_COLUMN) {
    const out = Array.from({ length: PER_COLUMN }, () => 1);
    let left = total - PER_COLUMN;
    for (let at = 0; at < out.length && left > 0; at++) {
      const added = Math.min(biggest - 1, left);
      out[at] += added;
      left -= added;
    }
    return out;
  }

  const out: number[] = [];
  let left = total;
  for (const value of DENOMINATIONS) {
    while (left >= value) {
      out.push(value);
      left -= value;
    }
  }
  return out;
}
