/** What `db/schema.sql` says, read off the file rather than remembered. */

/**
 * The file is applied by hand, so two things can disagree with it: the fake
 * database in `fakeDb.ts` and the real one in Supabase. Both checks read the
 * schema through here, so there is one parser and not two — the second would be
 * written from memory of the first and get a corner of it wrong.
 *
 * Takes the SQL as a string rather than reading the file, so it stays pure and
 * a caller decides where the text comes from: a test reads it off disk, and a
 * script may one day compare a proposed file against the live database.
 *
 * # What it deliberately does not parse
 *
 * Types, defaults and check expressions. A guard that parses SQL loosely
 * produces false alarms, and a check nobody trusts is a check nobody reads.
 * What is here is what has actually drifted or is load-bearing: which tables
 * exist and what their columns are called.
 */

/** The body of one `create table`, or null when the file has no such table. */
function bodyOf(sql: string, table: string): string | null {
  const at = sql.search(new RegExp(`create table[^(]*?\\b${table}\\s*\\(`));
  if (at === -1) return null;
  let i = sql.indexOf("(", at) + 1;
  const start = i;
  let depth = 1;
  while (depth > 0 && i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    i++;
  }
  return sql.slice(start, i - 1);
}

/**
 * The name at the head of a column definition, or null for anything else.
 *
 * A `create table` body holds more than columns — `primary key (a, b)`,
 * `unique (...)`, a bare `check (...)` — and those start with a keyword rather
 * than a name. Excluded by keyword, because the alternative is excluding by
 * shape and every shape here starts with a word.
 */
const NOT_A_COLUMN = new Set([
  "primary",
  "unique",
  "check",
  "foreign",
  "constraint",
  "exclude",
  "like",
]);

function columnName(line: string): string | null {
  const named = /^([a-z_][a-z0-9_]*)\s+\S/.exec(line.trim());
  if (!named) return null;
  return NOT_A_COLUMN.has(named[1]) ? null : named[1];
}

/** Every table the file creates, each with the set of columns it names. */
export function tablesInFile(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const found of sql.matchAll(/create table[^(]*?\b([a-z_][a-z0-9_]*)\s*\(/g)) {
    const table = found[1];
    tables.set(table, columnsOf(sql, table));
  }
  return tables;
}

/** The columns the file gives one table. Empty when it has no such table. */
export function columnsOf(sql: string, table: string): Set<string> {
  const body = bodyOf(sql, table);
  if (body === null) return new Set();
  const found = new Set<string>();
  for (const line of body.split("\n")) {
    const name = columnName(line);
    if (name !== null) found.add(name);
  }
  return found;
}

/**
 * Columns Postgres would fill in by itself: `not null default …`.
 *
 * Read off the same lines rather than listed anywhere, so a column added to the
 * schema is a column the fake database is asked about on the next run.
 */
export function filledInBy(sql: string, table: string): Set<string> {
  const body = bodyOf(sql, table);
  if (body === null) return new Set();
  const found = new Set<string>();
  for (const line of body.split("\n")) {
    const name = columnName(line);
    if (name !== null && /not null/.test(line) && /\bdefault\b/.test(line)) found.add(name);
  }
  return found;
}
