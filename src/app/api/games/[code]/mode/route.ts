import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { bumpRevision, findGame, verifySeat } from "@/lib/game/store";

/**
 * Switches a table between full simulation and companion mode.
 *
 * Only before play starts. Changing mid-game would mean either inventing a deck
 * whose cards are already on the table, or throwing away one the app has been
 * dealing from — both leave the game state and the players disagreeing.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });

  if (game.status !== "lobby") {
    return NextResponse.json(
      { error: "Tryb można zmienić tylko przed rozpoczęciem gry." },
      { status: 409 },
    );
  }

  const mode = body.mode === "simulation" ? "simulation" : "companion";
  const { error } = await db.from("games").update({ mode }).eq("id", game.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await bumpRevision(game.id);
  return NextResponse.json({ mode });
}
