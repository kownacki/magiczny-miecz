/** Every action on the turn route, declared once: what it reads off the body and what it runs. */

import type { Spoils } from "../commands/spoils";
import type { CardClass } from "@/data/types";
import type { Decisions } from "../turnStore";
import { asFieldId } from "@/lib/engine/board";
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

/** A die the table reports, or nothing — a simulation never types one. */
const rolled = (value: unknown) => (typeof value === "number" ? value : null);

export const TURN = {
  roll: turn({
    from: (body) => rolled(body.value),
    run: (gameId, value) => rollForMove(gameId, value),
  }),
  move: turn({
    // `viaBridge` picks the turn-onto-the-Most option apart from the plain
    // walk, which lands on the same field id (11.10).
    from: (body) => ({ fieldId: String(body.fieldId), viaBridge: body.viaBridge === true }),
    run: (gameId, { fieldId, viaBridge }) => moveTo(gameId, fieldId, viaBridge),
  }),
  /**
   * Badanie Obszaru is one act (13.4), so one press deals the lot.
   *
   * A named card still means the physical deck decided and only that one came
   * up — companion's door, and the reason `drawCard` is still here. Nothing
   * named is simulation, where the app deals everything the Obszar still owes
   * at once rather than making the player press the same button three times
   * for one motion at the table.
   */
  draw: turn({
    from: (body) =>
      body.cardId
        ? { cardId: String(body.cardId), cardClass: body.cardClass as CardClass }
        : null,
    run: async (gameId, named) => (named ? await drawCard(gameId, named) : await drawAll(gameId)),
  }),
  fight: turn({
    // One Wróg, or several at once (17.5) whose Miecze add together.
    from: (body) => (Array.isArray(body.cardIds) ? body.cardIds.map(String) : [String(body.cardId)]),
    run: (gameId, cardIds) => beginFight(gameId, cardIds),
  }),
  "fight-total": turn({
    from: (body) => Number(body.total),
    run: (gameId, total) => setFightPlayerTotal(gameId, total),
  }),
  "fight-roll": turn({
    from: (body) => ({ side: body.side === "enemy" ? ("enemy" as const) : ("player" as const), value: rolled(body.value) }),
    run: (gameId, { side, value }) => fightRoll(gameId, side, value),
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
    // The Trzęsawiska are settled by the app from the dice; the Lodowy Las is
    // a fight, so the table reports how it went — and 11.8 lets it draw.
    from: (body): Parameters<typeof crossRing>[1] => {
      const outcome =
        body.outcome === "remis" || body.outcome === "nieudana" ? body.outcome : "udana";
      return { outcome, dice: Array.isArray(body.dice) ? body.dice.map(Number) : null };
    },
    run: (gameId, crossing) => crossRing(gameId, crossing),
  }),
  bridge: turn({
    // 11.11 has three outcomes, and the draw is not the same as a loss: it
    // costs no point but still bars next turn's attempt.
    from: (body): Parameters<typeof enterBridge>[1] =>
      body.outcome === "remis" || body.outcome === "porazka" ? body.outcome : "wygrana",
    run: (gameId, outcome) => enterBridge(gameId, outcome),
  }),
  // Fight whatever is blocking the way, rather than reporting an outcome.
  guardian: turn({ from: () => undefined, run: (gameId) => fightGuardian(gameId) }),
  "guardian-strength": turn({
    from: (body) => rolled(body.value),
    run: (gameId, value) => rollGuardianStrength(gameId, value),
  }),
  ferry: turn({
    from: (body) => body.pay === true,
    run: (gameId, pay) => payFerry(gameId, pay),
  }),
  /**
   * Absent means "you decide" — a simulation never reports an outcome it could
   * have worked out. A companion table sends a boolean.
   *
   * The answer goes back, because "no" is a real answer here and used to look
   * exactly like nothing having happened. The shared screen in companion mode
   * acts for whoever is fleeing; a player's own device may only flee with its
   * own character.
   */
  escape: turn({
    from: (body, { seat, tableScreen }) => ({
      succeeded: typeof body.succeeded === "boolean" ? body.succeeded : null,
      seatId: tableScreen ? null : seat.id,
    }),
    run: (gameId, { succeeded, seatId }) => escape(gameId, succeeded, seatId),
  }),
  // The Kamienny Most's own fields: the traps, the game with Death, the dog,
  // and the two creatures that stand in the way (14.5-14.6).
  "most-pole": turn({
    from: (body) => ({
      ...(Array.isArray(body.dice) ? { dice: body.dice.map(Number) } : {}),
      ...(Array.isArray(body.itemRolls) ? { itemRolls: body.itemRolls.map(Number) } : {}),
    }),
    run: (gameId, dice) => resolveBridgeOrdeal(gameId, dice),
  }),
  beast: turn({
    from: (body) => ({
      kind: rolled(body.kindRoll),
      strength: rolled(body.strengthRoll),
      player: rolled(body.playerRoll),
      beast: rolled(body.beastRoll),
    }),
    run: (gameId, { kind, strength, player, beast }) => fightBeast(gameId, kind, strength, player, beast),
  }),
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
    from: (body) => ({
      offer: String(body.offer ?? ""),
      value: rolled(body.value),
      decided: decisionsFrom(body),
    }),
    run: (gameId, { offer, value, decided }) => resolveFieldOffer(gameId, offer, value, decided),
  }),
  // The card's own script, applied by the app for the same reason the field's
  // table is.
  "karta-efekt": turn({
    from: (body) => ({
      cardId: String(body.cardId ?? ""),
      value: rolled(body.value),
      decided: decisionsFrom(body),
    }),
    run: (gameId, { cardId, value, decided }) => resolveDrawnCard(gameId, cardId, value, decided),
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
