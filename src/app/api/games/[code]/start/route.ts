import { NextResponse } from "next/server";
import { refused } from "@/app/api/refused";
import { findGame, verifySeat } from "@/lib/game/store";
import { startGame } from "@/lib/game/turnStore";

/**
 * Starts the game.
 *
 * The host, and only the host. Everybody else has already said what they have
 * to say by marking themselves ready; somebody still has to decide the waiting
 * is over, and deciding that is what the role is for.
 *
 * Checked here and not only in the interface. The button is hidden from
 * everybody else, but a hidden button is a suggestion — and this one ends the
 * poczekalnia for five other people, so it is worth being a rule.
 *
 * It also has to be somebody *at* the table. This took no token at all once,
 * which meant anyone who could read the code off a screen could start somebody
 * else's game from outside the room.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  if (!seat.is_host) {
    return NextResponse.json({ error: "Grę rozpoczyna gospodarz." }, { status: 403 });
  }

  try {
    await startGame(game.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
