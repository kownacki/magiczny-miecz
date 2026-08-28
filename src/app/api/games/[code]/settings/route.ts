import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { findGame, verifyActor } from "@/lib/game/store";
import { setEqMode, setTrophyMode } from "@/lib/game/lobbyStore";
import { endlessStock } from "@/lib/game/turnStore";

/**
 * The table's house rules, moved while it is still a poczekalnia.
 *
 * They were settled in the dialog that opens a table, before anybody else had
 * arrived — so whoever clicked first chose the variant for everybody, and the
 * rest found out by discovering they had a Plecak. The lobby is where a table
 * talks, so it is where these belong.
 *
 * The host's, and only the host's. These are the table's house rules rather
 * than anybody's preference, and one of them cannot be taken back — a table
 * that has turned the pile endless does not get to be finite again. A room
 * where six people can all reach a one-way switch is a room where it gets
 * pressed by whoever misreads it first.
 *
 * The commands still refuse what the *rules* refuse, which is the other half:
 * `setEqMode` once the game has started, and `setEndlessStock` trying to go
 * back to the finite pile with cards already on the board. This check is about
 * who is asking; those are about whether it can be done at all.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "settings");
  const actor = body.token ? await verifyActor(game.id, String(body.token)) : null;
  if (!actor) return NextResponse.json({ error: "Nieznany gracz." }, { status: 403 });
  if (!actor.user.is_host) {
    return NextResponse.json(
      { error: "Zasady stołu ustala gospodarz." },
      { status: 403 },
    );
  }

  try {
    // One at a time, whichever switch was pressed. A body carrying both would
    // let a stale page put back a setting somebody else had just moved.
    if (body.eqMode !== undefined) {
      await setEqMode(game.id, body.eqMode === "classic" ? "classic" : "slots");
    }
    if (body.endlessStock !== undefined) {
      await endlessStock(game.id, body.endlessStock === true);
    }
    /**
     * How this table keeps a beaten Wróg (1.4). See docs/TROFEA.md.
     *
     * Read the same way `eqMode` is — one of two words or the other one, never
     * whatever arrived. `setTrophyMode` is what refuses it once the game has
     * started; this only decides which of the two was asked for.
     */
    if (body.trophyMode !== undefined) {
      await setTrophyMode(game.id, body.trophyMode === "cards" ? "cards" : "points");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}
