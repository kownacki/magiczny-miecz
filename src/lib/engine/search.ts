/** Finding a card, a field or a character by the name printed on it. */

/**
 * Folds Polish diacritics, so a Polish keyboard is never required to type a
 * Polish name: "zly" finds ZŁY DUCH and "swiety" finds ŚWIĘTY GRAAL.
 *
 * The ł is handled on its own because it is not a decorated l in Unicode — it
 * is its own letter and NFD leaves it alone.
 */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

/**
 * How well a name answers a query: 0 best, 3 not at all.
 *
 * Ranking matters more than matching here. Polish is full of shared stems —
 * "czar-" opens czarownica, czarodziej and czarny — so a plain substring search
 * buries the card somebody is actually looking for under its relatives. A name
 * that *starts* with what was typed comes first, then one whose later word
 * does, then one that merely contains it.
 */
export function matchRank(name: string, needle: string): number {
  const folded = fold(name);
  if (folded.startsWith(needle)) return 0;
  if (folded.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
  return folded.includes(needle) ? 2 : 3;
}

/**
 * The one thing a query names, or why it names none.
 *
 * An exact name always wins outright, so a query that is somebody's whole name
 * is never ambiguous just because a longer name contains it — "MIECZ" is the
 * Miecz even though MIECZ CHAOSU exists. Short of that, the best rank wins, and
 * a tie at the best rank is genuinely ambiguous and says so with the names it
 * could not choose between.
 */
export function findByName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  query: string,
): { found: T } | { ambiguous: string[] } | { missing: true } {
  const needle = fold(query.trim());
  if (needle === "") return { missing: true };

  const exact = items.filter((item) => fold(nameOf(item)) === needle);
  if (exact.length > 0) return { found: exact[0] };

  const ranked = items
    .map((item) => ({ item, rank: matchRank(nameOf(item), needle) }))
    .filter((entry) => entry.rank < 3);
  if (ranked.length === 0) return { missing: true };

  const best = Math.min(...ranked.map((entry) => entry.rank));
  const top = ranked.filter((entry) => entry.rank === best);
  const names = [...new Set(top.map((entry) => nameOf(entry.item)))];
  if (names.length > 1) return { ambiguous: names.sort((a, b) => a.localeCompare(b, "pl")) };
  return { found: top[0].item };
}
