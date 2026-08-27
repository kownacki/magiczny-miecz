import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULTS, STAMPED, type Tables } from "./fakeDb";

/**
 * The fake against the schema it is standing in for.
 *
 * `DEFAULTS` exists because a fake that stores exactly what it is handed is not
 * a database: `createGame` inserts three columns and Postgres hands back
 * fifteen. It is kept by hand, so it can drift — and it did, in the direction
 * nobody thinks to check. It invented `note` and `points` on `holdings`, which
 * are fields the *route* takes and turns into something else, not columns. A
 * fake with a column Postgres has never heard of is this table's own failure,
 * running backwards.
 */

/** The columns each table really has, read off db/schema.sql rather than remembered. */
function columnsOf(table: string): Set<string> {
  const sql = readFileSync("db/schema.sql", "utf8");
  const at = sql.search(new RegExp(`create table[^(]*?\\b${table}\\s*\\(`));
  if (at === -1) throw new Error(`no such table in db/schema.sql: ${table}`);
  let i = sql.indexOf("(", at) + 1;
  let depth = 1;
  const start = i;
  while (depth > 0) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    i++;
  }
  const found = new Set<string>();
  for (const line of sql.slice(start, i - 1).split("\n")) {
    const name = /^([a-z_]+)\s+\S/.exec(line.trim());
    if (name) found.add(name[1]);
  }
  return found;
}

describe("the in-memory database, against the real one", () => {
  it("defaults only columns that exist", () => {
    for (const table of Object.keys(DEFAULTS) as (keyof Tables)[]) {
      const real = columnsOf(table);
      for (const column of Object.keys(DEFAULTS[table])) {
        expect(real, `${table}.${column}`).toContain(column);
      }
    }
  });

  it("stamps only columns that exist", () => {
    for (const table of Object.keys(STAMPED) as (keyof Tables)[]) {
      const real = columnsOf(table);
      for (const column of STAMPED[table]) expect(real, `${table}.${column}`).toContain(column);
    }
  });
});
