/** An in-memory stand-in for the Supabase handle, so a commit can be tested without one. */

import { TABLE_NAMES, matches as within, type Statement, type TableName } from "./statements";

interface Row {
  id: string;
  [column: string]: unknown;
}

/**
 * One array per table, keyed off the same list the SQL runner checks against —
 * so a table added to the game is a table both halves of the seam learn about
 * at once, rather than one of them being told later.
 */
export type Tables = Record<TableName, Row[]>;

/**
 * Enough PostgREST to run a game against.
 *
 * Two doors, because the app has two. `from()` is the reads that happen outside
 * a change, plus `createGame` and `joinGame` — the only writes a `Changeset`
 * cannot express, since it can neither invent an id nor hand a token back — and
 * it is the shapes those use and no more: a filtered read, an update that
 * reports how many rows it matched, an insert, a delete. `rpc()` is everything
 * else: one call carrying a whole commit as a list of statements, run all at
 * once or not at all, exactly as `magiczny_miecz.apply_change` runs it.
 *
 * The point is not to reimplement PostgREST — it is that `.eq("revision", base)`
 * matching nothing is the whole of the concurrency story, and that cannot be
 * tested against a fake that always says yes.
 *
 * `onBeforeWrite` is the hook a test uses to be somebody else: it runs between
 * the snapshot being read and the games row being taken, which is precisely the
 * gap a second player writes into.
 */
/**
 * What Postgres would have filled in.
 *
 * `tables.ts` says out loud that most columns have defaults and that a row type
 * cannot see them — "requiring every column would mean writing out the whole of
 * db/schema.sql at every insert". True, and it means a fake that stores exactly
 * what it was handed is *not* a database: `createGame` inserts a game with three
 * columns and Postgres returns a row with fifteen, so an in-memory table came
 * back with no status, no revision, and no Życie on any seat.
 *
 * Kept beside db/schema.sql by hand, like the row types above it. A default that
 * drifts shows up as a game that behaves differently offline, which is the one
 * thing the store port exists to prevent.
 */
export const DEFAULTS: Record<keyof Tables, Record<string, unknown>> = {
  games: {
    mode: "simulation",
    eq_mode: "classic",
    trophy_mode: "points",
    // 21.2 as this table plays it. Found missing by fakeDb.test.ts, not by a bug.
    endless_stock: true,
    die_source: "app",
    status: "lobby",
    round: 0,
    turn_state: { phase: "roll" },
    revision: 0,
    characters_out: [],
    journal_seq: 0,
    active_seat: null,
    deck: null,
  },
  seats: {
    sword_own: 0,
    magic_own: 0,
    sword_floor: 0,
    magic_floor: 0,
    life: 4,
    gold: 1,
    trophy_points: 0,
    trophy_beaten: [],
    turns_lost: 0,
    eliminated: false,
    character_id: null,
    field_id: null,
    nature: null,
    nature_changed_round: null,
    stone_until_round: null,
    bridge_blocked_until_round: null,
  },
  users: { is_host: false, ready: false, seat_index: null, device_id: null, left_at: null },
  // `note` and `points` were in here and are not columns — invented from the
  // holdings *route*, which takes them as request fields and turns them into
  // something else. A fake that adds a column Postgres has never heard of is
  // the exact failure this table exists to prevent, running the other way.
  holdings: { face: "open", granted: false, slot: null, ordinal: null, carried_by: null },
  seat_effects: {},
  field_cards: { granted: false },
  field_gold: { gold: 0 },
  moves: { round: 0, payload: {}, manual: false, seat_id: null, user_id: null, actor_name: null },
};

/** Now, as a timestamp column would be. */
export const STAMPED: Record<keyof Tables, readonly string[]> = {
  games: ["created_at", "last_played_at"],
  seats: ["created_at"],
  users: ["created_at", "seen_at"],
  holdings: ["created_at"],
  seat_effects: ["created_at"],
  field_cards: ["created_at"],
  field_gold: ["created_at"],
  moves: ["created_at"],
};

/** What a refused write looks like coming back: PostgREST's shape, and Postgres's codes. */
type DbError = { message: string; code?: string };

/**
 * Postgres would never see a key whose value is `undefined`.
 *
 * The statements go over the wire as JSON, and `JSON.stringify` drops those
 * keys — so an omitted optional lands as "leave the column alone" there. A fake
 * that assigned `undefined` instead would wipe the column, and the two halves of
 * the seam would disagree about the one case nobody writes a test for.
 */
function named(cells: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(cells).filter(([, value]) => value !== undefined));
}

/**
 * The statement list, run against one set of tables.
 *
 * Answers null when all of it landed, `"stale"` when an `expect` was not met,
 * and an error when the database would have refused one — and the caller only
 * ever hands it a *copy*, so any of the last two leaves the game untouched. That
 * copy is the whole of the transaction: `apply_change` gets one from Postgres,
 * and this gets one from `structuredClone`.
 */
function runAll(tables: Tables, statements: readonly Statement[]): "stale" | DbError | null {
  for (const statement of statements) {
    const name = statement.table;
    const rows = tables[name];

    if (statement.op === "insert") {
      /**
       * `moves` has a unique constraint on (game_id, seq), and it is the only
       * one in the schema that a race can trip. Without it here the fake accepts
       * two lines numbered the same and the collision that reached a player at
       * the table cannot be written down as a test.
       *
       * 23505 is a unique violation, because a fake that invents its own codes
       * is a fake the real error handling has never been run against.
       */
      if (name === "moves") {
        const clash = statement.rows.find((row) =>
          rows.some((was) => was.game_id === row.game_id && was.seq === row.seq),
        );
        if (clash) {
          return {
            code: "23505",
            message: 'duplicate key value violates unique constraint "moves_game_id_seq_key"',
          };
        }
      }
      let n = 0;
      const now = new Date().toISOString();
      const stamps = Object.fromEntries(STAMPED[name].map((column) => [column, now]));
      for (const row of statement.rows) {
        // Defaults first, so anything the caller named wins — which is what
        // `default` means.
        rows.push({
          id: `${name}-${rows.length + ++n}`,
          ...DEFAULTS[name],
          ...stamps,
          ...named(row),
        } as Row);
      }
      continue;
    }

    if (statement.op === "update") {
      const hit = rows.filter((row) => within(row, statement));
      for (const row of hit) Object.assign(row, named(statement.patch));
      /**
       * The compare-and-swap, enforced and not decided.
       *
       * `commit` is the only place that knows the games row must match exactly
       * one; all this does is count. That is what keeps one CAS in the codebase
       * rather than one here and another in SQL.
       */
      if (statement.expect !== undefined && hit.length !== statement.expect) return "stale";
      continue;
    }

    tables[name] = rows.filter((row) => !within(row, statement));
  }
  return null;
}

export function fakeDb(tables: Tables, onBeforeWrite?: () => void) {
  // Called before every write, not once: whether the interloper strikes a
  // single time or keeps striking is the test's business, not the fake's.
  const fire = () => onBeforeWrite?.();

  return {
    from(name: keyof Tables) {
      const rows = () => tables[name];
      const filters: { column: string; value: unknown; many?: unknown[] }[] = [];
      let mode: "select" | "update" | "insert" | "delete" = "select";
      let patch: Record<string, unknown> = {};
      let inserted: Record<string, unknown>[] = [];
      let sortBy: { column: string; ascending: boolean } | null = null;
      let cap: number | null = null;
      let one = false;
      // PostgREST hands an insert back only when it was asked to. `createGame`
      // is the caller that asks — `.insert(...).select(...).single()` — and it
      // needs the row it just made, because that is where the id comes from.
      let returning = false;

      const matches = (row: Row) =>
        filters.every((f) =>
          f.many ? f.many.includes(row[f.column]) : row[f.column] === f.value,
        );

      const builder = {
        select() {
          returning = true;
          return builder;
        },
        update(next: Record<string, unknown>) {
          mode = "update";
          patch = next;
          return builder;
        },
        insert(next: Record<string, unknown> | Record<string, unknown>[]) {
          mode = "insert";
          inserted = Array.isArray(next) ? next : [next];
          return builder;
        },
        delete() {
          mode = "delete";
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return builder;
        },
        in(column: string, many: unknown[]) {
          filters.push({ column, value: undefined, many });
          return builder;
        },
        order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
          sortBy = { column, ascending: options?.ascending ?? true };
          return builder;
        },
        limit(n: number) {
          cap = n;
          return builder;
        },
        single() {
          one = true;
          return builder;
        },
        then<T>(resolve: (value: { data: unknown; error: { message: string; code?: string } | null }) => T) {
          if (mode !== "select") fire();

          if (mode === "update") {
            const hit = rows().filter(matches);
            for (const row of hit) Object.assign(row, patch);
            return resolve({ data: hit.map((r) => ({ ...r })), error: null });
          }
          if (mode === "insert") {
            /**
             * `moves` has a unique constraint on (game_id, seq), and it is the
             * only one in the schema that a race can trip. Without it here the
             * fake accepts two lines numbered the same and the collision that
             * reached a player at the table cannot be written down as a test.
             *
             * The real code reads `error.code`, so the fake has to speak
             * Postgres: 23505 is a unique violation.
             */
            if (name === "moves") {
              const clash = inserted.find((row) =>
                rows().some((was) => was.game_id === row.game_id && was.seq === row.seq),
              );
              if (clash) {
                return resolve({
                  data: null,
                  error: {
                    code: "23505",
                    message:
                      'duplicate key value violates unique constraint "moves_game_id_seq_key"',
                  },
                });
              }
            }
            let n = 0;
            const made: Row[] = [];
            const now = new Date().toISOString();
            const stamps = Object.fromEntries(STAMPED[name].map((column) => [column, now]));
            for (const row of inserted) {
              // Defaults first, so anything the caller named wins — which is
              // what `default` means.
              const stored = {
                id: `${name}-${rows().length + ++n}`,
                ...DEFAULTS[name],
                ...stamps,
                ...row,
              } as Row;
              rows().push(stored);
              made.push(stored);
            }
            if (!returning) return resolve({ data: null, error: null });
            return resolve({
              data: one ? ({ ...made[0] } as unknown) : made.map((r) => ({ ...r })),
              error: null,
            });
          }
          if (mode === "delete") {
            tables[name] = rows().filter((row) => !matches(row));
            return resolve({ data: null, error: null });
          }

          let found = rows().filter(matches);
          if (sortBy) {
            const { column, ascending } = sortBy;
            found = [...found].sort((a, b) =>
              ascending
                ? Number(a[column]) - Number(b[column])
                : Number(b[column]) - Number(a[column]),
            );
          }
          if (cap !== null) found = found.slice(0, cap);
          return resolve({
            data: one ? ({ ...found[0] } as unknown) : found.map((r) => ({ ...r })),
            error: null,
          });
        },
      };
      return builder;
    },
    /**
     * The one call a commit makes, and the reason this file is not only a test
     * fixture any more.
     *
     * `commit` folds a changeset into a list of statements and hands the list to
     * whatever is holding the game. Postgres runs it inside one transaction;
     * this runs it against a copy and swaps the copy in only if all of it
     * worked. The two agree because they are handed the same list — the decision
     * that produced it was made once, in TypeScript, which is what "every
     * implementation is `storeOver(handle)`" is protecting.
     *
     * The copy is deep, because a patch that lands and is then undone must leave
     * no trace: the rows are the game.
     */
    rpc(name: string, args: { statements: readonly Statement[] }) {
      return {
        then<T>(resolve: (value: { data: unknown; error: DbError | null }) => T) {
          if (name !== "apply_change") {
            return resolve({ data: null, error: { message: `fakeDb: no function ${name}` } });
          }
          // Before the copy is taken, not after: an interloper writing "in the
          // gap between our read and our write" has to land on the tables this
          // change is about to be measured against, or the compare-and-swap it
          // is meant to lose would never see it.
          fire();
          const copy = structuredClone(tables);
          const failed = runAll(copy, args.statements);
          if (failed === "stale") return resolve({ data: false, error: null });
          if (failed) return resolve({ data: null, error: failed });
          // Column by column rather than by replacing `tables`: the object is
          // the game, and `saves.ts` and `mm` are holding it.
          for (const table of TABLE_NAMES) tables[table] = copy[table];
          return resolve({ data: true, error: null });
        },
      };
    },
  };
}
