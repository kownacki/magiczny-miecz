import { NextResponse } from "next/server";
import { handle } from "@/app/api/handle";

import { claimTableScreen } from "@/lib/game/lobbyStore";

/**
 * Hands the host role over.
 *
 * With no `seatId` this device takes it — which the store only allows when the
 * current host has walked away. With one, the host is giving it to somebody,
 * which only the host may do.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(request, params, "host", async ({ game, actor, body }) => {
    // The host is a person now, so this names one — which is also how a table
    // ends up hosted by somebody who is only watching, and that is allowed.
    const target = typeof body.userId === "string" ? body.userId : actor.user.id;
    try {
      await claimTableScreen(game.id, target, actor.user.id);
    } catch (error) {
      // Its own catch, and a 403 rather than `refused`'s 400: giving the table
      // away to somebody who may not have it is a refusal about *who you are*,
      // not about the state of the game. Kept as it was rather than folded into
      // the shared handler, which would quietly change the status a client sees.
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  });
}
