/** Which beaten Wrogowie are still in hand, and which have left it (1.4). */

/** One beaten Wróg on the shelf, and whether his Karta is still in hand. */
export interface Beaten {
  readonly cardId: string;
  /** Beaten, and the Karta has since left the hand. Never true in „Punkty". */
  readonly gone: boolean;
}

/**
 * Everyone beaten, with the ones whose Karty have left the hand sorted last.
 *
 * `trophy_beaten` is written on every win in both modes and never shrinks, and
 * the holdings are what is still in hand, so the difference is what left. Three
 * things about that difference, all of them from docs/TROFEA.md and each a way
 * to get it wrong:
 *
 * - **A multiset, not a set.** Two Nobbiny are two entries and two holdings,
 *   and `filter(id => !held.includes(id))` calls the second one gone. So the
 *   held list is spent down one entry at a time.
 * - **Not „sold".** 1.4's trade is the usual way a Karta leaves, and putting one
 *   down is another; which happened is recorded nowhere. Hence `gone`, and a
 *   caption that claims no more than that.
 * It answers for both variants. It used to refuse in „Punkty", which held no
 * trophies to subtract from — that was a wrong reading of the variant, which
 * hoards exactly as the printed rule does and differs only in having sent the
 * Karty back at the kill. See docs/TROFEA.md.
 *
 * A held Karta that is *not* on the shelf is kept too, at the end of the living
 * ones: that is a table whose fights were won before the shelf was written in
 * this mode, and dropping it would empty a Plecak somebody can see.
 */
export function shelfFor(beaten: readonly string[], held: readonly string[]): Beaten[] {
  const left = [...held];
  const shelf: Beaten[] = beaten.map((cardId) => {
    const at = left.indexOf(cardId);
    if (at === -1) return { cardId, gone: true };
    left.splice(at, 1);
    return { cardId, gone: false };
  });
  for (const cardId of left) shelf.push({ cardId, gone: false });

  // Stable within each half, so the living row keeps the order they were won in
  // and the record below reads the same way.
  return [...shelf.filter((one) => !one.gone), ...shelf.filter((one) => one.gone)];
}
