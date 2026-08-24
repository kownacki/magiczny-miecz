/** The single server-side database handle; nothing else in the app is allowed to reach Supabase. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The Postgres schema this game owns. See the note in `connect()`. */
const SCHEMA = "magiczny_miecz";

let client: SupabaseClient | null = null;

function connect(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — check .env.local",
    );
  }
  client ??= createClient(url, key, {
    auth: { persistSession: false },
    // Fourth tenant of one Postgres instance. The free tier allows two projects
    // and calorie-tracker and biggerfish took both slots, so this game's tables
    // live in their own schema inside biggerfish's project rather than in
    // `public`, alongside finalbid and wheatbid. Every `.from()` resolves here,
    // which is why nothing else in the codebase knows about it. Must match
    // db/schema.sql exactly, and the schema must be listed under Supabase →
    // Settings → API → Exposed schemas or PostgREST refuses every query with
    // PGRST106.
    db: { schema: SCHEMA },
  });
  return client;
}

/**
 * Service-role client, connected on first use so a missing key fails at request
 * time rather than at build time.
 *
 * Server-only, and that is a rule about secrecy rather than tidiness: each
 * player holds spells the others may not see (9.3), RLS is on with zero
 * policies, and this key bypasses all of it. Every read has to pass through a
 * route handler that knows which seat is asking. The key is biggerfish's,
 * because the database is — it grants the other three tenants' tables too, two
 * of which take real payments. Treat a leak here as a leak of all of them.
 */
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const connection = connect();
    const value = Reflect.get(connection, prop);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});
