/** The pack as a row you arrange: where the gap opens, and what the drop means. */

/**
 * Dragging a card about inside the plecak, worked out apart from drawing it.
 *
 * Every rule in this file is here because the obvious version of it was wrong
 * first, and the doc comments on `hand.tsx` say so at length: a card picked up
 * and put straight back down came to rest at the back of the pack; pointing at
 * the fifth square moved the fourth card; dropping on the far end shoved the
 * whole tail sideways to make a place that was already there. Those are the
 * bugs a person reports as "it feels wrong", and none of them could be asked a
 * question while the answer lived in a closure inside a 700-line component.
 *
 * Nothing here knows about React or about pixels. A card is an id and the pack
 * is a list of them, which is all these questions are actually about.
 */

/** Anything with an id — a `Held`, or whatever a test finds convenient. */
interface Card {
  id: string;
}

/**
 * The pack in the order it should be drawn.
 *
 * The server's order is the truth; `wanted` — the order this device has just
 * asked for and not yet been told about — overrides it only while it still
 * describes exactly this set of cards. A stale one, from before a card was
 * taken or lost, is ignored rather than cleared, which keeps this a derivation
 * and not a thing that has to be kept in step.
 */
export function arrangedBy<T extends Card>(
  inPack: readonly T[],
  wanted: readonly string[] | null,
): T[] {
  const ids = inPack.map((held) => held.id);
  const describesThisPack =
    wanted !== null && wanted.length === ids.length && ids.every((id) => wanted.includes(id));
  return describesThisPack
    ? [...inPack].sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
    : [...inPack];
}

/**
 * Where the gap is, and nowhere when nothing is in the air.
 *
 * The insertion point is a hover, and a hover outlives what it was for: put the
 * card down with Escape or a click on the board and the pointer has not moved,
 * so nothing tells the row to close. It used to stay open — and open far wider
 * than it had been, because with no card in the air `stepFor` reads the row as
 * a card arriving from the body and the whole tail steps aside for it. Fourteen
 * cards stepped and twelve places drawn, for a card that was already back in
 * the pack.
 *
 * Read from what is actually in the air rather than from what was last hovered,
 * and the row cannot be left open by anything at all.
 */
export function insertIndexIn(
  arranged: readonly Card[],
  insertAt: string | null,
  liftedHoldingId: string | null,
): number {
  if (insertAt === null || liftedHoldingId === null) return -1;
  return arranged.findIndex((held) => held.id === insertAt);
}

/**
 * Which way one card steps aside, and how few of them have to.
 *
 * A card leaves a hollow where it was, and the row closes over it from
 * whichever side the card is going. Aim to your left and the cards between
 * there and the hollow step right, the way a hand opens a place. Aim to your
 * right and they step *left* instead, into the hollow, because that is the
 * direction they will really travel — everything from the target rightwards
 * stays exactly where it is, since nothing past the landing place moves.
 *
 * Stepping one way for both was the wrong picture in half the cases: dropping
 * on the far end pushed the whole tail of the pack sideways to make a place
 * that was already there, five squares back.
 *
 * A card off the body leaves no hollow — `liftedIndex` is below zero — so there
 * is nothing to close and the row opens in front of the target as before.
 */
export function stepFor(
  index: number,
  where: { liftedIndex: number; insertIndex: number },
): -1 | 0 | 1 {
  const { liftedIndex, insertIndex } = where;
  if (insertIndex < 0) return 0;
  if (liftedIndex < 0) return index >= insertIndex ? 1 : 0;
  if (insertIndex < liftedIndex) return index >= insertIndex && index < liftedIndex ? 1 : 0;
  return index > liftedIndex && index <= insertIndex ? -1 : 0;
}

/**
 * The card a landing card goes in front of, given the square you aimed at.
 *
 * You aim at a square and the card takes it. Coming from the left that means
 * going in front of the card *after* the one under the pointer, not in front of
 * that one — which is the same square counted from the other end, and counting
 * it from the wrong end put the card down one place short of where it was
 * aimed. Point at the fifth square and the fourth card was the one that moved.
 *
 * Coming from the right, and for a card off the body with no place in the row
 * yet, the square you aim at is the one you go in front of. Null means the end.
 */
export function landsBefore(
  arranged: readonly Card[],
  targetId: string,
  liftedIndex: number,
): string | null {
  const target = arranged.findIndex((held) => held.id === targetId);
  if (target < 0 || liftedIndex < 0 || target < liftedIndex) return targetId;
  return arranged[target + 1]?.id ?? null;
}

/** The pack's order with one card put before another, or on the end. */
export function orderWith(
  arranged: readonly Card[],
  holdingId: string,
  beforeId: string | null,
): string[] {
  const without = arranged.map((held) => held.id).filter((id) => id !== holdingId);
  const at = beforeId === null ? -1 : without.indexOf(beforeId);
  without.splice(at < 0 ? without.length : at, 0, holdingId);
  return without;
}

/**
 * Whether a drop would actually move anything.
 *
 * Dropping a card in front of the one that already follows it is a real aim at
 * a real place, and the place happens to be the one it is in — so it is
 * allowed, and answered with silence rather than with a round trip that
 * reorders the pack into the order it is already in.
 */
export function sameOrder(order: readonly string[], arranged: readonly Card[]): boolean {
  return order.every((id, index) => arranged[index]?.id === id);
}
