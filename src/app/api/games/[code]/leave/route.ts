import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { bumpRevision, findGame, leaveGame, removeSeat, verifySeat } from "@/lib/game/store";

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
    // A seatId means "remove that one" — the lobby's tidy-up, available to
    // anyone already at the table. Without it, you are giving up your own.
    if (body.seatId && body.seatId !== seat.id) {
      await removeSeat(game.id, String(body.seatId), game.status, seat);
      await bumpRevision(game.id);
      return NextResponse.json({ removed: true, passedTo: null, gameFinished: false });
    }
    const result = await leaveGame(game.id, seat, game.status, game.active_seat);
    await bumpRevision(game.id);
    return NextResponse.json(result);
  } catch (error) {
    return refused(error);
  }
}
