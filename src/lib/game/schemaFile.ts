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

/**
 * `moves.kind`'s closed list, as `db/schema.sql` writes it.
 *
 * Read from the file rather than trusted, for the same reason `tablesInFile`
 * exists: the file is applied by hand, so the only way to know it says what the
 * code says is to read it. Scoped to the `moves` block, because `holdings` has
 * a `kind` check too and its four values would otherwise arrive in the answer.
 *
 * Deliberately narrow. Nothing here parses SQL in general — see the note at the
 * top of `scripts/check-schema.ts` about why check expressions are not compared
 * — and this one is only comparable because it is generated from
 * `JOURNAL_KINDS` rather than written.
 */
export function kindsInFile(sql: string): string[] {
  const at = sql.indexOf("create table if not exists magiczny_miecz.moves");
  if (at === -1) return [];
  const block = sql.slice(at);
  const check = block.indexOf("kind text not null check (kind in (");
  if (check === -1) return [];
  const from = check + "kind text not null check (kind in (".length;
  const to = block.indexOf("))", from);
  if (to === -1) return [];
  return [...block.slice(from, to).matchAll(/'([a-z0-9-]+)'/g)].map((one) => one[1]).sort();
}

/**
 * Every function the file creates.
 *
 * The same reason as `tablesInFile`: applied by hand, so the only way to know
 * the database has one is to look. This half matters more than it reads —
 * `apply_change` is what every write in the game goes through, so a database
 * that never got it does not fail at a corner, it fails at the first move
 * anybody makes.
 */
export function functionsInFile(sql: string): Set<string> {
  const found = new Set<string>();
  for (const one of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+magiczny_miecz\.([a-z_][a-z0-9_]*)\s*\(/g,
  )) {
    found.add(one[1]);
  }
  return found;
}

/**
 * Every trigger the file creates.
 *
 * A different question from `functionsInFile`, and the reason both are asked:
 * `broadcast_revision()` existed, was correct, and was attached to nothing, so
 * the Realtime ping the whole table depends on had never fired. Comparing
 * functions would have called that schema clean.
 */
export function triggersInFile(sql: string): Set<string> {
  const found = new Set<string>();
  for (const one of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?trigger\s+([a-z_][a-z0-9_]*)\b/g,
  )) {
    found.add(one[1]);
  }
  return found;
}
