import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { adjust, placeSeat, type Adjustable } from "@/lib/game/turnStore";

/**
 * The manual override. Any seated player may correct any seat, not just their
 * own — at a table people notice each other's miscounts, and requiring the
 * owner to fix it would make the affordance useless mid-argument.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "adjust");
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  try {
    // Position is the other override. It is not a delta like the rest — you do
    // not nudge a figure two fields, you say where it is — so it takes a field
    // id rather than a number.
    if (body.stat === "pole") {
      await placeSeat(
        game.id,
        String(body.seatId),
        String(body.fieldId),
        typeof body.reason === "string" ? body.reason : null,
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
  } catch (error) {
    return refused(error);
  }
}
