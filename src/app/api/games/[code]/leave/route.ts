import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { leaveTable, unseat } from "@/lib/game/lobbyStore";

/**
 * Gives up the seat this device holds.
 *
 * The token is required and identifies the seat being vacated, so a player can
 * only ever leave their own — unlike the stat corrections, which any seated
 * player may apply to anyone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    // Naming somebody else is a kick, which is the host's. Naming nobody is
    // going yourself — and `standing` says whether you are leaving the chair or
    // the table, which are different things now and get different journal
    // lines.
    const target = typeof body.userId === "string" ? body.userId : actor.user.id;
    if (target !== actor.user.id) {
      return NextResponse.json(await leaveTable(game.id, target, true));
    }
    return NextResponse.json(
      body.standing === true
        ? await unseat(game.id, actor.user.id)
        : await leaveTable(game.id, actor.user.id),
    );
  } catch (error) {
    return refused(error);
  }
}
