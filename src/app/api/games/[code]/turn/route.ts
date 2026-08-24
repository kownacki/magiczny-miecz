import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import { drawCard, finishTurn, moveTo, rollForMove } from "@/lib/game/turnStore";
import type { CardClass } from "@/data/types";

/**
 * Every turn action funnels through here. The seat token is required even
 * though the table screen could act without one: it is what stops a player
 * taking someone else's turn from their own phone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  if (seat.seat_index !== game.active_seat) {
    return NextResponse.json({ error: "To nie twoja tura." }, { status: 409 });
  }

  try {
    switch (body.action) {
      case "roll":
        await rollForMove(game.id, typeof body.value === "number" ? body.value : null);
        break;
      case "move":
        await moveTo(game.id, String(body.fieldId));
        break;
      case "draw":
        await drawCard(game.id, String(body.cardId), body.cardClass as CardClass);
        break;
      case "end":
        await finishTurn(game.id);
        break;
      default:
        return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
