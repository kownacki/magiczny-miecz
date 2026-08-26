/** Which Żetony Pomocnicze stand for a number of points (1.3, 2.3, 4.1). */

/**
 * The denominations the box prints, largest first.
 *
 * Ten of each, in each of the three colours. There is no 5 and no 10: a
 * character with nine points of Miecz has three tokens in front of it, not a
 * numeral, and that is the thing the interface is trying to look like.
 */
export const DENOMINATIONS = [4, 3, 2, 1] as const;

/**
 * The tokens a number of points is made of, largest first.
 *
 * Greedy, which is also optimal here — with 1, 2, 3 and 4 available there is no
 * amount that a bigger token makes worse, the way a 4 would if the set were
 * 1, 3 and 4. So this is both the fewest tokens and the ones a player would
 * actually reach for.
 *
 * The rulebook asks for exactly this whenever a parameter changes: losing a
 * point is "usunięcie żetonów o odpowiednim nominale" (1.4, 2.4, 4.5), which
 * means making change. Nothing here has to model *which* physical tokens are in
 * front of somebody, because only the total matters and the pile is deep enough
 * that any total can be made.
 */
export function tokensFor(points: number): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(points));
  for (const value of DENOMINATIONS) {
    while (left >= value) {
      out.push(value);
      left -= value;
    }
  }
  return out;
}
