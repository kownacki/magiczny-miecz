"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Tells a device the moment the table changes, instead of it asking every two
 * seconds.
 *
 * **Broadcast, not Postgres Changes.** Postgres Changes respects RLS on the
 * table it watches, and this schema has RLS on with no policies at all — the
 * anon key can read nothing, by design (see CLAUDE.md), so a subscription to
 * table changes would deliver silence forever. Broadcast does not read tables,
 * so the secrecy model is untouched: no client ever learns anything from
 * Supabase that a route handler did not decide to tell it.
 *
 * What crosses the wire is a number. `stol:{kod}` carries `{ revision }` and
 * nothing else — not who moved, not what they drew, and above all not anybody's
 * Zaklęcia (9.3). A device that hears a new number asks the server what
 * happened, through the same route handler as always, and is told only what its
 * seat may see.
 *
 * Sent from a trigger on `games.revision` rather than from the route handlers.
 * Every mutation already funnels through `bumpRevision`, so the column is the
 * one place that knows something happened, and a trigger there cannot be
 * forgotten by a new endpoint the way a broadcast call would be.
 *
 * The poll stays as a backstop. If Realtime is down, misconfigured, or blocked
 * by a network that dislikes WebSockets, the table still plays — just at the
 * old speed. That is why this returns quietly rather than throwing when it
 * cannot connect.
 */
let client: SupabaseClient | null = null;

function browserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false },
    // One message every few seconds at a table of six, so the default limiter
    // is generous; this only stops a pathological loop from being amplified.
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

/**
 * Subscribes to a table's revision counter.
 *
 * `onChange` is called with `true` the first time a message actually arrives,
 * which is the caller's cue that Realtime is working here and the poll can slow
 * down. Nothing assumes it will: on this project the messages are accepted by
 * the server and never delivered to a subscriber, so until that is sorted out
 * the subscription is inert and the poll is the whole mechanism. It costs one
 * idle WebSocket to find out, and it means the day it starts working nobody has
 * to remember to change anything.
 *
 * Returns a function that unsubscribes, or a no-op when Realtime is not
 * available — the caller does not have to care which.
 */
export function watchRevision(joinCode: string, onChange: () => void): () => void {
  const supabase = browserClient();
  if (!supabase) return () => {};

  // A private channel, because this project's Realtime has public access
  // turned off — a public broadcast is accepted and then quietly dropped. The
  // policy on `realtime.messages` lets anon *read* topics starting `stol:` and
  // nothing else; only the database ever writes to them.
  const channel = supabase
    .channel(`stol:${joinCode.toUpperCase()}`, { config: { private: true } })
    .on("broadcast", { event: "zmiana" }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
