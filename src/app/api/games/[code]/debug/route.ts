import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { abandonFight, grantCard, placeSeat, stageFight } from "@/lib/game/turnStore";
import { runCommand } from "@/lib/game/consoleStore";
import { parseCommand, permits } from "@/lib/engine/console";

/**
 * Shortcuts for reaching a game state without playing to it.
 *
 * Testing a fight on the Kamienny Most means owning a Magiczny Miecz, crossing
 * the Trzęsawiska on a Magia check and walking two rings — twenty minutes to
 * reach the thing being tested. This hands you the card and puts you on the
 * square.
 *
 * DEVELOPMENT ONLY. Every route beside this one enforces the rules; this one
 * exists to break them, so a deployed build refuses it outright rather than
 * relying on nobody finding the button. Flip the guard if you ever want it on a
 * preview deployment — deliberately, and knowing what it is.
 *
 * What it does is journalled as a manual override, because that is what it is.
 * A card that appeared by fiat should not be indistinguishable from one that
 * was won, and the journal already draws the difference.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Tryb testowy jest wyłączony." }, { status: 403 });
  }

  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "debug");
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  // Acting on your own seat unless another is named, which matches every other
  // route here: at a table people fix each other's boards.
  const seatId = body.seatId ? String(body.seatId) : (actor.seat?.id ?? null);

  /**
   * Watching is not acting — for everything but the console.
   *
   * A spectator holds a good token and drives no Postać, which is what the
   * three shortcuts below are about. The console is the exception on purpose:
   * `who`, `seat` and `leave` are exactly the words somebody driving nothing
   * reaches for, and it refuses a line that needs a Postać itself, seat by
   * seat, rather than at the door.
   */
  const mustBeSeated = () =>
    NextResponse.json({ error: "Nie prowadzisz żadnej Postaci." }, { status: 403 });

  try {
    switch (body.action) {
      case "console": {
        // One line in, one line back. The grammar is pure and lives in the
        // engine; what it means is `runCommand`, which does everything by
        // calling the functions the game itself calls.
        const parsed = parseCommand(String(body.line ?? ""));
        if ("error" in parsed) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        /**
         * Asked even though the answer here is always yes.
         *
         * This whole route refuses in production and the console only opens in
         * test mode, so nothing that reaches this line is short of the
         * capability. It is asked anyway because the *terminal* asks it, and
         * the one thing that must not happen is the two surfaces growing
         * separate ideas about which words break a rule. One function, both
         * callers, no vote.
         */
        const allowed = permits(parsed.ok, { testmode: true });
        if (!allowed.ok) return NextResponse.json({ error: allowed.why }, { status: 403 });
        const said = await runCommand(game.id, { userId: actor.user.id, seatId }, parsed.ok);
        return NextResponse.json({ said });
      }
      case "grant":
        if (!seatId) return mustBeSeated();
        await grantCard(game.id, seatId, String(body.cardId));
        break;
      case "teleport":
        if (!seatId) return mustBeSeated();
        // The console's `teleport`, from a button: an arrival, so the Obszar
        // is there to be explored (13.1). The position override in
        // `adjust/route.ts` is the correction and stays one.
        await placeSeat(game.id, seatId, String(body.fieldId), null, "konsola");
        break;
      case "fight":
        // Picks a fight with a named Wróg. Reaching one legitimately means
        // walking until the deck hands it over, and there are a hundred and
        // forty-five other cards in it.
        if (!seatId) return mustBeSeated();
        await stageFight(game.id, seatId, String(body.cardId));
        break;
      case "leave-fight":
        // The way out of one. 17.4 ends a fight only when the dice are compared
        // and 19.1 only for a character that can, so a staged fight is a room
        // with no door — which is fine for the fight you meant to look at and
        // not for the four you had to walk through to reach it.
        await abandonFight(game.id);
        break;
      default:
        return NextResponse.json({ error: "Nieznane działanie." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return refused(error);
  }
}
