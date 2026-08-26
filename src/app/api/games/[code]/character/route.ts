import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { change } from "@/lib/game/change";
import { chooseCharacter, dealCharacters } from "@/lib/game/commands/character";
import { takeNewCharacter } from "@/lib/game/turnStore";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  // The token is what proves this device owns the seat it is editing; without
  // it any player could assign characters to anyone.
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  const seat = actor.seat;
  // Watching is not acting: a spectator holds a good token and drives no
  // Postać, which every route below this line is about.
  if (!seat) {
    return NextResponse.json({ error: "Nie prowadzisz żadnej Postaci." }, { status: 403 });
  }

  try {
    // The rulebook's default: shuffle the Karty Postaci and deal one to each
    // player. Host-only, because it decides for the whole table at once.
    if (body.deal === true) {
      if (!actor.user.is_host) {
        return NextResponse.json({ error: "Tylko gospodarz rozdaje." }, { status: 403 });
      }
      if (game.status !== "lobby") {
        return NextResponse.json(
          { error: "Postacie rozdaje się przed rozpoczęciem gry." },
          { status: 409 },
        );
      }
      // Everybody without a card, which in the poczekalnia is what 0.1 means.
      // The commit bumps the revision itself, so the devices hear about it
      // without anybody having to remember to say so.
      await change(game.id, dealCharacters, { to: "unchosen" });
      return NextResponse.json({ ok: true });
    }

    // 4.4: a dead character's player takes a new one and starts again. Kept
    // apart from the ordinary choice because it is a different act with
    // different conditions — the seat must be dead, and the character free.
    if (body.again === true) {
      await takeNewCharacter(
        game.id,
        String(body.seatId ?? seat.id),
        String(body.characterId ?? ""),
        seat.id,
      );
      return NextResponse.json({ ok: true });
    }

    // Which seat this may be aimed at is `mayChooseFor`'s, not this file's:
    // your own, or somebody at the table with no device of their own.
    await change(game.id, chooseCharacter, {
      seatId: body.seatId ? String(body.seatId) : seat.id,
      characterId: String(body.characterId ?? ""),
      byId: seat.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
