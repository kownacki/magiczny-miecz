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

      const matches = (row: Row) =>
        filters.every((f) =>
          f.many ? f.many.includes(row[f.column]) : row[f.column] === f.value,
        );

      const builder = {
        select() {
          if (mode === "select") mode = "select";
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
            for (const row of inserted) {
              rows().push({ id: `${name}-${rows().length + ++n}`, ...row } as Row);
            }
            return resolve({ data: null, error: null });
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
