/** Which beaten Wrogowie are still in hand, and which have left it (1.4). */

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
