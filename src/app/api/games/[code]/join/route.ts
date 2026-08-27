import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { bumpRevision, findGame, joinGame, seatsFor, verifyActor } from "@/lib/game/store";
import { noteArrival, resumeDevice, takeSeat } from "@/lib/game/lobbyStore";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "join");
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

    /**
     * Sitting down in a named seat, and two quite different people do it.
     *
     * Somebody already at the table — a spectator taking a free chair, or a
     * player moving to one that was left empty — has a token, and only moves.
     * Somebody who has *just arrived* and is picking up an abandoned Postać has
     * none, and has to be let in first.
     *
     * The second is the commoner of the two by a long way: it is what the join
     * gate offers under "wolne Postacie", and the way anybody gets back to a
     * table after closing the tab on a device that does not remember them.
     * Requiring a token here turned that into "Nieznane miejsce" — a stranger
     * being told they are not who they never claimed to be.
     */
    if (body.seatId) {
      const seats = await seatsFor(game.id);
      const wanted = seats.find((one) => one.id === body.seatId);
      if (!wanted) return NextResponse.json({ error: "Nie ma takiego miejsca." }, { status: 404 });

      const actor = body.token ? await verifyActor(game.id, String(body.token)) : null;
      if (!actor) {
        const { user, seat, token } = await joinGame(
          game.id,
          name,
          deviceId,
          game.status === "playing",
          wanted.seat_index,
        );
        await announce(game.id, user.name, seat?.id ?? wanted.id);
        return NextResponse.json({ userId: user.id, seatIndex: wanted.seat_index, token });
      }
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
    await announce(game.id, user.name, seat?.id ?? null);
    return NextResponse.json({ userId: user.id, seatIndex: seat?.seat_index ?? null, token });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}

/**
 * Writes the arrival down, and wakes the table either way.
 *
 * `noteArrival` goes through `change`, which bumps the revision as part of
 * committing — so it replaces the `bumpRevision` that used to be the only thing
 * here, rather than being a second write beside it.
 *
 * The join has already happened by the time this runs: `joinGame` is the app's
 * one read-modify-write, because it must insert a row and hand a claim token
 * back. So a failure here must not become a failed join — the person is at the
 * table whatever the journal says. It falls back to the bare revision bump,
 * which is what everybody else's browser is waiting on.
 */
async function announce(gameId: string, name: string, seatId: string | null): Promise<void> {
  try {
    await noteArrival(gameId, name, seatId);
  } catch {
    await bumpRevision(gameId);
  }
}
