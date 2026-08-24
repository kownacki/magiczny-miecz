import { NextResponse } from "next/server";
import { createGame, listGames } from "@/lib/game/store";

/** The tables that exist, so a game can be found again without its code. */
export async function GET() {
  try {
    return NextResponse.json({ games: await listGames() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const { game, hostToken } = await createGame(name);
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
