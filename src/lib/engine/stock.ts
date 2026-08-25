/** How many of each Wyposażenie card the box holds, and what that means when they run out (21.2, 16.6). */

import items from "@/data/items.json";
import type { Item } from "@/data/types";

/**
 * The printed supply.
 *
 * Rule 21.2: bought equipment is not discarded but goes back on its pile, "aby
 * możliwe było ponowne dokonanie ich zakupu. Jeżeli zabraknie Kart jakiegoś
 * Przedmiotu, oznacza to, że Przedmiot ten jest w danej chwili nieosiągalny."
 * So the pile is finite, it refills as things are lost, and a shop can genuinely
 * be out of Magiczne Miecze — which is a real obstacle late in a game where
 * four players are all trying to reach the bridge.
 *
 * The counts are the cards themselves rather than a table written out here: the
 * Wyposażenie sheet has four Magiczne Miecze and four Tarcze Tolimana on it, and
 * one Latarnia.
 */
export const PRINTED_STOCK: Readonly<Record<string, number>> = (() => {
  const counts: Record<string, number> = {};
  for (const item of items as Item[]) counts[item.id] = (counts[item.id] ?? 0) + 1;
  return counts;
})();

/** Whether this card comes from the equipment pile at all. */
export function fromTheShop(cardId: string): boolean {
  return cardId in PRINTED_STOCK;
}

/**
 * How many are left to be had, given how many are already somewhere in the game.
 *
 * Derived rather than stored, and that is the point: 16.6 says a *drawn*
 * Magiczny Miecz or Tarcza Tolimana is exchanged for the equipment card and the
 * drawn one discarded, so every copy in play — bought, found or lying on a
 * field where somebody dropped it — occupies one of the printed slots. Counting
 * them is therefore the same answer as keeping a tally, and it cannot drift out
 * of step with the board the way a tally can.
 */
export function stockLeft(cardId: string, inPlay: number): number {
  const printed = PRINTED_STOCK[cardId];
  if (printed === undefined) return Infinity;
  return Math.max(0, printed - inPlay);
}
