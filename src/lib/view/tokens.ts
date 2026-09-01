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

/**
 * How many columns a rail is, at the outside.
 *
 * Past this the pile stops growing and the numeral under it goes on being
 * exact, which costs nothing: the picture was only ever an impression of how
 * much somebody has, and the count was always the reading.
 */
export const COLUMNS_MAX = 3;

/**
 * A pile too big for its rail, divided into columns.
 *
 * Written once because it was written twice. The gold stacks and the żetony are
 * drawn quite differently — coins overlap and are all the same picture, żetony
 * sit apart and come in four denominations whose faces are half the reading —
 * but the arithmetic underneath is the same question with two sets of numbers,
 * and it was spelled out separately in each branch with the variables renamed.
 * Two copies of one sum is one chance for the second to be corrected and the
 * first forgotten.
 *
 * Each column is filled before the next is started, which is the point of
 * counting this way: a glance at four full stacks and a short one is
 * forty-something without reading anything, where four stacks of eleven and a
 * straggler is a heap that happens to be in columns.
 *
 * `cut` says the last square goes to the mark that admits there is more, rather
 * than to another token — so a rail filled to the ceiling stops looking exactly
 * like a rail that merely happens to be full. Fifteen żetony of four read as
 * sixty whether the seat has sixty or nine hundred, and the only thing that
 * knew the difference was the numeral underneath.
 */
export function pileColumns(
  count: number,
  perColumn: number,
  maxColumns: number = COLUMNS_MAX,
): { columns: number; drawn: number; cut: boolean } {
  const items = Math.max(0, Math.floor(count));
  const room = maxColumns * perColumn;
  const cut = items > room;
  const drawn = cut ? room - 1 : items;
  return { columns: Math.min(maxColumns, Math.ceil(items / perColumn)), drawn, cut };
}

/**
 * How much of the coin underneath still shows: half of it, at any size.
 *
 * The other half of `pileColumns`, and here for the same reason — it was
 * written twice, once for the rail beside a Karta Postaci and once for the gold
 * lying on an Obszar, with the variables renamed and the same sum underneath.
 *
 * A stack of identical tokens is drawn by overlapping them, which is what a
 * pile of coins looks like from across a table and costs nothing to draw since
 * every coin is the same picture anyway. **How far** they overlap is a
 * proportion of the coin and not a division of the room available, which is the
 * correction: fitting a stack to its box makes the overlap a function of how
 * many coins there happen to be, so the same pile is drawn differently in two
 * places and one of them is always wrong. Five 39px coins fitted to a 75px tile
 * left nine pixels of each showing — ruled lines with one ingot at the bottom —
 * while ten 16px coins fitted to a rail left eight, which is half of one and
 * reads as a stack.
 *
 * Half is that rail's own figure, kept: `(91 - 16) / 9` floors to exactly 8.
 * So this changes nothing about the Karta Postaci and gives every other pile
 * the proportion that was already working there.
 *
 * The room is not forgotten, it has moved: `tokens.test.ts` asserts the rail's
 * full stack of ten still fits the half-card it stands in. A number that has to
 * hold is better as a thing checked than as a formula that quietly reshapes the
 * picture to keep itself true.
 */
export const COIN_SHOWING = 0.5;

export function coinOverlap(size: number): number {
  return Math.max(1, Math.round(size * COIN_SHOWING));
}

/**
 * The overlap that makes a stack of `perStack` exactly `boxHeight` tall.
 *
 * The proportion above is the default and the rail's; this is for a pile that
 * has been given a shape to fill. Gold on an Obszar is fitted to the Karta tile
 * beside it — fifteen coins, three columns of five, the footprint of one card —
 * so the height is a promise and the overlap is what keeps it.
 *
 * This was here before, as the *only* rule, and it was wrong as one: dividing
 * the room by the coins makes the overlap a function of how many there are, so
 * 39px coins five deep showed nine pixels each and drew as ruled lines. What
 * makes it right here is that it now has to agree with the proportion rather
 * than replace it — at a 23px coin in 75 pixels it answers 13, where half would
 * be 12, so the fitted stack is the looser of the two. A caller reaching for
 * this whose answer comes out *under* `coinOverlap` is fitting a pile into a
 * box too small for it, and should make the box bigger or the pile shorter.
 */
export function stackOverlap(boxHeight: number, size: number, perStack: number): number {
  if (perStack <= 1) return size;
  return Math.max(1, Math.floor((boxHeight - size) / (perStack - 1)));
}

/**
 * A typed number of Sztuki Złota, held to what is actually lying there.
 *
 * 12.1 puts the amount in the player's gift — "zabrać leżące złoto" names none,
 * and Talisman's 12:1 says *any* Gold Counters may be taken — so the field is
 * free text and everything that can be typed into it has to mean something.
 *
 * Clamped rather than refused, which is the difference between a control and an
 * exam: asking for 99 off a square holding 6 plainly means "all of it", and a
 * disabled button with no explanation is the worst answer to a clear request.
 * A fraction floors, because there are no half coins; anything at or below zero
 * comes back as one, the smallest take there is; anything unreadable comes back
 * empty, so backspacing to nothing still works.
 *
 * The server does **not** clamp — `takeFieldGold` refuses. That is deliberate
 * and they are not in disagreement: a command guessing what an out-of-range
 * number meant is a command inventing a move, where a control doing it is a
 * control being usable. This is what keeps the refusal unreachable.
 */
export function clampCoins(typed: string, lying: number): string {
  if (typed.trim() === "") return "";
  const asked = Math.floor(Number(typed));
  if (!Number.isFinite(asked)) return "";
  return String(Math.min(Math.max(1, asked), Math.max(1, Math.floor(lying))));
}
