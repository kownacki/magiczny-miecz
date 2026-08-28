/** An in-memory stand-in for the Supabase handle, so a commit can be tested without one. */

interface Row {
  id: string;
  [column: string]: unknown;
}

export interface Tables {
  games: Row[];
  seats: Row[];
  users: Row[];
  holdings: Row[];
  seat_effects: Row[];
  field_cards: Row[];
  moves: Row[];
}

/**
 * Enough PostgREST to commit against.
 *
 * Only the shapes `commit` and `loadSnapshot` actually use: a filtered read, an
 * update that reports how many rows it matched, an insert, and a delete. The
 * point is not to reimplement PostgREST — it is that `.eq("revision", base)`
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
    turn: 0,
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
    nature_changed_turn: null,
    stone_until_turn: null,
    bridge_blocked_until_turn: null,
  },
  users: { is_host: false, ready: false, seat_index: null, device_id: null, left_at: null },
  // `note` and `points` were in here and are not columns — invented from the
  // holdings *route*, which takes them as request fields and turns them into
  // something else. A fake that adds a column Postgres has never heard of is
  // the exact failure this table exists to prevent, running the other way.
  holdings: { face: "open", granted: false, slot: null, ordinal: null, carried_by: null },
  seat_effects: {},
  field_cards: { granted: false },
  moves: { turn: 0, payload: {}, manual: false, seat_id: null, user_id: null, actor_name: null },
};

/** Now, as a timestamp column would be. */
export const STAMPED: Record<keyof Tables, readonly string[]> = {
  games: ["created_at", "last_played_at"],
  seats: ["created_at"],
  users: ["created_at", "seen_at"],
  holdings: ["created_at"],
  seat_effects: ["created_at"],
  field_cards: ["created_at"],
  moves: ["created_at"],
};

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
  };
}
