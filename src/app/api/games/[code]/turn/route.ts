import { NextResponse } from "next/server";
import { bodyOf } from "@/lib/game/requests";
import { refused } from "@/app/api/refused";
import { findGame, verifyActor } from "@/lib/game/store";
import { mayAct } from "@/lib/game/permission";
import {
  attackSeat,
  sendRaider,
  payFriend,
  speakCarriedSpell,
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
  claimSpellFloor,
  releaseSpellFloor,
} from "@/lib/game/turnStore";
import type { CardClass } from "@/data/types";
import type { Decisions } from "@/lib/game/turnStore";
import { asFieldId } from "@/lib/engine/board";

/**
 * What the player decided, taken off the request.
 *
 * Only numbers and a field id — never an effect. The server re-walks the card
 * it owns and takes the branch these point at, so a card cannot be talked into
 * doing something it does not say.
 */
function decisionsFrom(body: Record<string, unknown>): Decisions {
  const choices = Array.isArray(body.choices)
    ? body.choices.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
    : undefined;
  const destination = asFieldId(typeof body.destination === "string" ? body.destination : null);
  return {
    ...(choices?.length ? { choices } : {}),
    ...(destination ? { destination } : {}),
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await findGame(code.toUpperCase());
  if (!game) return NextResponse.json({ error: "Nie ma takiego stołu." }, { status: 404 });

  const body = await bodyOf(request, "turn");
  const actor = await verifyActor(game.id, String(body.token ?? ""));
  if (!actor) return NextResponse.json({ error: "Nieznane miejsce." }, { status: 403 });
  // Watching is not acting. A spectator holds a perfectly good token and drives
  // no Postać, which every action below this line is about.
  const seat = actor.seat;
  if (!seat) {
    return NextResponse.json({ error: "Nie prowadzisz żadnej Postaci." }, { status: 403 });
  }
  // Every rule about who may press what, and the four exceptions to "not your
  // turn", live in `mayAct`.
  const { allowed, tableScreen } = mayAct(game, actor.user, body.action);
  if (!allowed) {
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
      /**
       * The Poszukiwacz Przygód, sent out at something up to three Obszary off.
       * Either a Postać or a Wróg lying on the board, which is why there are two
       * fields and exactly one of them is expected to be set.
       */
      // The Najemnik, bought for a turn. No body beyond the actor's own seat:
      // one card in the box sells anything, so there is nothing to name.
      // The Krzyżowiec or the Gnom speaking what he carries. No holding named:
      // a character has at most one of each and the command finds it.
      case "ask":
        await speakCarriedSpell(game.id);
        break;
      case "pay":
        await payFriend(game.id);
        break;
      case "raid":
        await sendRaider(
          game.id,
          body.targetSeatId !== undefined
            ? { targetSeatId: String(body.targetSeatId) }
            : { fieldCardId: String(body.raidFieldCardId) },
        );
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
        //
        // The answer goes back, because "no" is a real answer here and used to
        // look exactly like nothing having happened.
        return NextResponse.json(
          await escape(
            game.id,
            typeof body.succeeded === "boolean" ? body.succeeded : null,
            // The shared screen in companion mode acts for whoever is fleeing;
            // a player's own device may only flee with its own character.
            tableScreen ? null : seat.id,
          ),
        );
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
      case "spell-claim":
        // 17.3/17.7, and the thirteen cards that say "w dowolnej chwili": any
        // seat may ask for the moment before the dice, not only the one whose
        // turn it is.
        await claimSpellFloor(game.id, seat.id);
        break;
      case "spell-release":
        await releaseSpellFloor(game.id, seat.id);
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
            decisionsFrom(body),
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
            decisionsFrom(body),
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
    return refused(error);
  }
}
