import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { renameUser, setReady } from "@/lib/game/lobbyStore";

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

  const body = await bodyOf(request, "seat");
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    // Each is its own change, and each writes nothing when it changes nothing:
    // the browser sends the state it wants rather than a toggle, so a second
    // click on a button already down used to bump the revision and wake the
    // whole table for it.
    if (typeof body.ready === "boolean") await setReady(game.id, actor.user.id, body.ready);
    if (typeof body.name === "string") {
      // Refused rather than blanked: a table where two people can both be
      // nameless is a table where `kick` has nobody to aim at.
      await renameUser(game.id, actor.user.id, body.name.trim());
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
