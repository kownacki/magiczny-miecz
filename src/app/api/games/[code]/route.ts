import { NextResponse } from "next/server";
import { findGame, seatsFor } from "@/lib/game/store";

/**
 * The table view's state. Deliberately excludes anything secret: no claim
 * tokens, and no holdings, because spells are concealed from the other players
 * (9.3) and this response is rendered on a screen everyone can see.
 */
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });
  return NextResponse.json({ game, seats: await seatsFor(game.id) });
}
