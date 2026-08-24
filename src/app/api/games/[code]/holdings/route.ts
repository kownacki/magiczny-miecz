import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import {
  castSpell,
  changeNature,
  drawSpell,
  dropCard,
  healSeat,
  takeCard,
  tradeTrophies,
  turnToStone,
} from "@/lib/game/turnStore";

/**
 * Taking, dropping and trading in cards.
 *
 * Any seated player may act on any seat, as with the stat corrections: at a
 * table people hand each other cards and correct each other's mistakes, and a
 * rule that only the owner may touch their own pile is unusable in the moment
 * somebody else notices.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const actor = await verifySeat(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  try {
    switch (body.action) {
      case "take":
        await takeCard(game.id, String(body.seatId ?? actor.id), String(body.cardId));
        break;
      case "drop":
        await dropCard(game.id, String(body.holdingId));
        break;
      case "cast":
        // Casting is the caster's own act (9.6), but the table screen plays for
        // whoever is sitting there, so the seat is taken from the body like
        // every other action here.
        return NextResponse.json(
          await castSpell(
            game.id,
            String(body.seatId ?? actor.id),
            String(body.holdingId),
            {
              ...(typeof body.targetSeat === "number" ? { seatIndex: body.targetSeat } : {}),
              ...(body.note ? { note: String(body.note) } : {}),
            },
          ),
        );
      case "spell":
        return NextResponse.json({
          spellId: await drawSpell(game.id, String(body.seatId ?? actor.id)),
        });
      case "nature": {
        const nature = body.nature;
        if (nature !== "dobra" && nature !== "zla" && nature !== "chaotyczna") {
          return NextResponse.json({ error: "Nieznana Natura." }, { status: 400 });
        }
        return NextResponse.json(
          await changeNature(game.id, String(body.seatId ?? actor.id), nature),
        );
      }
      case "heal":
        return NextResponse.json({
          zycie: await healSeat(game.id, String(body.seatId ?? actor.id)),
        });
      case "stone":
        await turnToStone(game.id, String(body.seatId ?? actor.id));
        break;
      case "trade":
        return NextResponse.json({
          gained: await tradeTrophies(game.id, String(body.seatId ?? actor.id)),
        });
      default:
        return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
