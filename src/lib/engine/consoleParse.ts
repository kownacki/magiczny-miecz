/** The grammar's front door: one typed line, read against the vocabulary, becomes a command or a complaint. */

import { fold, findByName } from "./search";
import { BY_WORD, type Command } from "./consoleSpec";
import type { StatName } from "./consoleSpec";
import { PEOPLE } from "./consoleCatalogue";

export * from "./consoleCatalogue";

/** Every word this console answers to — the names and aliases in `SPECS`. */
export const VERBS: ReadonlySet<string> = new Set(BY_WORD.keys());

/**
 * Reads one line.
 *
 * A leading slash is allowed and ignored — it is what a person types out of
 * habit, and refusing it would be pedantry. Everything is case-insensitive and
 * the rest of the line after the verb is one argument, so a card can be named
 * with the spaces it is printed with: `give magiczny miecz`.
 *
 * The verb picks its entry in `SPECS` by name or alias, and the entry reads the
 * rest of the line. There is no ladder here any more: a word `help` prints is a
 * word this reads, because they are the same entry.
 */
export function parseCommand(line: string): { ok: Command } | { error: string } {
  const trimmed = line.trim().replace(/^\//, "");
  if (trimmed === "") return { error: "Type a command, or `help`." };

  const [first, ...rest] = trimmed.split(/\s+/);
  /**
   * `sword+1` and `gold-2`, split where a person forgot the space.
   *
   * Only where the sign or the digit begins, so it can never break a name: no
   * command has a number in it, and a card that does is one argument later.
   */
  const glued = /^([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)([+-]?\d.*)$/.exec(first);
  const verb = glued ? glued[1] : first;
  const word = verb.toLowerCase();
  const tail = [...(glued ? [glued[2]] : []), ...rest].join(" ").trim();

  const spec = BY_WORD.get(word);
  if (!spec) return { error: `No command \`${word}\`. Type \`help\` for the list.` };
  return spec.parse(tail, { word, usage: spec.usage, words: VERBS });
}

/**
 * What to say about a parameter that was asked to move.
 *
 * Written against what actually moved, never against what was asked for. The
 * store clamps — 1.3 and 2.3 hold own Miecz and Magia at or above the values
 * the character started with, Życie and Złoto at nothing, and everything at
 * `CEILING` — and it clamps silently, which is right, because the rule is the
 * rule. The console then printed the resulting value, so asking to take a point
 * off a Magia already at its floor answered "magia -1 → 3" and read exactly
 * like it had worked. Twice in a row, identically, which is how it was found.
 *
 * Here rather than beside the database, because that is where the mistake was:
 * a sentence assembled where nothing could ask it what it would say.
 */
export function statReply(said: {
  who: string;
  stat: StatName;
  /** What the line asked for. */
  asked: number;
  /** What the parameter moved by, which a floor or the ceiling may have cut. */
  moved: number;
  /** Where it ended up. */
  now: number;
  /** What the rule puts under it: the starting value, or nothing. */
  floor?: number;
  /** Whether the line said `force`, which lifts the floor under own points. */
  forced?: boolean;
}): string {
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const mark = said.forced ? " (forced)" : "";
  if (said.moved === said.asked) {
    return `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}${mark}`;
  }

  const floor = said.floor ?? 0;
  /**
   * One sentence for the floor, whether the number is sitting on it or under
   * it.
   *
   * Under it is a state only `force` can arrange, and it does behave a little
   * differently — the number is held where it is rather than at the rule's
   * value — but saying so took a second sentence to explain a distinction
   * nobody typing into a test console needs drawn. What both cases need is the
   * same: it did not move, here is the rule, here is the word that gets past
   * it.
   */
  const limit =
    said.asked > 0
      ? // Nothing can be above the ceiling to begin with, so this is the only
        // way up that is ever refused.
        `${said.stat} stops at ${said.now}`
      : said.forced || floor === 0
        ? `${said.stat} cannot go below ${said.now}`
        : `${said.stat} cannot go below the ${floor} this character started with (1.3, 2.3) — say \`force\` to`;
  return said.moved === 0
    ? `${said.who}: ${said.stat} stays at ${said.now} — ${limit}.`
    : `${said.who}: ${said.stat} ${signed(said.moved)} → ${said.now}, not ${signed(said.asked)} — ${limit}.`;
}

/**
 * Which of the people at the table a `[player]` names.
 *
 * By player, by character, or by seat number — whichever is on the screen when
 * somebody types, because a tester driving four seats reads them off four
 * different parts of it. The character is matched on its *printed* name and not
 * on its id: `bledny-rycerz` is what the row holds, and nobody types the hyphen
 * or knows it is there.
 *
 * Everybody seated is searchable, including a seat with no character on it. It
 * used to be only those with one, which quietly made `revive` unable to name
 * the seat it exists for — a latecomer's, whose character has not been dealt.
 *
 * Asked about a *person* rather than a seat, the same three handles work and a
 * fourth arrives: the id off the roster, for somebody who drives no seat at all
 * and can therefore be named by nothing that is printed on the board. So
 * `seat` is nullable here, and null is a spectator rather than a missing value.
 *
 * Pure, and it answers with an index rather than a row, so the caller keeps
 * whatever kind of row it started with.
 */
export function pickPlayer(
  people: readonly {
    /** The seat they drive; null for somebody watching. */
    seat: number | null;
    name: string | null;
    character: string | null;
    /** Four characters off the roster — see `makeUserId`. A seat has none. */
    id?: string;
  }[],
  who: string,
): { at: number } | { error: string } {
  const asked = who.trim();
  if (asked === "") return { error: "Who?" };

  // The number printed beside a seat is one-based; `seat` is the stored index.
  if (/^\d+$/.test(asked)) {
    const at = people.findIndex((one) => one.seat === Number(asked) - 1);
    if (at !== -1) return { at };
  }

  /**
   * The id, whole and exact, and ahead of the names.
   *
   * Four characters with no meaning in them: a prefix of one is a coincidence
   * rather than an abbreviation, so it is matched outright or not at all. It
   * goes first because it is the one handle that is guaranteed to name exactly
   * one person — which is what `who` prints it for.
   */
  const byId = people.findIndex((one) => one.id !== undefined && fold(one.id) === fold(asked));
  if (byId !== -1) return { at: byId };

  const named = people.map((one, index) => ({
    index,
    name:
      one.name ??
      nameOfCharacter(one.character) ??
      // A seat with neither is named by the number printed beside it. A person
      // always has a name, so for them this is unreachable — and an empty
      // string matches nothing, which is the honest answer if it ever is.
      (one.seat === null ? "" : `${one.seat + 1}`),
    also: one.name ? nameOfCharacter(one.character) : null,
  }));
  // A character's name is as good a handle as its player's, so both are in the
  // pool and either one finds the seat.
  const pool = named.flatMap((one) =>
    one.also ? [one, { ...one, name: one.also }] : [one],
  );

  const hit = findByName(pool, (one) => one.name, asked);
  if ("found" in hit) return { at: hit.found.index };
  if ("ambiguous" in hit) return { error: `Which one — ${hit.ambiguous.join(", ")}?` };
  return { error: `Nobody called \`${asked}\` is at this table.` };
}

function nameOfCharacter(id: string | null): string | null {
  if (!id) return null;
  return PEOPLE.find((one) => one.id === id)?.name ?? null;
}

