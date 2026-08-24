import { NextResponse } from "next/server";
import { bumpRevision, findGame, leaveGame, verifySeat } from "@/lib/game/store";

/**
 * Gives up the seat this device holds.
 *
 * The token is required and identifies the seat being vacated, so a player can
 * only ever leave their own — unlike the stat corrections, which any seated
 * player may apply to anyone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    const result = await leaveGame(game.id, seat, game.status, game.active_seat);
    await bumpRevision(game.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
