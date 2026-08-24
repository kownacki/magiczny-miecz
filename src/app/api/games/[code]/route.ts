import { NextResponse } from "next/server";
import { findGame, seatsFor, verifySeat } from "@/lib/game/store";

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

  return NextResponse.json({
    game,
    seats: await seatsFor(game.id),
    mySeatIndex: mine?.seat_index ?? null,
  });
}
