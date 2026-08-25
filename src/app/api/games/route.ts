import { NextResponse } from "next/server";
import { createGame, listGames, type GameMode } from "@/lib/game/store";
import type { EqMode } from "@/lib/engine/slots";

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
  // Anything but the one other legal value means simulation, which is the mode
  // that needs nothing on the table.
  const mode: GameMode = body.mode === "companion" ? "companion" : "simulation";
  // Klasyczny unless the table asked otherwise: the variant is a house rule and
  // the default has to be the game as printed.
  // Slotowy unless the caller asks for the printed rules.
  const eqMode: EqMode = body.eqMode === "klasyczny" ? "klasyczny" : "slotowy";
  const { game, hostToken } = await createGame(name, mode, eqMode);
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
