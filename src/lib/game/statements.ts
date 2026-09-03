/** One write to one table, as a value — so that a whole commit can be handed to something that runs all of it or none of it. */

/**
 * # Why a commit is a list of values rather than nineteen calls
 *
 * `commit` used to issue its writes one at a time: the `games` compare-and-swap,
 * then seats, users, holdings, field cards, field gold, effects, and the journal
 * last. Nineteen statements in a row, each awaited, each able to fail after the
 * ones before it had already landed.
 *
 * It failed exactly that way on 2026-09-03. A player took a Tarcza Tolimana off
 * a Nieznajomy, the Tarcza moved, the turn advanced, and then the journal insert
 * was refused by a `moves_kind_check` the database had never been migrated to.
 * The state had happened and the record of it had not — which is the single
 * failure the note above `appendJournal` exists to prevent, arriving from the
 * one direction that note could not cover.
 *
 * The `games` compare-and-swap does not close this. It makes a *loser* write
 * nothing at all, which is what CLAUDE.md means and it is true. It says nothing
 * about statement nine of nineteen failing on the winner.
 *
 * # Why this shape, and not a `commit_change` function in SQL
 *
 * The obvious fix is a Postgres function that knows what a changeset is. It is
 * also forbidden here, and for a good reason: `storeOver(handle)` is *one*
 * implementation serving both Postgres and the in-memory store that `mm` and
 * every save file run on, and "every implementation keeps the compare-and-swap"
 * is a non-negotiable. A function written in SQL cannot be called by a `Map`, so
 * the game would get a second commit path — and the divergence would show up as
 * a save file that replays differently, not as a failing test.
 *
 * So the *decision* stays in TypeScript, in one place, and only its **result**
 * crosses the seam. `commit` folds a `Changeset` into this list, and the list is
 * handed to whatever is holding the game: `magiczny_miecz.apply_change`, which
 * runs it inside one transaction, or `fakeDb`, which applies it to a copy of the
 * tables and swaps the copy in only if all of it worked. Neither of them knows
 * what a Karta is. The vocabulary below is the whole of what they must agree on,
 * and it is small enough to read in one sitting — which is the point.
 *
 * # The one thing that is not a plain write
 *
 * `expect`. The compare-and-swap is an ordinary `update` whose `eq` names the
 * revision the snapshot read, plus a claim about how many rows that must match.
 * A runner that matches a different number undoes everything and says so, and
 * the caller turns that into a `Conflict`. That keeps the CAS *in `commit`*,
 * written once, where CLAUDE.md wants it — the runners only enforce a number
 * they were handed.
 */

/** Every table this game owns. The one list; `Tables` and the SQL runner both take theirs from here. */
export const TABLE_NAMES = [
  "games",
  "seats",
  "users",
  "holdings",
  "seat_effects",
  "field_cards",
  "field_gold",
  "moves",
] as const;

/**
 * A table name is never a `string`, for the same reason an id is never one.
 *
 * It also bounds what a runner may touch. This schema shares a Postgres instance
 * with finalbid and wheatbid and the service-role key reaches all of them, so
 * `apply_change` checks every name against this same list before it builds any
 * SQL — a typo is a refusal rather than somebody else's table.
 */
export type TableName = (typeof TABLE_NAMES)[number];

/** A row as it crosses the seam: column names to JSON-shaped values, and nothing typed. */
export type Cells = Record<string, unknown>;

/**
 * Which rows a statement is about.
 *
 * `eq` is column-equals-value, and every write here carries `game_id` in it
 * unless the row *is* the game. That is not decoration: a delete whose only
 * filter is a list of ids is one bad id away from reaching another tenant's
 * table, and the ids come from a snapshot that could in principle be of anything.
 */
export interface Where {
  eq: Cells;
  /** One column that must be one of these — the id list a bulk delete is scoped by. */
  anyOf?: { column: string; values: readonly string[] };
}

export type Statement =
  | ({ op: "insert"; table: TableName; rows: readonly Cells[] })
  | ({ op: "update"; table: TableName; patch: Cells; expect?: number } & Where)
  | ({ op: "delete"; table: TableName } & Where);

/** What a runner answers: false means an `expect` was not met and nothing was written. */
export type Applied = boolean;

/** Whether a row satisfies a statement's filters. The in-memory half of `where`. */
export function matches(row: Cells, where: Where): boolean {
  for (const [column, value] of Object.entries(where.eq)) {
    if (row[column] !== value) return false;
  }
  if (where.anyOf && !where.anyOf.values.includes(row[where.anyOf.column] as string)) return false;
  return true;
}
