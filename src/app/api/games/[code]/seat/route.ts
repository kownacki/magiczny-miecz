import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { findGame, verifySeat } from "@/lib/game/store";
import { renameSeat, setReady } from "@/lib/game/lobbyStore";

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
    // Each is its own change, and each writes nothing when it changes nothing:
    // the browser sends the state it wants rather than a toggle, so a second
    // click on a button already down used to bump the revision and wake the
    // whole table for it.
    if (typeof body.ready === "boolean") await setReady(game.id, seat.id, body.ready);
    if (typeof body.name === "string") {
      const name = body.name.trim();
      await renameSeat(game.id, seat.id, name || null);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
