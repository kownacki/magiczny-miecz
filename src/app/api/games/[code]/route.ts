import { NextResponse } from "next/server";
import { findGame, holdingsFor, seatsFor, verifySeat } from "@/lib/game/store";
import { bonusFromHoldings, visibleTo } from "@/lib/engine/holdings";

/**
 * The table view's state.
 *
 * Deliberately carries no claim tokens and no holdings: this is rendered on a
 * screen every player can see, and spells are held concealed under 9.3.
 *
 * A device may pass its own token to be told which seat it owns. That answer
 * comes from the server rather than being worked out in the browser, because
 * the browser is never sent anyone's token — including, in the seat list, its
 * own — so it has nothing to compare against.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  const mine = token ? await verifySeat(game.id, token) : null;

  const seats = await seatsFor(game.id);
  const holdings = await holdingsFor(game.id);

  return NextResponse.json({
    game,
    mySeatIndex: mine?.seat_index ?? null,
    seats: seats.map((seat) => {
      const own = holdings
        .filter((holding) => holding.seat_id === seat.id)
        .map((holding) => ({
          id: holding.id,
          cardId: holding.card_id,
          kind: holding.kind,
          face: holding.face,
        }));

      // Concealment is applied HERE, on the server, and not by hiding things in
      // the browser: a player's spells (9.3) must never be sent to another
      // player's device at all. Totals are still reported in full, because a
      // character's strength is public even when the source of it is not.
      const seen = visibleTo(own, { own: mine?.id === seat.id, mode: game.mode });
      const bonus = bonusFromHoldings(own);

      return {
        ...seat,
        holdings: seen.cards,
        hidden_count: seen.hiddenCount,
        miecz_total: seat.miecz_own + bonus.miecz,
        magia_total: seat.magia_own + bonus.magia,
      };
    }),
  });
}
