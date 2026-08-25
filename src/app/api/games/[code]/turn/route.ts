import { NextResponse } from "next/server";
import { findGame, verifySeat } from "@/lib/game/store";
import {
  attackSeat,
  beginFight,
  crossRing,
  fightGuardian,
  payFerry,
  rollGuardianStrength,
  drawCard,
  enterBridge,
  escape,
  fightBeast,
  fightRoll,
  finishTurn,
  moveTo,
  resolveFight,
  rollForMove,
  setFightPlayerTotal,
  resolveBridgeOrdeal,
  resolveDrawnCard,
  resolveFieldOffer,
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
        // `viaBridge` picks the turn-onto-the-Most option apart from the plain
        // walk, which lands on the same field id (11.10).
        await moveTo(game.id, String(body.fieldId), body.viaBridge === true);
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
        // One Wróg, or several at once (17.5) whose Miecze add together.
        await beginFight(
          game.id,
          Array.isArray(body.cardIds)
            ? body.cardIds.map(String)
            : [String(body.cardId)],
        );
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
      case "cross": {
        // The Trzęsawiska are settled by the app from the dice; the Lodowy Las
        // is a fight, so the table reports how it went — and 11.8 lets it draw.
        const outcome =
          body.outcome === "remis" || body.outcome === "nieudana" ? body.outcome : "udana";
        return NextResponse.json(
          await crossRing(game.id, {
            outcome,
            dice: Array.isArray(body.dice) ? body.dice.map(Number) : null,
          }),
        );
      }
      case "bridge": {
        // 11.11 has three outcomes, and the draw is not the same as a loss:
        // it costs no point but still bars next turn's attempt.
        const outcome =
          body.outcome === "remis" || body.outcome === "porazka"
            ? body.outcome
            : "wygrana";
        return NextResponse.json(await enterBridge(game.id, outcome));
      }
      case "guardian":
        // Fight whatever is blocking the way, rather than reporting an outcome.
        await fightGuardian(game.id);
        break;
      case "guardian-strength":
        return NextResponse.json(
          await rollGuardianStrength(
            game.id,
            typeof body.value === "number" ? body.value : null,
          ),
        );
      case "ferry":
        return NextResponse.json(await payFerry(game.id, body.pay === true));
      case "escape":
        // Absent means "you decide" — a simulation never reports an outcome it
        // could have worked out. A companion table sends a boolean.
        await escape(
          game.id,
          typeof body.succeeded === "boolean" ? body.succeeded : null,
        );
        break;
      case "most-pole":
        // The Kamienny Most's own fields: the traps, the game with Death, the
        // dog, and the two creatures that stand in the way (14.5-14.6).
        return NextResponse.json(
          await resolveBridgeOrdeal(game.id, {
            ...(Array.isArray(body.dice) ? { dice: body.dice.map(Number) } : {}),
            ...(Array.isArray(body.itemRolls)
              ? { itemRolls: body.itemRolls.map(Number) }
              : {}),
          }),
        );
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
      case "pole-tabela":
        // The app throws the die and applies the row. What comes back says
        // which face and what it did, because the player did not watch it.
        return NextResponse.json(
          await resolveFieldOffer(
            game.id,
            String(body.offer ?? ""),
            typeof body.value === "number" ? body.value : null,
          ),
        );
      case "karta-efekt":
        // The card's own script, applied by the app for the same reason the
        // field's table is.
        return NextResponse.json(
          await resolveDrawnCard(
            game.id,
            String(body.cardId ?? ""),
            typeof body.value === "number" ? body.value : null,
          ),
        );
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
