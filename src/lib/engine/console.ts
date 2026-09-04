/** The test console's published surface: what Tab offers, re-exporting the vocabulary and the grammar. */

import { fold } from "./search";
import { BY_WORD, availableIn, type Stage } from "./consoleSpec";
import { VERBS } from "./consoleParse";
import { nothing, type Pool } from "./consoleCatalogue";

export function complete(
  line: string,
  players: readonly string[] = [],
  /** What to offer. Everything, unless a surface says where the game has got to. */
  offering: { stage?: Stage; testmode?: boolean } = {},
): {
  line: string;
  options: string[];
  /**
   * The same options under headings, where the pool has them.
   *
   * A terminal cannot use this — readline draws its own grid from a flat list
   * and no heading survives — but a console that draws its own list can, and
   * `give`'s ninety names are three kinds a player is choosing between before
   * they are ninety names. Absent when the pool has no shape of its own.
   */
  sections?: { title: string; options: string[] }[];
} {
  const words = new Set(
    availableIn(offering).flatMap((spec) => [spec.name, ...spec.aliases]),
  );
  const slash = line.startsWith("/") ? "/" : "";
  const bare = line.slice(slash.length);
  const parts = bare.split(/\s+/);
  const typingVerb = parts.length === 1;
  const verb = parts[0].toLowerCase();

  /**
   * Every name this position could take, and where the fragment being typed
   * starts — the verb's own answer, from its entry in `SPECS`, or nothing.
   */
  const from = (): Pool => {
    if (typingVerb) return { pool: [...words], at: 0 };
    const spec = BY_WORD.get(verb);
    if (!spec?.complete) return nothing(parts);
    return spec.complete(parts, { players, offering, words: VERBS });
  };

  const { pool, at, ordered, groups } = from();
  // The rest of the line is one argument, so a name with spaces in it can be
  // completed from any word of it: `give magiczny mie` is still one fragment.
  const fragment = parts.slice(at).join(" ");
  if (pool.length === 0 || at >= parts.length) return { line, options: [] };

  const needle = fold(fragment);
  const matched = [...new Set(pool.filter((name) => fold(name).startsWith(needle)))];
  // Polish order, so ŁÓDŹ sits after LATARNIA rather than past Z — unless the
  // pool said it had already chosen an order, in which case that one is kept.
  const hits = ordered ? matched : matched.sort((a, b) => a.localeCompare(b, "pl"));
  if (hits.length === 0) return { line, options: [] };

  const head = parts.slice(0, at).join(" ");
  const joined = (name: string) => `${slash}${head === "" ? "" : `${head} `}${name}`;
  if (hits.length === 1) return { line: `${joined(hits[0])} `, options: [] };

  // As far as they all agree, and then the list — a shell's answer to an
  // ambiguous Tab, and the only one that never guesses.
  let shared = hits[0];
  for (const name of hits) {
    while (!fold(name).startsWith(fold(shared))) shared = shared.slice(0, -1);
  }
  // Cut the same hits into the pool's own groups, dropping any the fragment has
  // emptied — a heading over nothing is the burying this exists to stop.
  const sections = groups
    ?.map((group) => ({
      title: group.title,
      options: hits.filter((name) => group.names.includes(name)),
    }))
    .filter((group) => group.options.length > 0);
  return {
    line: joined(shared),
    options: hits,
    ...(sections && sections.length > 0 ? { sections } : {}),
  };
}

export * from "./consoleSpec";
export * from "./consoleParse";
