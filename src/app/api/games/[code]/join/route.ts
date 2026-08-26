import { NextResponse } from "next/server";
import { bumpRevision, findGame, joinGame, seatsFor, verifyActor } from "@/lib/game/store";
import { resumeDevice, takeSeat } from "@/lib/game/lobbyStore";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;

  try {
    /**
     * "Was I here?" — asked by a browser that has come back holding nothing.
     *
     * A tab closing takes the claim with it on purpose (`seatToken.ts`), so
     * without this the only way back into a table is to join again as a second
     * person, leaving the first one sitting there driving a Postać nobody can
     * reach. The `device_id` in localStorage is what recognises them.
     *
     * Three answers, and the middle one is the reason this is a question rather
     * than something done silently: nobody (join as new), somebody who is
     * *live* in another window (the person chooses), or somebody quiet, who is
     * handed a fresh token and is themselves again.
     */
    if (body.resume) {
      if (!deviceId) return NextResponse.json({ resumed: false, live: false });
      const { user, live, token } = await resumeDevice(game.id, deviceId);
      if (!user) return NextResponse.json({ resumed: false, live });
      return NextResponse.json({
        resumed: true,
        live: false,
        userId: user.id,
        name: user.name,
        seatIndex: user.seat_index,
        token,
      });
    }

    // Sitting down in a seat, which somebody already at the table does without
    // joining it again — a spectator taking a free chair, or a player moving to
    // one that was left empty.
    if (body.seatId) {
      const actor = await verifyActor(game.id, String(body.token ?? ""));
      if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
      const seats = await seatsFor(game.id);
      const wanted = seats.find((one) => one.id === body.seatId);
      if (!wanted) return NextResponse.json({ error: "Nie ma takiego miejsca." }, { status: 404 });
      await takeSeat(game.id, actor.user.id, wanted.seat_index);
      return NextResponse.json({
        userId: actor.user.id,
        seatIndex: wanted.seat_index,
        token: String(body.token),
      });
    }

    // A table already playing takes newcomers too (LOBBY.md). The seat arrives
    // out of play and joins the round once its player has picked a character.
    // A full table takes newcomers too, as spectators — six seats is a limit on
    // Postacie, not on people. `seatIndex` comes back null for them, which is
    // what the client reads to know it is watching.
    const { user, seat, token } = await joinGame(
      game.id,
      name,
      deviceId,
      game.status === "playing",
    );
    await bumpRevision(game.id);
    return NextResponse.json({ userId: user.id, seatIndex: seat?.seat_index ?? null, token });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
