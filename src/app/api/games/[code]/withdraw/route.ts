import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, seatsFor, verifyActor } from "@/lib/game/store";
import { removeCharacter } from "@/lib/game/turnStore";

/**
 * A Postać withdrawn from the game by the host.
 *
 * The rulebook says nothing whatever about taking a living Postać out — it is a
 * 1993 game where everybody is in one room, and a person who walks away is the
 * table's problem rather than a rule's. So this overrules nothing: it is the
 * only tool that addresses abandonment at all, and the host is the one holding
 * it because somebody has to be.
 *
 * What it will not do is touch a dead one. 4.4 *is* explicit — "jej Kartę
 * odłożyć do pozostałych nie biorących udziału w grze" — so putting that Karta
 * back in the pool is a break rather than a gap, and breaks belong to the test
 * console, where they are journalled as what somebody typed. `removeCharacter`
 * enforces that itself, on the strength of `byId` being present; this route's
 * whole job is to be the caller that supplies one.
 *
 * Which is why it exists. The rule was written with nothing calling it: the
 * console passed null and was the only door, so the host's half was unreachable
 * code that typechecked and could not run.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "withdraw");
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  // Named by seat, because that is what a host is looking at when they decide:
  // a chair with somebody's Postać standing in it and nobody behind it.
  const seats = await seatsFor(game.id);
  const target = seats.find((seat) => seat.id === String(body.seatId ?? ""));
  if (!target) return NextResponse.json({ error: "Nie ma takiego miejsca." }, { status: 404 });

  try {
    const { characterId, returned } = await removeCharacter(
      game.id,
      target.id,
      body.hard === true,
      actor.user.id,
    );
    return NextResponse.json({ characterId, returned });
  } catch (error) {
    return refused(error);
  }
}
