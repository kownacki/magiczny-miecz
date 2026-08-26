import { NextResponse } from "next/server";
import { findGame, verifyActor } from "@/lib/game/store";
import { claimTableScreen } from "@/lib/game/lobbyStore";

/**
 * Hands the host role over.
 *
 * With no `seatId` this device takes it — which the store only allows when the
 * current host has walked away. With one, the host is giving it to somebody,
 * which only the host may do.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  // The host is a person now, so this names one — which is also how a table
  // ends up hosted by somebody who is only watching, and that is allowed.
  const target = typeof body.userId === "string" ? body.userId : actor.user.id;
  try {
    await claimTableScreen(game.id, target, actor.user.id);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
