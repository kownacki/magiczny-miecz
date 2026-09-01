/** The test console's published surface: what Tab offers, re-exporting the vocabulary and the grammar. */

import { fold } from "./search";
import { RANDOM_CHARACTER_NAME } from "./characters";
import { STATS, availableIn, type Stage } from "./consoleSpec";
import {
  CARDS,
  DEALABLE,
  EFFECTS,
  FIELD_KINDS,
  FOES,
  GOLD_OFFERED,
  GOLD_WORDS,
  NATURES,
  PEOPLE,
  PLACEABLE,
  READ_KINDS,
  STACK_KINDS,
  VERBS,
  type Catalogue,
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
     * What there is to do to a turn, and who to do the third one to.
     *
     * Offered rather than left to be remembered: `force` is a word you type at
     * a console that has just refused you, and a refusal that does not say
     * what to type next is a refusal you argue with. The two acts that need
     * test mode are not offered without it, the way `availableIn` hides a
     * locked verb — Tab must not teach a line that will be refused.
     */
    if (verb === "turn" || verb === "pass" || verb === "endturn") {
      if (offering.testmode === false) return { pool: ["end"], at: 1 };
      // `force` after `end`, and nowhere else — it is the only act that
      // refuses anything.
      const said = (parts[1] ?? "").toLowerCase();
      if (parts.length > 2 && (said === "end" || said === "")) {
        return { pool: ["force"], at: 2 };
      }
      return { pool: ["end", "reset", ...players], at: 1 };
    }
    /**
     * A catalogue as a pool: every name in it, in its own order, with the
     * headings kept beside them for a console that can draw them.
     *
     * `ordered`, or the sort below would put ALCHEMIK between 2 SZTUKI ZŁOTA
     * and ARONDIGHT and the kinds would be shuffled together — which is what
     * happened when the first of these was grouped and the sort was forgotten.
     * Tab draws a plain grid and cannot label the groups, so their order is
     * the whole of what it can carry there; the browser console draws the
     * headings from `sections`.
     */
    const shelved = (kinds: readonly Catalogue[], at: number) => ({
      pool: kinds.flatMap((group) => group.cards.map((one) => one.name)),
      at,
      ordered: true as const,
      groups: kinds.map((group) => ({
        title: group.title,
        names: group.cards.map((one) => one.name),
      })),
    });

    /**
     * Where `at` splits a line that names a Karta and then an Obszar.
     *
     * Past it the names on offer are the board's; before it, the deck's.
     */
    const said = () => parts.findIndex((part, index) => index > 0 && part.toLowerCase() === "at");

    /**
     * Whether the name in front of `at` is finished, so `at` is what comes next.
     *
     * Tab went quiet here, which is the one place it must not: `place EREMITA `
     * offered nothing, because no card name starts with "eremita " and the
     * fragment being matched still included the space. The keyword is the only
     * thing that can follow a finished name, so it is what is offered — and
     * only when the name really is finished, or `place TARCZA ` would stop
     * offering TARCZA TOLIMANA, which is a different card.
     */
    const finished = (names: readonly string[]): boolean => {
      if (parts.length < 3 || parts[parts.length - 1] !== "") return false;
      const typed = fold(parts.slice(1, -1).join(" "));
      return (
        names.some((name) => fold(name) === typed) &&
        !names.some((name) => fold(name).startsWith(`${typed} `))
      );
    };

    if (verb === "deal") return shelved(DEALABLE, 1);
    /**
     * `place` names a Karta first and an Obszar only after `at`; `clear` is its
     * inverse and reads the same way.
     *
     * `clear` offered Obszary in both places, which is the wrong half of the
     * grammar: the common use is "take that Karta off the square I am standing
     * on", and Tab answered with a wall of place names.
     */
    if (verb === "place" || verb === "put" || verb === "clear") {
      const at = said();
      if (at !== -1) return shelved(FIELD_KINDS, at + 1);
      /**
       * The money form, which both verbs have: `place gold N` puts coins down
       * and `clear gold [N]` takes them off. Tab cannot finish a number, so the
       * word is offered and then it gets out of the way — nothing where the
       * amount goes, and `at` once something has been typed there.
       *
       * `clear` differs in one respect: the amount is optional, because bare
       * `clear gold` means the lot. So `at` is offered as soon as the word is
       * finished, and again after a number.
       */
      const money = (parts[1] ?? "").toLowerCase();
      if (GOLD_WORDS.has(money)) {
        const amountIn = parts.length >= 4 && parts[parts.length - 1] === "";
        const bare = verb === "clear" && parts.length === 3 && parts[2] === "";
        return amountIn || bare
          ? { pool: ["at"], at: parts.length - 1 }
          : { pool: [], at: parts.length - 1 };
      }
      const names = PLACEABLE.flatMap((group) => group.cards.map((one) => one.name));
      if (finished(names)) return { pool: ["at"], at: parts.length - 1 };
      // Money first, the way 12.1 lists it — "zabrać leżące złoto, Przedmioty
      // lub Przyjaciół" — and because it is one word against a hundred and
      // sixty-five, which is the one a list this long can afford to lead with.
      return shelved([GOLD_OFFERED, ...PLACEABLE], 1);
    }
    /**
     * `take` names something lying on the Obszar or dealt into the turn, which
     * is the same pool `place` puts there — and the gold beside it, since 12.1
     * gives both to whoever finished their move here.
     *
     * Tab cannot know what is actually on the square, so it offers what could
     * be. That is what `drop` does with a hand it cannot see either.
     */
    if (verb === "take" || verb === "get") {
      const money = (parts[1] ?? "").toLowerCase();
      // Bare `take gold` already means the lot; `all` is the word for saying so.
      if (GOLD_WORDS.has(money)) return { pool: ["all"], at: 2 };
      return shelved([GOLD_OFFERED, ...PLACEABLE], 1);
    }
    /**
     * `drop` is a Karta out of your own hand and takes no Obszar — it is the
     * square you are standing on (12.1). It sat in `place`'s branch from when
     * the two shared a word, so Tab offered it an `at` the grammar rejects.
     */
    if (verb === "drop") return { pool: CARDS.map((c) => c.name), at: 1 };
    if (verb === "stack") return shelved(STACK_KINDS, 1);
    if (verb === "pile" || verb === "deck") return { pool: ["events", "spells"], at: 1 };
    /**
     * Every Wróg, in one list and not two.
     *
     * The box prints `Wróg II Bestia` and `Wróg III Demon`, and they are two
     * classes everywhere a rule counts them (15.2, 17.5, 18.2) — but this is a
     * list read by name, and the Księga shelves them together for the same
     * reason. One heading over the whole pool is no heading at all, so `fight`
     * keeps the plain alphabet.
     */
    if (verb === "fight") return { pool: FOES.map((c) => c.name), at: 1 };
    // Everything readable, which is every Karta in the box and every Postać: a
    // Wróg cannot be dealt into a hand and can certainly be looked at.
    if (verb === "card" || verb === "read" || verb === "x") return shelved(READ_KINDS, 1);
    // The board, wherever an Obszar is named on its own.
    if (verb === "cross" || verb === "teleport" || verb === "move" || verb === "walk") {
      return shelved(FIELD_KINDS, 1);
    }
    if (
      verb === "kill" ||
      verb === "kick" ||
      verb === "unseat" ||
      verb === "host" ||
      verb === "spell" ||
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
