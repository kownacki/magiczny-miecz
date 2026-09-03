import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Says something to every device at a table without writing anything down.
 *
 * The one message that is not a fact about the game. A `zamiar` is a decision
 * that has been made and not sent — the three seconds an irreversible button
 * fills before it goes (`channelling.ts`) — and it either becomes a revision or
 * is cancelled and never happened. There is nothing to store, because there is
 * nothing that will still be true in four seconds' time; `liveRevision.ts`
 * carries the reasoning for why this is allowed on a wire that otherwise
 * carries a bare counter.
 *
 * **Its own client, deliberately.** Not the shared server handle, whose
 * importers are counted by a grep spelled out in CLAUDE.md — not repeated here,
 * because a file that quotes that pattern turns up in its own results and
 * becomes the fifth answer it was written to prevent. That rule is about
 * *database*
 * access — where rows are read and written, and how a command is kept from
 * quietly acquiring one — and this is not that: nothing here touches a table,
 * a schema, or PostgREST. Adding a fifth name to that list to send a WebSocket
 * message would make the check answer a question nobody was asking.
 *
 * **Service role, because `anon` cannot write here.** The policy on
 * `realtime.messages` lets the anon key *read* topics beginning `stol:` and
 * nothing else, which is what keeps a browser from putting words in another
 * player's mouth. So the browser asks a route to say this, and the route — the
 * same one that decides everything else a seat is told — says it.
 */
const SCHEMA_FREE = { auth: { persistSession: false } } as const;

let sender: SupabaseClient | null = null;

function speaker(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  sender ??= createClient(url, key, SCHEMA_FREE);
  return sender;
}

/**
 * Broadcasts one ephemeral message, and never throws.
 *
 * A table that cannot reach Realtime plays exactly as it did before this
 * existed: the watching players simply do not get the three seconds' warning.
 * That is a missing courtesy, not a broken turn, and it must never be the
 * reason a decision fails to be sent — which is why the caller is not asked to
 * await this and is not told whether it worked.
 */
export async function tellTable(joinCode: string, event: string, payload: unknown) {
  const supabase = speaker();
  if (!supabase) return;
  try {
    const channel = supabase.channel(`stol:${joinCode.toUpperCase()}`, {
      config: { private: true },
    });
    await new Promise<void>((ready, fail) => {
      const timer = setTimeout(() => fail(new Error("realtime timeout")), 3000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          ready();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          fail(new Error(status));
        }
      });
    });
    await channel.send({ type: "broadcast", event, payload });
    await supabase.removeChannel(channel);
  } catch {
    // Deliberately silent. See above: this is a courtesy, not the turn.
  }
}
