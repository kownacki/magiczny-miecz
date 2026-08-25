import { NextResponse } from "next/server";
import {
  AWAY_AFTER_MS,
  deleteGame,
  fieldCardsFor,
  findGame,
  holdingsFor,
  markSeen,
  seatsFor,
  sweepLobby,
  verifySeat,
} from "@/lib/game/store";
import { bonusFromHoldings, visibleTo } from "@/lib/engine/holdings";
import { shopStock } from "@/lib/game/turnStore";
import type { Slot } from "@/lib/engine/slots";

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

  // Everybody in the poczekalnia is polling, so this is where a table finds out
  // that somebody closed their tab — and clears their seat, or itself if there
  // is nobody left.
  if (await sweepLobby(game.id, game.status)) {
    return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token");
  const mine = token ? await verifySeat(game.id, token) : null;

  // The poll is the heartbeat. A device asking for the state is a device still
  // at the table, so no separate ping is needed — and a seat that stops asking
  // goes quiet by itself, which is the difference between somebody who left and
  // somebody whose tab was closed.
  if (mine) await markSeen(mine.id);

  const seats = await seatsFor(game.id);
  const holdings = await holdingsFor(game.id);
  // Face up on the board by rule 16.8, so there is nothing to conceal and every
  // seat is sent the same list.
  const fieldCards = await fieldCardsFor(game.id);

  return NextResponse.json({
    game,
    mySeatIndex: mine?.seat_index ?? null,
    fieldCards: fieldCards.map((row) => ({ fieldId: row.field_id, cardId: row.card_id })),
    // What the Wyposażenie pile still holds (21.2), so a shop shows what it has
    // rather than offering what will be refused.
    stock: await shopStock(game.id),
    seats: seats.map((seat) => {
      const own = holdings
        .filter((holding) => holding.seat_id === seat.id)
        .map((holding) => ({
          id: holding.id,
          cardId: holding.card_id,
          kind: holding.kind,
          face: holding.face,
          // Where it is worn, in the slotted variant. Public like the card
          // itself (5.2): what somebody has on is exactly what you look at
          // before deciding whether to attack them.
          slot: (holding.slot ?? null) as Slot | null,
        }));

      // Concealment is applied HERE, on the server, and not by hiding things in
      // the browser: a player's spells (9.3) must never be sent to another
      // player's device at all. Totals are still reported in full, because a
      // character's strength is public even when the source of it is not.
      const seen = visibleTo(own, { own: mine?.id === seat.id, mode: game.mode });
      // In slotowy a card only counts where it is worn, so the totals every
      // device reads are computed from what is on the character, not from the
      // pack. See `inEffect`.
      const bonus = bonusFromHoldings(own, game.eq_mode === "slotowy" ? "slotowy" : "klasyczny");

      const lastSeen = seat.seen_at ? Date.parse(seat.seen_at) : 0;
      return {
        ...seat,
        // Worked out here rather than in the browser so every device agrees on
        // who is present, whatever its own clock says.
        // Only a seat that has been heard from and then went quiet is away. A
        // seat that never checked in has no device behind it by design — the
        // host added it in companion mode — and calling that "nieobecny" made
        // a fresh lobby look like a room everybody had walked out of.
        away:
          seat.abandoned_at === null && lastSeen > 0 && Date.now() - lastSeen > AWAY_AFTER_MS,
        holdings: seen.cards,
        hidden_count: seen.hiddenCount,
        miecz_total: seat.miecz_own + bonus.miecz,
        magia_total: seat.magia_own + bonus.magia,
      };
    }),
  });
}

/**
 * Removes a table for good.
 *
 * See `deleteGame`: unguarded on purpose, because every table here is public
 * and the code is the only lock. The confirmation lives in the interface, where
 * the person doing it can read what it says.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  try {
    await deleteGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
