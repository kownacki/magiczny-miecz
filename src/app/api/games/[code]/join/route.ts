import { NextResponse } from "next/server";
import { bumpRevision, findGame, joinGame } from "@/lib/game/store";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

  try {
    const { seat, token } = await joinGame(game.id, name);
    await bumpRevision(game.id);
    return NextResponse.json({ seatIndex: seat.seat_index, token });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
