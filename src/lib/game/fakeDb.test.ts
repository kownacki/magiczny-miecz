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

/**
 * Columns Postgres would fill in by itself: `not null default …`.
 *
 * Read off the same lines rather than listed here, so a column added to the
 * schema is a column this test knows about on the next run.
 */
function filledInBy(table: string): Set<string> {
  const sql = readFileSync("db/schema.sql", "utf8");
  const at = sql.search(new RegExp(`create table[^(]*?\\b${table}\\s*\\(`));
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
    if (name && /not null/.test(line) && /\bdefault\b/.test(line)) found.add(name[1]);
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

  /**
   * The other direction, which is the one that bites.
   *
   * `trophy_points` was added to the schema with `not null default 0` and not
   * here, so every seat the terminal minted had `undefined` where a number
   * belonged — and the first thing that divided by it wrote `NaN` into a
   * character's Miecz and reported nothing wrong. Postgres would have filled it
   * in; the fake silently did not, which is the whole failure this file is for.
   */
  it("fills in every column Postgres would have filled in", () => {
    for (const table of Object.keys(DEFAULTS) as (keyof Tables)[]) {
      const known = new Set([...Object.keys(DEFAULTS[table]), ...STAMPED[table]]);
      for (const column of filledInBy(table)) {
        // Identity and foreign keys are the caller's, defaulted or not.
        if (column === "id" || column.endsWith("_id")) continue;
        expect(known, `${table}.${column}`).toContain(column);
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
