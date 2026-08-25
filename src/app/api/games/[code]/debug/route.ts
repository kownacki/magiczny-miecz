import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import { abandonFight, grantCard, placeSeat, stageFight } from "@/lib/game/turnStore";

/**
 * Shortcuts for reaching a game state without playing to it.
 *
 * Testing a fight on the Kamienny Most means owning a Magiczny Miecz, crossing
 * the Trzęsawiska on a Magia check and walking two rings — twenty minutes to
 * reach the thing being tested. This hands you the card and puts you on the
 * square.
 *
 * DEVELOPMENT ONLY. Every route beside this one enforces the rules; this one
 * exists to break them, so a deployed build refuses it outright rather than
 * relying on nobody finding the button. Flip the guard if you ever want it on a
 * preview deployment — deliberately, and knowing what it is.
 *
 * What it does is journalled as a manual override, because that is what it is.
 * A card that appeared by fiat should not be indistinguishable from one that
 * was won, and the journal already draws the difference.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Tryb testowy jest wyłączony." }, { status: 403 });
  }

  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actor = await verifySeat(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  // Acting on your own seat unless another is named, which matches every other
  // route here: at a table people fix each other's boards.
  const seatId = String(body.seatId ?? actor.id);

  try {
    switch (body.action) {
      case "grant":
        await grantCard(game.id, seatId, String(body.cardId));
        break;
      case "teleport":
        await placeSeat(game.id, seatId, String(body.fieldId), "tryb testowy");
        break;
      case "fight":
        // Picks a fight with a named Wróg. Reaching one legitimately means
        // walking until the deck hands it over, and there are a hundred and
        // forty-five other cards in it.
        await stageFight(game.id, seatId, String(body.cardId));
        break;
      case "leave-fight":
        // The way out of one. 17.4 ends a fight only when the dice are compared
        // and 19.1 only for a character that can, so a staged fight is a room
        // with no door — which is fine for the fight you meant to look at and
        // not for the four you had to walk through to reach it.
        await abandonFight(game.id);
        break;
      default:
        return NextResponse.json({ error: "Nieznane działanie." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
