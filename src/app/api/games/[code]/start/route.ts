import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import { startGame } from "@/lib/game/turnStore";

/**
 * Starts the game.
 *
 * Any player at the table may, not only the host: `startGame` refuses unless
 * everybody holding a character has said they are ready, so by the time this
 * can succeed the table has already agreed unanimously and there is nothing
 * left for a host to decide.
 *
 * It does have to be somebody *at* the table, though. This took no token at
 * all, which meant anyone who could read the code off a screen could start
 * somebody else's game from outside the room.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    await startGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
