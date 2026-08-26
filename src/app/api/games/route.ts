import { NextResponse } from "next/server";
import { createGame } from "@/lib/game/store";
import { listGames } from "@/lib/game/lobbyStore";
import { COMPANION_PARKED, type GameMode } from "@/lib/game/modes";
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
  // that needs nothing on the table — and while companion mode is parked, so
  // does that. Refused here as well as hidden in the interface: the picker is
  // disabled, but a disabled control is a suggestion.
  const asked: GameMode = body.mode === "companion" ? "companion" : "simulation";
  if (asked === "companion" && COMPANION_PARKED) {
    return NextResponse.json(
      { error: "Tryb „Sędzia przy planszy” jest chwilowo wyłączony." },
      { status: 400 },
    );
  }
  const mode = asked;
  // Klasyczny unless the table asked otherwise: the variant is a house rule and
  // the default has to be the game as printed.
  // Slotowy unless the caller asks for the printed rules.
  const eqMode: EqMode = body.eqMode === "classic" ? "classic" : "slots";
  const { game, hostToken } = await createGame(name, mode, eqMode);
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
