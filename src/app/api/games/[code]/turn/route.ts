import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import {
  attackSeat,
  beginFight,
  drawCard,
  fightBeast,
  fightRoll,
  finishTurn,
  moveTo,
  resolveFight,
  rollForMove,
  setFightPlayerTotal,
} from "@/lib/game/turnStore";
import type { CardClass } from "@/data/types";

/**
 * Every turn action funnels through here.
 *
 * Two devices may act for the current player: the one holding that seat, and —
 * in companion mode — the host's, which is the shared screen sitting in the
 * middle of the table. That is not a hole in the secrecy model: in companion
 * mode every hidden thing is a physical card in somebody's hand, and the app
 * holds nothing worth protecting from the people already sitting there.
 *
 * Simulation mode is excluded, because there the app *does* hold each player's
 * concealed spells (9.3) and one device acting for everyone would expose them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const seat = await verifySeat(game.id, String(body.token ?? ""));
  if (!seat) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  const isActiveSeat = seat.seat_index === game.active_seat;
  const isTableScreen = game.mode === "companion" && seat.is_host;
  if (!isActiveSeat && !isTableScreen) {
    return NextResponse.json({ error: "To nie twoja tura." }, { status: 409 });
  }

  try {
    switch (body.action) {
      case "roll":
        await rollForMove(game.id, typeof body.value === "number" ? body.value : null);
        break;
      case "move":
        await moveTo(game.id, String(body.fieldId));
        break;
      case "draw":
        // A named card means the physical deck decided; nothing named means
        // the app draws one itself.
        await drawCard(
          game.id,
          body.cardId
            ? { cardId: String(body.cardId), cardClass: body.cardClass as CardClass }
            : null,
        );
        break;
      case "fight":
        await beginFight(game.id, String(body.cardId));
        break;
      case "fight-total":
        await setFightPlayerTotal(game.id, Number(body.total));
        break;
      case "fight-roll":
        await fightRoll(
          game.id,
          body.side === "enemy" ? "enemy" : "player",
          typeof body.value === "number" ? body.value : null,
        );
        break;
      case "attack":
        await attackSeat(game.id, String(body.targetSeatId));
        break;
      case "beast":
        await fightBeast(
          game.id,
          typeof body.kindRoll === "number" ? body.kindRoll : null,
          typeof body.strengthRoll === "number" ? body.strengthRoll : null,
          typeof body.playerRoll === "number" ? body.playerRoll : null,
          typeof body.beastRoll === "number" ? body.beastRoll : null,
        );
        break;
      case "fight-done":
        await resolveFight(game.id);
        break;
      case "end":
        await finishTurn(game.id);
        break;
      default:
        return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
