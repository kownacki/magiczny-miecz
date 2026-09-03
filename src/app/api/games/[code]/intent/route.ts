import { NextResponse } from "next/server";
import { handle } from "@/app/api/handle";
import { isIntentKind } from "@/lib/engine/intentText";
import { tellTable } from "@/lib/game/tellTable";

/**
 * „Test (WIEDŹMA) wybiera: Tracisz 1 Sztukę Złota…"
 *
 * The only route in the app that changes nothing. A decision waits three
 * seconds on its own button before it is sent (`channelling.ts`), and this is
 * what the rest of the table is told during them — repeated to every device
 * over Realtime and stored nowhere, because in three seconds it is either a
 * revision or it never happened.
 *
 * **Only the seat whose turn it is may say anything.** Otherwise any seated
 * player could put words in the acting player's mouth, and the watching half of
 * the table has no way to tell the difference — the whole point of routing this
 * through a route handler instead of letting a browser broadcast is that
 * somebody checks. A request from anybody else is not an error, though: it is
 * something a stale tab does after the turn has moved on, and answering 403 to
 * a courtesy would put a red banner on a table where nothing is wrong.
 *
 * An empty `kind` is the cancel. It travels the same way and for the same
 * reason: a watcher who was shown a decision has to be shown it withdrawn at
 * the moment it is withdrawn, not when a clock at their end runs out.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(request, params, "intent", async ({ game, actor, body }) => {
    const seat = actor.seat;
    if (!seat || seat.seat_index !== game.active_seat) {
      return new NextResponse(null, { status: 204 });
    }

    const kind = String(body.kind ?? "");
    const option = body.option;
    // Awaited rather than fired and forgotten: a serverless function that has
    // answered is a function that may stop running, and a message half sent is
    // one the table never hears. `tellTable` swallows its own failures, so this
    // costs a round trip and can never cost the turn.
    await tellTable(
      game.join_code,
      "zamiar",
      isIntentKind(kind)
        ? {
            by: seat.seat_index,
            kind,
            ...(typeof option === "number" ? { option } : {}),
          }
        : null,
    );

    // No revision bump. Nothing has changed — that is the entire point.
    return new NextResponse(null, { status: 204 });
  });
}
