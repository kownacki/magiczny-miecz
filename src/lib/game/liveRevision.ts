"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isIntentKind, type AnnouncedIntent } from "@/lib/engine/intentText";

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
 * Every mutation claims the next revision — `commit` in the same statement that
 * wins it the right to write at all, `bumpRevision` for the one change that is
 * not a Command — so the column is the one place that knows something happened,
 * and a trigger there cannot be forgotten by a new endpoint the way a broadcast
 * call would be.
 *
 * The poll stays as a backstop. If Realtime is down, misconfigured, or blocked
 * by a network that dislikes WebSockets, the table still plays — just at the
 * old speed. That is why this returns quietly rather than throwing when it
 * cannot connect.
 *
 * # The second thing on the wire
 *
 * The topic now carries one more event, `zamiar`, and it is the only exception
 * to "a bare counter and nothing else" — so it is worth saying exactly why it
 * is not the thin end of anything.
 *
 * It is *not state*. A `zamiar` is a decision that has been made and not sent:
 * three seconds of a button filling, which either becomes a revision or is
 * cancelled and never existed. Nothing reads it back, nothing is stored, and no
 * device does anything with it but draw a line of text that is replaced by the
 * truth a moment later.
 *
 * It cannot carry a secret. What travels is a seat index and a verb, plus at
 * most an *index into a list the receiving browser is already drawing* — never
 * a name, never a card, never a sentence composed by the sender. A watcher who
 * cannot already see the options gets no `option` at all, which is why the
 * Zaklęcia an `ask` frame fans out (9.3) announce nothing.
 *
 * And it is still the server talking. `anon` may read topics starting `stol:`
 * and may not write to them; the browser asks a route handler to say this, the
 * same route handler that decides every other thing a seat is told. The rule
 * that matters — no client learns anything from Supabase that a route did not
 * decide to tell it — is untouched.
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

/**
 * Subscribes to what somebody is *about* to do.
 *
 * Same topic and same client as the revision above, because it is the same
 * table and a second WebSocket to say a second thing would be a second thing to
 * go wrong. `onIntent` is called with the message as sent, or with `null` when
 * the decision was cancelled — the sender says which, rather than this end
 * timing it out, so a cancel at 2.9 seconds is off the screen at 2.9 seconds.
 *
 * A `zamiar` that is never followed by anything — the tab that sent it closed
 * mid-window — is cleared by the caller's own clock. Nothing here holds it.
 */
export function watchIntent(
  joinCode: string,
  onIntent: (intent: AnnouncedIntent | null) => void,
): () => void {
  const supabase = browserClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`stol:${joinCode.toUpperCase()}`, { config: { private: true } })
    .on("broadcast", { event: "zamiar" }, (message) => {
      const said = message.payload as { by?: unknown; kind?: unknown; option?: unknown } | null;
      // Off the wire and therefore not to be trusted, even though only the
      // service role can have sent it. Narrowed *here*, all of it — the kind
      // included, which used to be left as a `string` and checked again four
      // layers down where it was turned into words. A kind this build has never
      // heard of is dropped rather than carried: it can only have come from a
      // newer one, and "somebody is deciding something I cannot name" is what
      // the panel already says when it is told nothing at all.
      if (!said || typeof said.by !== "number" || !isIntentKind(said.kind)) {
        onIntent(null);
        return;
      }
      onIntent({
        by: said.by,
        kind: said.kind,
        ...(typeof said.option === "number" ? { option: said.option } : {}),
      });
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
