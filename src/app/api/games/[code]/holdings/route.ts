import { NextResponse } from "next/server";
import { handle } from "@/app/api/handle";


import type { Slot } from "@/lib/engine/slots";
import { requireFieldId } from "@/lib/engine/board";
import {
  endlessStock,
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
  settleSpell,
  takeCard,
  takeFieldGold,
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
  return handle(request, params, "holdings", async ({ game, actor, body }) => {
  const seat = actor.seat;
  // Watching is not acting: a spectator holds a good token and drives no
  // Postać, which every route below this line is about.
  if (!seat) {
    return NextResponse.json({ error: "Nie prowadzisz żadnej Postaci." }, { status: 403 });
  }
    switch (body.action) {
      case "take":
        await takeCard(game.id, String(body.seatId ?? seat.id), String(body.cardId));
        break;
      case "take-field":
        // From the board rather than from the turn's stack — see
        // `takeFromField`.
        await takeFromField(
          game.id,
          String(body.seatId ?? seat.id),
          String(body.fieldCardId),
        );
        break;
      // 12.1's other half: "zabrać leżące złoto". The amount is the player's —
      // see `takeFieldGold`.
      case "take-gold":
        await takeFieldGold(game.id, String(body.seatId ?? seat.id), Number(body.gold));
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
          String(body.seatId ?? seat.id),
          Array.isArray(body.holdingIds) ? body.holdingIds.map(String) : [],
        );
        break;
      // The three establishment verbs. What each of them costs is read off the
      // board inside these, never taken from the request.
      case "buy":
        await buyGoods(game.id, String(body.seatId ?? seat.id), String(body.cardId));
        break;
      case "sell":
        await sellHolding(game.id, String(body.seatId ?? seat.id), String(body.holdingId));
        break;
      case "heal-paid":
        return NextResponse.json(
          await payHealer(game.id, String(body.seatId ?? seat.id), Number(body.points)),
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
            String(body.seatId ?? seat.id),
            String(body.holdingId),
            {
              ...(typeof body.targetSeat === "number" ? { seatIndex: body.targetSeat } : {}),
              // The Siewca Spustoszenia names a Karta lying on the board, which
              // is a row id rather than a seat — see `applySpell`.
              ...(body.fieldCardId ? { fieldCardId: String(body.fieldCardId) } : {}),
              // And the Obszar itself, for the Zaklęcie thrown at a square.
              ...(body.fieldId ? { fieldId: requireFieldId(String(body.fieldId)) } : {}),
              // The creature standing opposite in the fight on screen, which is
              // a frame rather than a row — see `CastSpell.target`.
              ...(body.foeInFight === true ? { foeInFight: true as const } : {}),
              ...(body.note ? { note: String(body.note) } : {}),
            },
            // The one answer a Zaklęcie asks for: where the Karta it moves is
            // to go. Narrowed here, at the door, like every other field id.
            body.destination
              ? { destination: requireFieldId(String(body.destination)) }
              : {},
          ),
        );
      /**
       * The Zaklęcie left in the air, taking effect.
       *
       * Any seat may send it, which is the point: the window belongs to the
       * table rather than to the caster, and whoever is watching the clock can
       * close it. With nothing waiting it writes nothing.
       */
      case "settle-spell":
        return NextResponse.json({
          settled: await settleSpell(game.id, body.force === true),
        });
      case "spell":
        return NextResponse.json({
          spellId: await drawSpell(game.id, String(body.seatId ?? seat.id)),
        });
      case "wand-spell":
        // The Różdżka Zaklęć refilling a hand back up to its setup size. A
        // separate action rather than a flag on the one above, because the
        // condition is the card's and not 2.6's.
        return NextResponse.json({
          spellId: await drawSpellWithWand(game.id, String(body.seatId ?? seat.id)),
        });
      /**
       * The table's answer to 21.2, turned on for good.
       *
       * Any seated player may, not only the host: it takes nothing away from
       * anybody, cannot be undone into a state worth arguing about, and a
       * table that has just watched a Miecz be refused should not have to find
       * out who opened it.
       */
      case "endless-stock": {
        await endlessStock(game.id, body.on !== false);
        return NextResponse.json({ ok: true });
      }
      case "nature": {
        const nature = body.nature;
        if (nature !== "good" && nature !== "evil" && nature !== "chaotic") {
          return NextResponse.json({ error: "Nieznana Natura." }, { status: 400 });
        }
        return NextResponse.json(
          await changeNature(game.id, String(body.seatId ?? seat.id), nature),
        );
      }
      case "heal":
        return NextResponse.json({
          life: await healSeat(game.id, String(body.seatId ?? seat.id)),
        });
      case "stone":
        await turnToStone(game.id, String(body.seatId ?? seat.id));
        break;
      case "trade":
        return NextResponse.json({
          gained: await tradeTrophies(game.id, String(body.seatId ?? seat.id), {
            // Naming nothing hands in everything, which is what the command
            // means by an absent list — so an empty array is not the same as no
            // array and must not be flattened into one.
            ...(Array.isArray(body.cardIds) ? { cardIds: body.cardIds.map(String) } : {}),
            ...(typeof body.swords === "number" ? { swords: body.swords } : {}),
          }),
        });
      default:
        return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  });
}
