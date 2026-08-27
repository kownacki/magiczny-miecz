/** Tab at a terminal, answered by the same function the browser's console answers it with. */

import { complete, type Stage } from "@/lib/engine/console";

/**
 * Why this is not just a call to `complete`.
 *
 * The engine hands back the whole line rewritten — the shared prefix applied,
 * and the candidates where more than one fits — because that is what a browser
 * input wants: set `value`, show a list under it. `readline` wants the opposite
 * shape: a list of *replacements* for some fragment at the end of the line, and
 * it works out the shared prefix itself.
 *
 * So the fragment is the whole line. Every candidate becomes the line it would
 * make, readline finds the same shared prefix among them by its own route, and
 * the two surfaces cannot disagree about what Tab does because only one of them
 * decides anything.
 *
 * Kept out of `mm.ts` so it can be tested: that file ends in `void main()`, and
 * importing it to check a pure function would start a game.
 */
export function tabFor(
  line: string,
  players: readonly string[],
  local: readonly string[],
  /** Where the game has got to, so Tab offers what would actually run. */
  offering: { stage?: Stage; testmode?: boolean } = {},
): [string[], string] {
  /**
   * The local words are in the pool, and they are not part of the shared
   * grammar — the browser could never carry `load` out. But they are words you
   * type *here*, and a Tab that knew `pick` and not `saves` would be lying
   * about which half of the vocabulary this prompt takes.
   *
   * Only while typing the first word: `load AB` is finishing a save code, and
   * nothing here knows those.
   */
  const localHits = line.includes(" ")
    ? []
    : local.filter((word) => word.startsWith(line.toLowerCase()));

  const { line: filled, options } = complete(line, players, offering);

  /**
   * An empty line is asked about both halves at once.
   *
   * Short-circuiting to the local words whenever one matched meant Tab on a
   * bare prompt listed `new`, `load`, `saves` and nothing else — every local
   * word starts with "", so the game's own vocabulary never got a turn.
   */
  if (localHits.length > 0) {
    const also = line === "" ? options.filter((one) => !localHits.includes(one)) : [];
    return [[...localHits, ...also].map((word) => `${word} `), line];
  }
  if (options.length === 0) return [filled === line ? [] : [filled], line];

  const head = filled.slice(0, filled.length - sharedTail(filled, options).length);
  return [options.map((one) => `${head}${one}`), line];
}

/**
 * How much of the rewritten line is the part the candidates agree on.
 *
 * `complete` has already advanced the line as far as they all match, so the
 * tail of it is a prefix of every candidate — and the longest such prefix is
 * where the fragment begins. Found by measuring rather than by asking the
 * engine to say, so the two do not need a second shared shape between them.
 */
function sharedTail(filled: string, options: readonly string[]): string {
  const lower = filled.toLowerCase();
  for (const one of options) {
    const name = one.toLowerCase();
    for (let take = name.length; take > 0; take--) {
      if (lower.endsWith(name.slice(0, take))) return filled.slice(filled.length - take);
    }
  }
  return "";
}
