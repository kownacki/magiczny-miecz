/** Every action on the turn route, declared once: what it reads off the body and what it runs. */

import type { Spoils } from "../commands/spoils";
import type { Decisions } from "../turnStore";
import { asFieldId } from "@/lib/engine/board";
import { requireCardId } from "@/data/ids";
import type { Body, Requests, TurnAction } from "../requests";
import { action, type Actions, type RepliesOf } from "./shape";
import {
  attackSeat,
  sendRaider,
  healFromFriend,
  partWithFriend,
  payFriend,
  speakCarriedSpell,
  breakFree,
  claimMission,
  beginFight,
  crossRing,
  fightGuardian,
  payFerry,
  rollGuardianStrength,
  drawAll,
  escape,
  fightBeast,
  fightRoll,
  finishTurn,
  moveTo,
  resolveFight,
  rollForMove,
  resolveBridgeOrdeal,
  resolveDrawnCard,
  resolveFieldOffer,
  claimSpellFloor,
  releaseSpellFloor,
  answerScript,
  answerAsk,
} from "../turnStore";

const turn = action<"turn">();

/**
 * What the player decided, taken off the request.
 *
 * Only numbers and a field id — never an effect. The server re-walks the card
 * it owns and takes the branch these point at, so a card cannot be talked into
 * doing something it does not say.
 */
export function decisionsFrom(body: Body<"turn">): Decisions {
  const choices = Array.isArray(body.choices)
    ? body.choices.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
    : undefined;
  const destination = asFieldId(typeof body.destination === "string" ? body.destination : null);
  return {
    ...(choices?.length ? { choices } : {}),
    ...(destination ? { destination } : {}),
  };
}

/**
 * 17.9's choice, out of two request fields and into the shape the command takes.
 *
 * Anything unrecognised is the Życie, which is what the app always took — a
 * misspelt spoil should end the duel the ordinary way rather than refuse it.
 */
function spoilsIn(body: Partial<Requests["turn"]>): Spoils | undefined {
  if (body.spoils === "zloto") return { take: "zloto" };
  if (body.spoils === "przedmiot" && typeof body.spoilsHoldingId === "string") {
    return { take: "przedmiot", holdingId: body.spoilsHoldingId };
  }
  return undefined;
}

export const TURN = {
  roll: turn({ from: () => undefined, run: (gameId) => rollForMove(gameId) }),
  move: turn({
    // `viaBridge` picks the turn-onto-the-Most option apart from the plain
    // walk, which lands on the same field id (11.10).
    from: (body) => ({ fieldId: String(body.fieldId), viaBridge: body.viaBridge === true }),
    run: (gameId, { fieldId, viaBridge }) => moveTo(gameId, fieldId, viaBridge),
  }),
  /**
   * Badanie Obszaru is one act (13.4), so one press deals the lot.
   *
   * The app deals everything the Obszar still owes at once rather than making
   * the player press the same button three times for one motion at the table.
   */
  draw: turn({ from: () => undefined, run: (gameId) => drawAll(gameId) }),
  fight: turn({
    // One Wróg, or several at once (17.5) whose Miecze add together.
    from: (body) =>
      Array.isArray(body.cardIds)
        ? body.cardIds.map((one) => requireCardId(one as string))
        : [requireCardId(body.cardId as string)],
    run: (gameId, cardIds) => beginFight(gameId, cardIds),
  }),
  "fight-roll": turn({
    from: (body) => (body.side === "enemy" ? ("enemy" as const) : ("player" as const)),
    run: (gameId, side) => fightRoll(gameId, side),
  }),
  attack: turn({
    from: (body) => String(body.targetSeatId),
    run: (gameId, targetSeatId) => attackSeat(gameId, targetSeatId),
  }),
  // Handing the Władca's misja in at the Twierdza (15.x, board text).
  claim: turn({ from: () => undefined, run: (gameId) => claimMission(gameId) }),
  // Throwing to shake off an Obszar that is holding the character in place
  // (both Świątynie, face 9). No body: it is always the actor's own seat.
  free: turn({ from: () => undefined, run: (gameId) => breakFree(gameId) }),
  // The Krzyżowiec or the Gnom speaking what he carries. No holding named: a
  // character has at most one of each and the command finds it.
  ask: turn({ from: () => undefined, run: (gameId) => speakCarriedSpell(gameId) }),
  // The Najemnik, bought for a turn. No body beyond the actor's own seat: one
  // card in the box sells anything, so there is nothing to name.
  pay: turn({ from: () => undefined, run: (gameId) => payFriend(gameId) }),
  /**
   * The two friends who mend you at one named Obszar, and who may be given up
   * there instead. Both are the card's own offer rather than the Obszar's,
   * which is why neither goes through the shop.
   */
  "friend-heal": turn({
    from: (body) => Number(body.points ?? 1),
    run: async (gameId, points) => ({ healed: await healFromFriend(gameId, points) }),
  }),
  "friend-part": turn({
    from: (body) => String(body.holdingId),
    run: async (gameId, holdingId) => ({ gold: await partWithFriend(gameId, holdingId) }),
  }),
  /**
   * The Poszukiwacz Przygód, sent out at something up to three Obszary off.
   * Either a Postać or a Wróg lying on the board, which is why there are two
   * fields and exactly one of them is expected to be set.
   */
  raid: turn({
    from: (body) =>
      body.targetSeatId !== undefined
        ? { targetSeatId: String(body.targetSeatId) }
        : { fieldCardId: String(body.raidFieldCardId) },
    run: (gameId, target) => sendRaider(gameId, target),
  }),
  cross: turn({
    // The Trzęsawiska are settled by the app from its own dice; the undefended
    // direction is a walk, and says so with an outcome (11.3, 11.7).
    from: (body): Parameters<typeof crossRing>[1] => {
      const outcome =
        body.outcome === "remis" || body.outcome === "nieudana" ? body.outcome : "udana";
      return { outcome };
    },
    run: (gameId, crossing) => crossRing(gameId, crossing),
  }),
  // Fight whatever is blocking the way, rather than reporting an outcome.
  guardian: turn({ from: () => undefined, run: (gameId) => fightGuardian(gameId) }),
  "guardian-strength": turn({
    from: () => undefined,
    run: (gameId) => rollGuardianStrength(gameId),
  }),
  ferry: turn({
    from: (body) => body.pay === true,
    run: (gameId, pay) => payFerry(gameId, pay),
  }),
  /**
   * Absent means "you decide" — a simulation never reports an outcome it could
   * have worked out.
   *
   * The answer goes back, because "no" is a real answer here and used to look
   * exactly like nothing having happened. A device may only flee with its own
   * character.
   */
  escape: turn({
    from: (body, { seat }) => ({
      succeeded: typeof body.succeeded === "boolean" ? body.succeeded : null,
      seatId: seat.id,
    }),
    run: (gameId, { succeeded, seatId }) => escape(gameId, succeeded, seatId),
  }),
  // The Kamienny Most's own fields: the traps, the game with Death, the dog,
  // and the two creatures that stand in the way (14.5-14.6).
  "most-pole": turn({
    from: () => undefined,
    run: (gameId) => resolveBridgeOrdeal(gameId),
  }),
  beast: turn({ from: () => undefined, run: (gameId) => fightBeast(gameId) }),
  // 17.3/17.7, and the thirteen cards that say "w dowolnej chwili": any seat
  // may ask for the moment before the dice, not only the one whose turn it is.
  "spell-claim": turn({
    from: (_body, { seat }) => seat.id,
    run: (gameId, seatId) => claimSpellFloor(gameId, seatId),
  }),
  "spell-release": turn({
    from: (_body, { seat }) => seat.id,
    run: (gameId, seatId) => releaseSpellFloor(gameId, seatId),
  }),
  // 17.9's choice, where the winner of a duel made one. Absent means the
  // Życie, which is what every surface did before it could ask.
  "fight-done": turn({
    from: (body) => spoilsIn(body),
    run: (gameId, spoils) => resolveFight(gameId, spoils),
  }),
  // The app throws the die and applies the row. What comes back says which
  // face and what it did, because the player did not watch it.
  "pole-tabela": turn({
    from: (body) => ({ offer: String(body.offer ?? ""), decided: decisionsFrom(body) }),
    run: (gameId, { offer, decided }) => resolveFieldOffer(gameId, offer, decided),
  }),
  // The card's own script, applied by the app for the same reason the field's
  // table is.
  "karta-efekt": turn({
    from: (body) => ({ cardId: requireCardId(body.cardId as string), decided: decisionsFrom(body) }),
    run: (gameId, { cardId, decided }) => resolveDrawnCard(gameId, cardId, decided),
  }),
  /**
   * Two frames can be waiting, and the body says which by what it names.
   *
   * A `choice` is an `ask` — a question printed on a Charakterystyka, with
   * the Karty it is offering held on the frame. Anything else is the suspended
   * card, continued with what the player decided.
   *
   * The seat is not taken from the body: the frame names whose answer it is
   * (law 5), and the command refuses anybody else. Passing the caller would
   * let a device answer somebody's hidden hand for them.
   */
  answer: turn({
    from: (body, { seat }) =>
      typeof body.choice === "number"
        ? { ask: true as const, choice: body.choice, seatId: seat.id }
        : { ask: false as const, decided: decisionsFrom(body) },
    run: async (gameId, answer) =>
      answer.ask
        ? { spellId: await answerAsk(gameId, answer.seatId, answer.choice) }
        : answerScript(gameId, answer.decided),
  }),
  end: turn({ from: () => undefined, run: (gameId) => finishTurn(gameId) }),
} satisfies Actions<"turn", TurnAction>;

/** What each entry in `TURN` answers on the wire — see `RepliesOf`. */
export type TurnReplies = RepliesOf<typeof TURN>;
