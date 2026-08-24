import { NextResponse } from "next/server";
import { bumpRevision, chooseCharacter, findGame, verifySeat } from "@/lib/game/store";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  // The token is what proves this device owns the seat it is editing; without
  // it any player could assign characters to anyone.
  const actor = await verifySeat(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  // A seated player may choose for another seat, because players added at the
  // table have no device of their own to choose from.
  const target = body.seatId ? String(body.seatId) : actor.id;

  try {
    await chooseCharacter(target, String(body.characterId ?? ""));
    await bumpRevision(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
