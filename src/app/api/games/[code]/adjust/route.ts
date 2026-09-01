import { NextResponse } from "next/server";
import { handle } from "@/app/api/handle";

import { adjust, placeSeat, type Adjustable } from "@/lib/game/turnStore";

/**
 * The manual override. Any seated player may correct any seat, not just their
 * own — at a table people notice each other's miscounts, and requiring the
 * owner to fix it would make the affordance useless mid-argument.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(request, params, "adjust", async ({ game, body }) => {
    // Position is the other override. It is not a delta like the rest — you do
    // not nudge a figure two fields, you say where it is — so it takes a field
    // id rather than a number.
    if (body.stat === "pole") {
      await placeSeat(
        game.id,
        String(body.seatId),
        String(body.fieldId),
        typeof body.reason === "string" ? body.reason : null,
        // A correction, not a move: the figure is being put where it already
        // is on the physical board, so the Obszar is not arrived at and draws
        // nothing (13.4). `teleport` is the other reading.
        "korekta",
      );
      return NextResponse.json({ ok: true });
    }
    await adjust(
      game.id,
      String(body.seatId),
      body.stat as Adjustable,
      Number(body.delta),
      typeof body.reason === "string" ? body.reason : null,
    );
    return NextResponse.json({ ok: true });
  });
}
