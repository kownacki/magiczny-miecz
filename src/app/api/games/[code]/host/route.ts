import { NextResponse } from "next/server";
import { bumpRevision, claimTableScreen, findGame, verifySeat } from "@/lib/game/store";

/** Moves the shared-table-screen role to the seat this device holds. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  await claimTableScreen(game.id, seat.id);
  await bumpRevision(game.id);
  return NextResponse.json({ ok: true });
}
