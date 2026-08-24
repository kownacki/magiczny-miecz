import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import { adjust, type Adjustable } from "@/lib/game/turnStore";

/**
 * The manual override. Any seated player may correct any seat, not just their
 * own — at a table people notice each other's miscounts, and requiring the
 * owner to fix it would make the affordance useless mid-argument.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actor = await verifySeat(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    await adjust(
      game.id,
      String(body.seatId),
      body.stat as Adjustable,
      Number(body.delta),
      typeof body.reason === "string" ? body.reason : null,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
