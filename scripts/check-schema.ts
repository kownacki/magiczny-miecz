/** Compares db/schema.sql against the live database, and fails out loud when they disagree. */

/**
 * # Why this exists
 *
 * `db/schema.sql` is applied by hand, and it had already fallen behind the
 * database: `games.turn_state`, `games.deck` and three columns of `seats` were
 * live and unmentioned in the file. Rebuilding from it would have thrown away
 * the state of every turn in progress. The file also granted nothing for a
 * while, which makes a table invisible to PostgREST — a 401 that reads exactly
 * like a missing table, and took an afternoon to recognise.
 *
 * Both were fixed by hand and nothing stopped either happening again.
 *
 * # What it compares, and what it does not
 *
 * Four things, each of them something that has actually gone wrong here or is
 * load-bearing enough to be worth holding still:
 *
 * - **Tables**, in both directions. One in the file and not live is a migration
 *   nobody ran; one live and not in the file is data a rebuild would destroy.
 * - **Column names**, in both directions, for the same two reasons.
 * - **Grants.** A table `anon` cannot select from is invisible rather than
 *   forbidden, and the error does not say so.
 * - **RLS on, with zero policies.** That is the whole security model: every
 *   read goes through a route handler that decides what a seat may see (9.3),
 *   and a policy appearing would quietly make the anon key able to read a
 *   game — including the Zaklęcia other players are holding face down.
 *
 * It does **not** compare types, defaults or check expressions. Parsing those
 * out of SQL loosely produces false alarms, and a guard nobody trusts is a
 * guard nobody reads. The `not null default` axis is already held against the
 * file by `fakeDb.test.ts`, from the other side.
 *
 * # Why a function rather than a query
 *
 * The script reaches the database the way the app does — PostgREST, with the
 * service key — and PostgREST does not expose `pg_catalog`. So the reading is
 * done by `magiczny_miecz.schema_shape()`, which lives in the schema file
 * alongside the tables it describes. It is read-only, `security invoker`, and
 * names this schema and no other: the same Postgres instance also holds
 * finalbid and wheatbid, and this must never look at them.
 *
 * Usage: `npm run schema:check`
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { tablesInFile } from "../src/lib/game/schemaFile";

/** What `schema_shape()` hands back. Mirrored here so a change to one fails the other. */
interface Shape {
  tables: Record<string, string[]>;
  rls_off: string[];
  policies: string[];
  ungranted: string[];
}

/** Wrapped rather than run at the top level: tsx loads this as CJS, where a
 * top-level `await` is a syntax error rather than a slow start. */
async function main(): Promise<never> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "This one talks to the real database — run it as `npm run schema:check`, " +
        "which passes --env-file=.env.local.",
    );
    process.exit(2);
  }

  const db = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "magiczny_miecz" },
  });

  const { data, error } = await db.rpc("schema_shape");
  if (error) {
    console.error(`Could not read the live schema: ${error.message}`);
    if (error.message.includes("schema_shape")) {
      console.error(
        "\nThe function is in db/schema.sql and has to be applied once before this works.",
      );
    }
    process.exit(2);
  }

  const live = data as Shape;
  const file = tablesInFile(readFileSync("db/schema.sql", "utf8"));

  /** Every disagreement, in the order somebody would want to fix them. */
  const drift: string[] = [];

  const named = (names: Iterable<string>) => [...names].sort().join(", ");

  // --- tables ---------------------------------------------------------------
  const liveTables = new Set(Object.keys(live.tables));
  for (const table of file.keys()) {
    if (!liveTables.has(table)) drift.push(`table ${table}: in the file, not in the database`);
  }
  for (const table of liveTables) {
    if (!file.has(table)) {
      drift.push(
        `table ${table}: in the database, not in the file — rebuilding from the file would drop it`,
      );
    }
  }

  // --- columns --------------------------------------------------------------
  for (const [table, columns] of file) {
    const there = live.tables[table];
    if (!there) continue; // Already reported above; one complaint per fault.
    const liveColumns = new Set(there);
    const onlyFile = [...columns].filter((one) => !liveColumns.has(one));
    const onlyLive = [...liveColumns].filter((one) => !columns.has(one));
    if (onlyFile.length > 0) {
      drift.push(`${table}: in the file, not in the database — ${named(onlyFile)}`);
    }
    if (onlyLive.length > 0) {
      drift.push(
        `${table}: in the database, not in the file — ${named(onlyLive)}` +
          " (a rebuild from the file would drop these)",
      );
    }
  }

  // --- the security model ---------------------------------------------------
  if (live.rls_off.length > 0) {
    drift.push(`row level security is OFF on: ${named(live.rls_off)}`);
  }
  if (live.policies.length > 0) {
    drift.push(
      `policies exist, and there should be none: ${named(live.policies)}` +
        " — with a policy the anon key can read a game directly, including" +
        " Zaklęcia held face down (9.3)",
    );
  }
  if (live.ungranted.length > 0) {
    drift.push(
      `not granted to anon/authenticated/service_role: ${named(live.ungranted)}` +
        " — PostgREST answers 401 for these, which reads like a missing table",
    );
  }

  // --- say so ---------------------------------------------------------------
  if (drift.length === 0) {
    const columns = [...file.values()].reduce((sum, one) => sum + one.size, 0);
    console.log(`db/schema.sql matches the database — ${file.size} tables, ${columns} columns.`);
    console.log("RLS on everywhere, no policies, everything granted.");
    process.exit(0);
  }

  console.error(`db/schema.sql and the database disagree, ${drift.length} way${drift.length === 1 ? "" : "s"}:\n`);
  for (const line of drift) console.error(`  - ${line}`);
  console.error(
    "\nNeither side is automatically right. A column live and unmentioned is" +
      "\nusually a migration that was applied without the file being updated;" +
      "\none in the file and not live is usually a migration nobody ran.",
  );
  process.exit(1);
}

void main();
