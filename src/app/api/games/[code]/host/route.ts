import { NextResponse } from "next/server";
import { bumpRevision, claimTableScreen, findGame, verifySeat } from "@/lib/game/store";

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
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  const target = typeof body.seatId === "string" ? body.seatId : seat.id;
  try {
    await claimTableScreen(game.id, target, seat);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
  await bumpRevision(game.id);
  return NextResponse.json({ ok: true });
}
