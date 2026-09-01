/** The three Miejsca that lie on an Obszar with a pool of points, and what one visit does to it (16.7). */

import { scriptFor } from "./cardScript";

/**
 * "Po znalezieniu Drzewa, połóż przy nim 4 punkty Życia. Każdy, kto tu trafi,
 * będzie mógł zjeść owoc odzyskując 1 punkt Życia i zmniejszając tym samym
 * liczbę punktów przy Drzewie. Po wykorzystaniu 4 punktów, Drzewo usycha,
 * należy odłożyć jego Kartę."
 *
 * Three cards say that, in three currencies — Drzewo Życia in Życie, Jezioro
 * Magiczne in Miecz, Zaklęte Źródło in Magia — and it is the only count in the
 * box that belongs to a Karta rather than to a Postać. Everything else that
 * runs down is somebody's: turns lost, a status worn, the seven points of a
 * trophy. This one outlives every visitor, and the next character to stop here
 * inherits what the last one left.
 *
 * `disposition` has said `zostaje-z-pula` since the Miejsca were transcribed
 * and nothing read it: `describeDisposition` printed a sentence about four
 * points and no code anywhere subtracted one, so the well never ran dry and
 * four visitors could each drink from it forever. The column it wanted did not
 * exist — see `field_cards.pool` in db/schema.sql for why it is on the row.
 *
 * Pure, and deliberately small: what a pool *is* belongs beside the rules, and
 * where it is stored belongs to the command that writes it.
 */

/** What this card lays out when it settles, or null if it lays out nothing. */
export function startingPool(cardId: string): number | null {
  const disposition = scriptFor(cardId)?.disposition;
  return disposition?.kind === "zostaje-z-pula" ? disposition.points : null;
}

/** Whether visiting this card draws its pool down by one. */
export function drawsFromPool(cardId: string): boolean {
  return startingPool(cardId) !== null;
}

/**
 * What is left after one visit, and whether that empties it.
 *
 * `left` is clamped at zero rather than allowed negative, because a pool that
 * has gone below empty is a bug that should look like an empty pool and not
 * like a card owing points. `dry` is what the caller acts on: the Karta goes
 * to the stos użytych at that moment, not on the next visit — "Po wykorzystaniu
 * 4 punktów, Drzewo usycha".
 *
 * Answers null for a card with no pool, so a caller can ask about any Karta on
 * the Obszar without knowing which of the thirteen Miejsca it is.
 */
export function afterVisit(
  cardId: string,
  pool: number | null,
): { left: number; dry: boolean } | null {
  if (!drawsFromPool(cardId)) return null;
  /**
   * A row that predates the column reads as full rather than as empty.
   *
   * Every Drzewo already lying on a board when this shipped has `pool` null,
   * and the two ways to read that are "nobody has drunk yet" and "there is
   * nothing left". The first is the one that cannot take something away from a
   * player because of a migration, so it is the one taken.
   */
  const before = pool ?? startingPool(cardId) ?? 0;
  const left = Math.max(0, before - 1);
  return { left, dry: left === 0 };
}

/**
 * Whether there is anything left to take.
 *
 * A dry Karta should never be on the board — it is discarded the moment its
 * last point goes — so this is the same answer said twice, at the place that
 * would otherwise offer a fifth drink from a four-point well if a row ever
 * survived its pool.
 */
export function poolRemains(cardId: string, pool: number | null): boolean {
  if (!drawsFromPool(cardId)) return true;
  return (pool ?? startingPool(cardId) ?? 0) > 0;
}
