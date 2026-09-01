/** The test console's published surface: what Tab offers, re-exporting the vocabulary and the grammar. */

import { fold } from "./search";
import { RANDOM_CHARACTER_NAME } from "./characters";
import { STATS, availableIn, type Stage } from "./consoleSpec";
import {
  CARDS,
  DEALABLE,
  EFFECTS,
  FOES,
  NATURES,
  PEOPLE,
  PLACES,
  READABLE,
  STACKABLE,
  VERBS,
} from "./consoleParse";

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
  const stat = verb in STATS;

  /**
   * Every name this position could take, and where the fragment being typed
   * starts.
   *
   * `ordered` for a pool that has already decided what order it wants to be
   * read in; everything else is sorted alphabetically below, which is right for
   * a list of names with no shape of its own.
   */
  const from = (): {
    pool: string[];
    at: number;
    ordered?: true;
    groups?: readonly { title: string; names: readonly string[] }[];
  } => {
    if (typingVerb) {
      return { pool: [...words], at: 0 };
    }
    // `help` takes every command, locked or out of season: asking about one you
    // cannot run is a fair question, and the answer says why.
    if (verb === "help" || verb === "?") return { pool: [...VERBS], at: 1 };
    // A stat takes its amount first and a player after it; everything else
    // takes its one argument straight away.
    if (stat) return { pool: [...players, "force"], at: 2 };
    /**
     * Only what `give` will accept, in the order `GIVEABLE` groups them.
     *
     * `ordered`, or the sort below would put ALCHEMIK between 2 SZTUKI ZŁOTA
     * and ARONDIGHT and the three kinds would be shuffled together — which is
     * what happened when this pool was first grouped and the sort was
     * forgotten. Tab draws a plain grid and cannot label the groups, so their
     * order is the whole of what it can carry.
     */
    /**
     * Every Karta, in the order `DEALABLE` groups them.
     *
     * `ordered`, or the sort below would put ALCHEMIK between 2 SZTUKI ZŁOTA
     * and ARONDIGHT and the six kinds would be shuffled together — which is
     * what happened when this pool was first grouped and the sort was
     * forgotten. Tab draws a plain grid and cannot label the groups, so their
     * order is the whole of what it can carry.
     */
    if (verb === "deal") {
      return {
        pool: DEALABLE.flatMap((group) => group.cards.map((one) => one.name)),
        at: 1,
        ordered: true,
        groups: DEALABLE.map((group) => ({
          title: group.title,
          names: group.cards.map((one) => one.name),
        })),
      };
    }
    if (verb === "place" || verb === "put" || verb === "drop") {
      // Which half of the line is being typed. Past the `at`, the names on
      // offer are the board's; before it, the deck's.
      const said = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "at");
      return said === -1
        ? { pool: CARDS.map((c) => c.name), at: 1 }
        : { pool: PLACES.map((f) => f.name), at: said + 1 };
    }
    if (verb === "stack") return { pool: STACKABLE.map((c) => c.name), at: 1 };
    if (verb === "pile" || verb === "deck") return { pool: ["events", "spells"], at: 1 };
    if (verb === "fight") return { pool: FOES.map((c) => c.name), at: 1 };
    if (verb === "card" || verb === "read" || verb === "x") {
      // Everything readable, which is every Karta in the box: a Wróg cannot be
      // given and can certainly be looked at.
      return { pool: [...READABLE.map((one) => one.name), ...PEOPLE.map((one) => one.name)], at: 1 };
    }
    if (verb === "cross") return { pool: PLACES.map((f) => f.name), at: 1 };
    /**
     * `clear` names a Karta first and an Obszar only after `at`.
     *
     * It offered Obszary in both places, which is the wrong half of the
     * grammar: the common use is "take that Karta off the square I am standing
     * on", and Tab answered with a wall of place names. `place` splits its two
     * pools on the same word and this is its inverse, so it splits them the
     * same way.
     */
    if (verb === "clear") {
      const said = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "at");
      return said === -1
        ? { pool: CARDS.map((c) => c.name), at: 1 }
        : { pool: PLACES.map((f) => f.name), at: said + 1 };
    }
    if (verb === "teleport" || verb === "move" || verb === "walk") {
      return { pool: PLACES.map((f) => f.name), at: 1 };
    }
    if (
      verb === "kill" ||
      verb === "kick" ||
      verb === "unseat" ||
      verb === "host" ||
      verb === "spell" ||
      verb === "turn" ||
      verb === "stone"
    ) {
      return { pool: [...players], at: 1 };
    }
    // `seat Ola 3` finishes the person; the seat is a digit and finishes
    // itself.
    if (verb === "seat") return { pool: [...players], at: 1 };
    if (verb === "rename") {
      // Only the person. What they are being renamed to is not a name anybody
      // has yet, which is the point of typing it.
      const said = parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "as");
      return said === -1 ? { pool: [...players], at: 1 } : { pool: [], at: parts.length - 1 };
    }
    // Postacie by name — and for `remove` and `revive` a seat number would do
    // just as well, but a number has nothing to finish.
    if (verb === "pick" || verb === "remove" || verb === "erase" || verb === "revive") {
      const names = PEOPLE.map((person) => person.name);
      // First, and only for `pick`: it is the one entry that is not a Postać,
      // and the other three verbs act on a Karta that is already in the game.
      // A player scanning for "any of them" should not have to know that the
      // way to say it is to say nothing.
      return { pool: verb === "pick" ? [RANDOM_CHARACTER_NAME, ...names] : names, at: 1 };
    }
    if (verb === "effect") {
      return parts.length === 2
        ? { pool: Object.keys(EFFECTS), at: 1 }
        : { pool: [...players], at: 2 };
    }
    if (verb === "nature") {
      // The Natura first, then who it belongs to.
      return parts.length === 2
        ? { pool: Object.keys(NATURES), at: 1 }
        : { pool: [...players], at: 2 };
    }
    return { pool: [], at: parts.length - 1 };
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

/**
 * The list `help` prints, one command to a line.
 *
 * Every word that can be typed starts its own line, `place|put|drop`, rather
 * than trailing the summary as "(also put, drop)". Somebody reading this is
 * looking for the word to type, and the alternatives were both the furthest
 * thing from where the eye goes and the reason the lines were long enough to
 * wrap — which on a narrow window is what made a list of twelve look like a
 * list of seven.
 */
/**
 * What each kind of command needs before it may run.
 *
 * A second list beside `COMMANDS`, and deliberately: the spec table is keyed on
 * the word you type and this is keyed on what the word parsed *to*, and the two
 * are not one-to-one — `gold`, `sword`, `magic` and `life` are four words and
 * one `stat`. A test types every usage line `help` prints and checks the answer
 * here matches the spec it came from, which is what keeps them from drifting.
 */

export * from "./consoleSpec";
export * from "./consoleParse";
