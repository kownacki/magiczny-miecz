import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { findGame, verifyActor } from "@/lib/game/store";
import { setEqMode } from "@/lib/game/lobbyStore";
import { endlessStock } from "@/lib/game/turnStore";

/**
 * The table's house rules, moved while it is still a poczekalnia.
 *
 * They were settled in the dialog that opens a table, before anybody else had
 * arrived — so whoever clicked first chose the variant for everybody, and the
 * rest found out by discovering they had a Plecak. The lobby is where a table
 * talks, so it is where these belong.
 *
 * Any seated player may move them, not just the host. Settling house rules is
 * what the room is doing while it waits, and a setting only one person can
 * touch is one nobody discusses — they just ask that person to click it. Where
 * the *rules* forbid a change the commands refuse it, which is the check that
 * matters: `setEqMode` once the game has started, and `setEndlessStock` trying
 * to go back to the finite pile with cards already on the board.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "settings");
  const actor = body.token ? await verifyActor(game.id, String(body.token)) : null;
  if (!actor) return NextResponse.json({ error: "Nieznany gracz." }, { status: 403 });

  try {
    // One at a time, whichever switch was pressed. A body carrying both would
    // let a stale page put back a setting somebody else had just moved.
    if (body.eqMode !== undefined) {
      await setEqMode(game.id, body.eqMode === "classic" ? "classic" : "slots");
    }
    if (body.endlessStock !== undefined) {
      await endlessStock(game.id, body.endlessStock === true);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
