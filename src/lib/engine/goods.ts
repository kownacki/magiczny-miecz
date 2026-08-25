/** Turning a shop's printed price list into the cards it is selling. */

import items from "@/data/items.json";
import type { Item } from "@/data/types";

/**
 * The Wyposażenie card a price list names.
 *
 * Shops in this box print names, not ids: the Osada's Płatnerz sells "miecz"
 * and the Targowisko card sells a "Miecz", and both mean the same piece of
 * card. The scripts are written the way the board is printed, so the lookup
 * lives here rather than in every script.
 *
 * Case-folded with the Polish locale, because the sheets print names in capitals
 * and the scripts write them in sentence case.
 */
export function goodsId(name: string): string | null {
  const wanted = name.trim().toLocaleUpperCase("pl");
  const item = (items as Item[]).find((i) => i.name.toLocaleUpperCase("pl") === wanted);
  return item?.id ?? null;
}
