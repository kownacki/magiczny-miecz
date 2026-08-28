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
 *
 * `endless` is the table's answer to 21.2 — see `endless_stock` in schema.sql.
 * It does not reach the two relics: see `RELICS` below.
 */
export function stockLeft(cardId: string, inPlay: number, endless = false): number {
  const printed = PRINTED_STOCK[cardId];
  if (printed === undefined) return Infinity;
  if (endless && !RELICS.has(cardId)) return Infinity;
  return Math.max(0, printed - inPlay);
}

/**
 * The two the scarcity is *for*, which stay scarce however the table is set.
 *
 * 21.2 reads as a rule about a shortage of cardboard, and for a Miecz or a Hełm
 * that is all it is: common things, of which the box holds five and three, and
 * a table whose Karty Postaci ask for five Miecze has emptied the supply before
 * anybody rolls. There is nothing in the fiction there to preserve.
 *
 * The Magiczny Miecz and the Tarcza Tolimana are the opposite. 11.9 will not
 * let you onto the Most without the first and 14.7 will not let you into the
 * Zamek without the second, so "there are four and five of you want one" is not
 * a shortage of cardboard, it is the endgame. An endless pile of those is a
 * different game, and a quieter one.
 *
 * They are printed on the Wyposażenie sheets and drawn from the same pile, so
 * calling them Wyposażenie is not wrong about the cardboard. The rulebook still
 * holds them apart: chapter 21 is titled "MAGICZNE MIECZE, TARCZE TOLIMANA I
 * KARTY WYPOSAŻENIA" — three things joined by *i* — and 21.1 refers back to
 * that title as a list.
 *
 * Which is the distinction the copy leans on: *zwykłe* Wyposażenie is what this
 * setting frees, and the two the chapter names separately are what it does not.
 * "Przedmioty" would have been looser rather than safer — a Koń and an Eliksir
 * Siły are Przedmioty too, and neither was ever finite, because neither is on
 * this sheet.
 */
export const RELICS: ReadonlySet<string> = new Set(["magiczny-miecz", "tarcza-tolimana"]);
