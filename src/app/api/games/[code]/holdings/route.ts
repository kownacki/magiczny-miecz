import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { findGame, verifySeat } from "@/lib/game/store";
import type { Slot } from "@/lib/engine/slots";
import {
  buyGoods,
  castSpell,
  changeNature,
  drawSpell,
  drawSpellWithWand,
  dropCard,
  equipCard,
  healSeat,
  payHealer,
  reorderPack,
  sellHolding,
  takeCard,
  takeFromField,
  tradeTrophies,
  turnToStone,
  spendHolding,
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
      case "take-field":
        // From the board rather than from the turn's stack — see
        // `takeFromField`.
        await takeFromField(
          game.id,
          String(body.seatId ?? actor.id),
          String(body.fieldCardId),
        );
        break;
      case "drop":
        await dropCard(game.id, String(body.holdingId));
        break;
      // Spending a card by using it, which is not the same as putting it down:
      // 5.5 leaves a discarded Przedmiot lying on the Obszar for whoever comes
      // next, and a drunk Eliksir is gone. Which cards have a use, and what it
      // costs, is `uses.ts`'s to say and never the request's.
      case "use":
        return NextResponse.json(await spendHolding(game.id, String(body.holdingId)));
      // How somebody's own pack is laid out. Not a move and not journalled —
      // 5.4 counts what you carry and has no opinion about the order.
      case "order":
        await reorderPack(
          game.id,
          String(body.seatId ?? actor.id),
          Array.isArray(body.holdingIds) ? body.holdingIds.map(String) : [],
        );
        break;
      // The three establishment verbs. What each of them costs is read off the
      // board inside these, never taken from the request.
      case "buy":
        await buyGoods(game.id, String(body.seatId ?? actor.id), String(body.cardId));
        break;
      case "sell":
        await sellHolding(game.id, String(body.seatId ?? actor.id), String(body.holdingId));
        break;
      case "heal-paid":
        return NextResponse.json(
          await payHealer(game.id, String(body.seatId ?? actor.id), Number(body.points)),
        );
      case "equip":
        // `slot: null` takes it off. The slot itself is validated in
        // `equipCard` against what the card may wear, so anything unrecognised
        // simply fails to fit.
        await equipCard(
          game.id,
          String(body.holdingId),
          body.slot == null ? null : (String(body.slot) as Slot),
        );
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
              // The Siewca Spustoszenia names a Karta lying on the board, which
              // is a row id rather than a seat — see `applySpell`.
              ...(body.fieldCardId ? { fieldCardId: String(body.fieldCardId) } : {}),
              ...(body.note ? { note: String(body.note) } : {}),
            },
          ),
        );
      case "spell":
        return NextResponse.json({
          spellId: await drawSpell(game.id, String(body.seatId ?? actor.id)),
        });
      case "wand-spell":
        // The Różdżka Zaklęć refilling a hand back up to its setup size. A
        // separate action rather than a flag on the one above, because the
        // condition is the card's and not 2.6's.
        return NextResponse.json({
          spellId: await drawSpellWithWand(game.id, String(body.seatId ?? actor.id)),
        });
      case "nature": {
        const nature = body.nature;
        if (nature !== "good" && nature !== "evil" && nature !== "chaotic") {
          return NextResponse.json({ error: "Nieznana Natura." }, { status: 400 });
        }
        return NextResponse.json(
          await changeNature(game.id, String(body.seatId ?? actor.id), nature),
        );
      }
      case "heal":
        return NextResponse.json({
          life: await healSeat(game.id, String(body.seatId ?? actor.id)),
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
    return refused(error);
  }
}
