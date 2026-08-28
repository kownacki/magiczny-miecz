import { NextResponse } from "next/server";
import { createGame, seatsFor } from "@/lib/game/store";
import { listGames, openTable } from "@/lib/game/lobbyStore";
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
  // 21.2's finite pile unless the table asks for it: the rule is right about a
  // Magiczny Miecz and odd about a Hełm, and this app opens tables that say so.
  // The two relics stay scarce either way — see `RELICS`.
  const endlessStock: boolean = body.endlessStock !== false;
  // Which browser opened the table, so that closing the tab is not the end of
  // being its host. See `createGame`.
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
  const { game, hostToken } = await createGame(
    name,
    mode,
    eqMode,
    deviceId,
    undefined,
    endlessStock,
  );
  /**
   * The table says so in its own Dziennik, before anybody has done anything.
   *
   * After `createGame` and off the response path, exactly as the join route
   * does it: the table is already made by the time this runs, and a journal
   * that failed to write must not turn a made table into an error. The seat is
   * looked up rather than returned, because `createGame` inserts it without
   * selecting it back and this is the only caller that wants it.
   */
  try {
    const seats = await seatsFor(game.id);
    await openTable(game.id, name ?? "Gospodarz", seats[0]?.id ?? null);
  } catch {
    // A table with a silent first line is still a table.
  }
  return NextResponse.json({ joinCode: game.join_code, token: hostToken });
}
