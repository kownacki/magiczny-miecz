/** Typed doors onto the tables this game owns, so a write cannot name a column that is not there. */

import { db, type DbHandle } from "@/lib/supabase";
import type { EffectRow } from "./change";
import type { Statement, TableName } from "./statements";
import type { FieldCardRow, FieldGoldRow, GameRow, HoldingRow, SeatRow, UserRow } from "./store";

/**
 * Why this exists at all.
 *
 * `db` is a `SupabaseClient` with its schema generic left at the default, so
 * `.from("seats").insert({ ... })` takes anything: an object with a column that
 * was dropped last week typechecks, builds, deploys, and fails at the database
 * on the first request that runs it.
 *
 * That is not hypothetical. Splitting `seats` into seats and users moved eight
 * columns, and `tsc` was clean the whole way while five writes still named the
 * old ones. Three of them were on the first thing anybody does with the app —
 * `createGame` was still writing `seats.claim_token`, so opening a table failed
 * outright, and nothing found it but running it.
 *
 * This project's first non-negotiable is that an id is never a `string`, and the
 * compiler checks every name written against a literal union. That discipline
 * held all the way to the database and then stopped. This is the last few feet
 * of it.
 *
 * # What it does and does not catch
 *
 * TypeScript checks for excess properties on an object *literal* assigned to a
 * typed parameter, which is exactly the shape a write takes here — so a column
 * that no longer exists is an error at the call site. What it cannot see is a
 * literal built by spreading a variable, because a spread suppresses that
 * check. Those are the writes worth reading twice; there are three of them and
 * they are marked.
 *
 * Deliberately not generated from the database. A generated `Database` type
 * would also narrow every `.select()` against its column-list string, which
 * these queries pass as constants (`SEAT_COLUMNS`) and then cast — so it would
 * trade one silent gap for a hundred loud ones, and the row types below are
 * already hand-kept against db/schema.sql. This adds the check where the bug
 * was rather than everywhere it could conceivably be.
 */

/**
 * What a write may name: the row's own columns, all optional, and nothing else.
 *
 * Optional because most of these columns have defaults — `life integer not null
 * default 4`, `gold default 1`, a dozen more — and a row type cannot see them.
 * Requiring every column would mean writing out the whole of db/schema.sql at
 * every insert to satisfy a compiler that had guessed the rule backwards.
 *
 * Which half is being checked is worth being clear about. This catches a column
 * that is **named and should not be** — the dropped-column case, the one that
 * cost five bugs and stayed invisible through a green build. It does not catch
 * a column left out, and does not need to: Postgres refuses a missing not-null
 * on the spot and says which one, where a name it has never heard of used to
 * fail somewhere further in, on somebody else's request.
 */
type Write<Row> = Partial<Row>;

/**
 * A table, with a door the right shape.
 *
 * The name is still a string on the way through, because PostgREST wants one —
 * but it is written once, here, beside the type it belongs to, rather than at
 * eighteen call sites that each had to remember it.
 */
function table<Row, Extra = Record<never, never>>(on: DbHandle, name: string) {
  // The casts on the way out are the point rather than a hole in it. `db` takes
  // anything, and that is what these signatures exist to stop — so the check
  // happens here, at the door, and what goes through it has already been
  // checked. Handing an untyped client a value it will accept is not smuggling
  // when the shape was proved one line earlier.
  return {
    insert: (rows: (Write<Row> & Extra) | (Write<Row> & Extra)[]) =>
      on.from(name).insert(rows as never),
    update: (patch: Write<Omit<Row, "id">> & Partial<Extra>) =>
      on.from(name).update(patch as never),
    /** For the reads, which are narrowed by their own column lists and cast. */
    from: () => on.from(name),
  };
}

/**
 * The same table, for a write that is a value.
 *
 * A commit no longer issues its writes — it folds them into a list of
 * `Statement`s and hands the list to whatever is holding the game, so that all
 * of it lands or none of it does (see `statements.ts`). That moved every write
 * in `commit` out of the builders above and into object literals, which is
 * exactly where the check this file exists for would have been lost: a
 * `Statement`'s `patch` is a `Record<string, unknown>` and would have taken a
 * column dropped last week without a word.
 *
 * So the door is the same door, one step earlier. The types are the ones above,
 * the check is the same excess-property check on the same object literals, and
 * what comes out the far side is data rather than a call. No handle, because a
 * value does not need one — which is also what lets `commit` build its whole
 * list before anything has touched a database.
 */
function door<Row, Extra = Record<never, never>>(name: TableName) {
  return {
    insert: (rows: (Write<Row> & Extra) | (Write<Row> & Extra)[]): Statement => ({
      op: "insert",
      table: name,
      rows: (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[],
    }),
    /**
     * `expect` is the compare-and-swap's, and only the `games` row uses it: the
     * update names the revision the snapshot read and claims it must match one
     * row. A runner that matches a different number writes nothing at all.
     */
    update: (
      where: Write<Row> & Partial<Extra>,
      patch: Write<Omit<Row, "id">> & Partial<Extra>,
      expect?: number,
    ): Statement => ({
      op: "update",
      table: name,
      eq: where as Record<string, unknown>,
      patch: patch as Record<string, unknown>,
      ...(expect === undefined ? {} : { expect }),
    }),
    /**
     * `anyOf` is spelled separately from `where` because it is the only filter
     * here that is not equality, and because every caller uses it the same way:
     * a list of ids, narrowed by the `game_id` beside it.
     */
    remove: (
      where: Write<Row> & Partial<Extra>,
      anyOf?: { column: keyof Row & string; values: readonly string[] },
    ): Statement => ({
      op: "delete",
      table: name,
      eq: where as Record<string, unknown>,
      ...(anyOf ? { anyOf } : {}),
    }),
  };
}

/**
 * The write-only columns, which no `Row` carries.
 *
 * `claim_token` is the secret that proves a device is a person, and it is left
 * out of `UserRow` on purpose: a row is a thing that gets sent to browsers, and
 * this is what must never travel with one. It still has to be *writable* —
 * rotating it is how somebody is put out of a seat — so it is named here rather
 * than smuggled through as a cast.
 */
interface UserSecrets {
  claim_token: string;
  /** Which table the row belongs to. Not on the row, because a row knows. */
  game_id: string;
}

interface Owned {
  game_id: string;
}

/**
 * The games row's write-only columns.
 *
 * Written by every change and read by nothing that builds a `GameRow`, which is
 * why neither is in `GAME_COLUMNS`: `last_played_at` is what the lobby's own
 * list sorts by, and `started_at` is there for whoever opens this table in
 * Postgres one day. `columns.test.ts` says so from the other side. Named here
 * for the same reason `claim_token` is — writable, unreadable, and not smuggled
 * through as a cast.
 */
interface GameStamps {
  last_played_at: string;
  started_at: string;
}

/**
 * One line of the journal, as it is written.
 *
 * Not a `Row` from anywhere, because nothing reads a move back through these
 * types — `journalRows` selects its own columns and `journalText` takes the
 * shape it wants. This is the write side only, which is the side that broke.
 *
 * `actor_name` is a copy of a name rather than a reference to one, and that is
 * load-bearing: a journal is what you open when the table disagrees, so it may
 * not change its mind when somebody is renamed or a chair changes hands.
 */
interface MoveWrite {
  seq: number;
  seat_id: string | null;
  user_id: string | null;
  actor_name: string | null;
  round: number;
  kind: string;
  payload: Record<string, unknown>;
  manual: boolean;
}

/**
 * Every typed door, onto one handle.
 *
 * A factory rather than seven constants because the write path is being handed
 * its database instead of importing it — see `gameStore.ts`. Nothing here
 * touches the handle while building, so the lazy connection in `supabase.ts`
 * stays lazy.
 */
export function tablesFor(on: DbHandle) {
  return {
    seats: table<SeatRow, Owned>(on, "seats"),
    users: table<UserRow, UserSecrets>(on, "users"),
    games: table<GameRow, GameStamps>(on, "games"),
    holdings: table<HoldingRow, Owned>(on, "holdings"),
    fieldCards: table<FieldCardRow, Owned>(on, "field_cards"),
    fieldGold: table<FieldGoldRow, Owned>(on, "field_gold"),
    seatEffects: table<EffectRow, Owned>(on, "seat_effects"),
    moves: table<MoveWrite, Owned>(on, "moves"),
  };
}

/** The default handle's, for the reads and the two writes that are not a change. */
export const { seats, users, games, holdings, fieldCards, fieldGold, seatEffects, moves } =
  tablesFor(db);

/**
 * Every typed door again, for the writes a commit turns into statements.
 *
 * A constant rather than a factory, because a statement is a value and there is
 * no handle to hand it. The two sets name the same eight tables with the same
 * eight row types, which is the point: `createGame` and `joinGame` still call
 * PostgREST directly — a changeset can neither invent an id nor hand a token
 * back — and everything else goes through here.
 */
export const writeTo = {
  seats: door<SeatRow, Owned>("seats"),
  users: door<UserRow, UserSecrets>("users"),
  games: door<GameRow, GameStamps>("games"),
  holdings: door<HoldingRow, Owned>("holdings"),
  fieldCards: door<FieldCardRow, Owned>("field_cards"),
  fieldGold: door<FieldGoldRow, Owned>("field_gold"),
  seatEffects: door<EffectRow, Owned>("seat_effects"),
  moves: door<MoveWrite, Owned>("moves"),
};
