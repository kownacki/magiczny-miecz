/** Typed doors onto the tables this game owns, so a write cannot name a column that is not there. */

import { db, type DbHandle } from "@/lib/supabase";
import type { EffectRow } from "./change";
import type { FieldCardRow, GameRow, HoldingRow, SeatRow, UserRow } from "./store";

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
  turn: number;
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
    games: table<GameRow>(on, "games"),
    holdings: table<HoldingRow, Owned>(on, "holdings"),
    fieldCards: table<FieldCardRow, Owned>(on, "field_cards"),
    seatEffects: table<EffectRow, Owned>(on, "seat_effects"),
    moves: table<MoveWrite, Owned>(on, "moves"),
  };
}

/** The default handle's, for the reads and the two writes that are not a change. */
export const { seats, users, games, holdings, fieldCards, seatEffects, moves } = tablesFor(db);
