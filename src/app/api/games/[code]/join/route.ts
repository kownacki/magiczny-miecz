import { NextResponse } from "next/server";
import { bumpRevision, claimSeat, findGame, joinGame, seatsFor } from "@/lib/game/store";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

  try {
    // Taking over a seat somebody walked away from, rather than opening a new
    // one. This is also how a player comes back after closing the tab, which is
    // the commonest way a seat ends up empty.
    if (body.seatId) {
      const token = await claimSeat(game.id, String(body.seatId));
      await bumpRevision(game.id);
      const seats = await seatsFor(game.id);
      const claimed = seats.find((s) => s.id === body.seatId);
      return NextResponse.json({ seatIndex: claimed?.seat_index ?? null, token });
    }

    const { seat, token } = await joinGame(game.id, name, body.local === true);
    await bumpRevision(game.id);
    return NextResponse.json({ seatIndex: seat.seat_index, token });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
