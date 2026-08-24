import { NextResponse } from "next/server";
import { bumpRevision, chooseCharacter, findGame, verifySeat } from "@/lib/game/store";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  // The token is what proves this device owns the seat it is editing; without
  // it any player could assign characters to anyone.
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    await chooseCharacter(seat.id, String(body.characterId ?? ""));
    await bumpRevision(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
