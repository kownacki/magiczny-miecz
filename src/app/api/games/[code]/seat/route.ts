import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { bumpRevision, findGame, renameSeat, setReady, verifySeat } from "@/lib/game/store";

/**
 * The two things a player may say about themselves: that they are ready, and
 * what to call them.
 *
 * Both are strictly about the caller's own seat — no `seatId` is accepted —
 * because a host who could mark everybody ready has a start button with extra
 * steps, and renaming somebody else is not a feature.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    if (typeof body.ready === "boolean") await setReady(seat.id, body.ready);
    if (typeof body.name === "string") {
      const name = body.name.trim();
      await renameSeat(seat.id, name || null);
    }
    await bumpRevision(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
