/** Applies turn actions against the database, journalling each one so a wrong call at the table can be seen and undone. */

import {
  fieldCardsFor,
  type HoldingRow,
} from "./store";
import {
  type FieldId,
} from "@/lib/engine/board";
import { dealtInto } from "@/lib/engine/turn";
import { resolutionOrder } from "@/lib/engine/state";
import type { CardClass, EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { type Effect } from "@/lib/engine/cardScript";
import { continueTopScript } from "./commands/effects";
import { only, requireTop, type TurnState } from "@/lib/engine/stack";
import { answerAsk as answerAskOn } from "./commands/ask";
import {
  afterFight,
  type Ends,
  type Modifier,
} from "@/lib/engine/status";
import {
  EVENTS,
  freshDecks,
  shuffleFor,
  type Decks,
} from "./decks";
import { change, effectRowsFor, merge, type EffectRow, type Handler } from "./change";
import { holdOverflow, releaseOverflow } from "./commands/overflow";
import { closeFight, resume } from "./commands/frames";
import { finishTurn as finishTurnOn, resetTurn as resetTurnOn } from "./commands/turn";
import { appRandom, supplied } from "./random";
import {
  addEffect as addEffectTo,
  keepOnly as keepOnlyIn,
  storedStatuses as statusesIn,
  tickEffects as tickEffectsOf,
} from "./commands/turn";
import { healSeat as healCommand } from "./commands/life";
import { fightBeast as fightBeastCommand } from "./commands/beast";
import { applyEffect as applyEffectOn, type Decisions, type Resolution } from "./commands/effects";
import { resolveDrawnCard as resolveDrawnCardOn, resolveFieldOffer as resolveFieldOfferOn, spendHolding as spendHoldingOn, type UseResult } from "./commands/resolving";
import {
  breakFree as breakFreeOn,
  claimMission as claimMissionOn,
  healFromFriend as healFromFriendOn,
  partWithFriend as partWithFriendOn,
  payFriend as payFriendOn,
  speakCarriedSpell as speakCarriedSpellOn,
} from "./commands/friends";
import {
  castSpell as castSpellOn,
  settleSpell as settleSpellOn,
  type Cast,
  type CastSpell,
} from "./commands/spells";
import { attackSeat as attackSeatOn, sendRaider as sendRaiderOn, beginFight as beginFightOn, escape as escapeOn, fightRoll as fightRollOn, setFightPlayerTotal as setFightPlayerTotalOn } from "./commands/fight";
import { resolveFight as resolveFightOn, type Spoils } from "./commands/spoils";
import {
  crossRing as crossRingOn,
  enterBridge as enterBridgeOn,
  fightGuardian as fightGuardianOn,
  payFerry as payFerryOn,
  resolveBridgeOrdeal as resolveBridgeOrdealOn,
  rollGuardianStrength as rollGuardianStrengthOn,
  type BridgeOrdealResult,
  type BridgeOutcome,
  type CrossOutcome,
} from "./commands/bridge";
import { claimFloor, releaseFloor } from "./commands/spellFloor";
import { adjustSeat, type Adjustable, type Adjusted } from "./commands/adjust";
import { stackAt as stackAtOn, stackForDraw as stackForDrawOn } from "./commands/piles";
import type { JournalKind } from "@/lib/engine/journal";
import {
  dropCard as dropCardOn,
  clearField as clearFieldOn,
  grantCard as grantCardOn,
  placeCard as placeCardOn,
  placeGold as placeGoldOn,
  takeCard as takeCardOn,
  takeFieldGold as takeFieldGoldOn,
  takeFromField as takeFromFieldOn,
} from "./commands/holdings";
import {
  equipCard as equipCardOn,
  reorderPack as reorderPackOn,
  spilled,
} from "./commands/wearing";
import {
  drawAll as drawAllOn,
  drawCard as drawCardOn,
  drawSpell as drawSpellOn,
  drawSpellWithWand as drawSpellWithWandOn,
  shopStock as countStock,
} from "./commands/draw";
import {
  moveTo as moveToOn,
  rollForMove as rollForMoveOn,
  startGame as startGameOn,
} from "./commands/movement";
import {
  changeNature as changeNatureOn,
  dealCharacters as dealCharactersOn,
  placeSeat as placeSeatOn,
  type MovedBy,
  takeNewCharacter as takeNewCharacterOn,
} from "./commands/character";
import {
  STONE_TURNS,
  freeFromStone as freeFromStoneOn,
  turnToStone as turnToStoneOn,
} from "./commands/stone";
import { setEndlessStock as setEndlessStockOn } from "./commands/seat";
import {
  removeCharacter as removeCharacterOn,
  reviveCharacter as reviveCharacterOn,
  type Removed,
} from "./commands/withdraw";
import {
  TROPHY_RATE,
  buyGoods as buyGoodsFor,
  payHealer as payHealerFor,
  sellHolding as sellHoldingFor,
  tradeTrophies as tradeTrophiesFor,
} from "./commands/shop";

// Still this module's published surface while the rest of the store moves
// across; both now live in `decks.ts`.
export { freshDecks };
export type { Adjustable, Adjusted };
export { STONE_TURNS, TROPHY_RATE };
export type { BridgeOrdealResult, BridgeOutcome, CrossOutcome };
export type { Decisions, Resolution, UseResult };
export type { Decks };

/** Reads the stored decks, tolerating a game started before spells existed. */
import type { Slot } from "@/lib/engine/slots";
import { holdingsFor } from "./store";

/**
 * A stored row as the engine wants it — including where it is worn, which every
 * one of these call sites used to drop on the floor while building the same
 * object by hand.
 */
export async function startGame(gameId: string): Promise<void> {
  // Everybody who asked to be surprised finds out now, and not a moment
  // earlier — the sentinel sits in the seat for the whole poczekalnia so that
  // no device, the player's included, can see what is coming. Its own commit,
  // ahead of the one below: a seat still holding the sentinel when the start
  // reads the table would be dealt no kit at all.
  await change(gameId, dealCharactersOn, { to: "surprises" });

  // The first shuffle of the game, and seeded like every one after it.
  const owed = await change(gameId, startGameOn, (of) => ({
    decks: freshDecks(shuffleFor(of.game)),
  }));
  // 9.5's deal, run through the same draw as every other Zaklęcie so that the
  // pile, the reshuffle and the journal line are the one implementation.
  for (const seat of owed) {
    for (let n = 0; n < seat.spells; n++) await drawSpell(gameId, seat.seatId);
  }
}

/**
 * Records the movement roll.
 *
 * `value` is supplied when the table is rolling physical dice — the RandomPort
 * bound to a human. The server still validates the range, because a mistyped 8
 * would otherwise walk a character off the ring.
 */
export async function rollForMove(gameId: string, value: number | null): Promise<void> {
  await change(gameId, rollForMoveOn, { manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
}

export async function moveTo(
  gameId: string,
  destination: string,
  viaBridge = false,
): Promise<void> {
  await change(gameId, moveToOn, { destination, viaBridge });
}

/**
 * Records a drawn card.
 *
 * Companion mode is told which card came up, because the physical deck decided.
 * Simulation mode draws one itself. Both end in the same place — a card added
 * to the turn's stack in rule 15.2 order — which is the whole of the distinction
 * made concrete.
 */
export async function drawCard(
  gameId: string,
  named: { cardId: string; cardClass: CardClass } | null,
): Promise<{ card: EventCard | null; recycled: boolean }> {
  return change(gameId, drawCardOn, (of) => ({ named, shuffle: shuffleFor(of.game) }));
}

/**
 * Badanie Obszaru, as the one act it is at a table (13.4).
 *
 * The Karty an Obszar owes are dealt together — you stop, you count what is
 * already lying there, and you turn over the difference. `drawCard` above is
 * what remains for the two cases that really are singular: a companion table
 * naming the cardboard it just turned over, and a Karta that draws *past* the
 * Obszar's tally (`byCard` — the Skalne Wrota, Odmiana Losu).
 */
export async function drawAll(
  gameId: string,
): Promise<{ cards: EventCard[]; dealt: number; recycled: boolean }> {
  return change(gameId, drawAllOn, (of) => ({ shuffle: shuffleFor(of.game) }));
}

/**
 * The Różdżka Zaklęć's other half: a hand that refills itself (9.5).
 *
 * `spellAllowance` carries the card's first clause — how many you may hold.
 * This is the second, and for most of the roster it is the only one that does
 * anything: "może wziąć nowe Zaklęcie, gdy ma tyle Zaklęć, ile na początku gry
 * lub mniej." A Zaklęcie is not otherwise something you may simply take —
 * 9.5 has them arrive from Spotkania and Obszary — so a raised ceiling alone
 * leaves the wand inert for a Książę, who could already hold two and had no
 * way to reach them. The rulebook's own worked example is exactly this: he
 * picks the wand up, draws at once, casts the Ocalony, and *"ponieważ ma
 * Różdżkę, natychmiast bierze następne Zaklęcie."*
 *
 * Repeatable, because the card is: it is spent by nothing and says "gdy",
 * not "raz". What bounds it is the setup hand — cast down to it, refill, and
 * that is as often as the wand can be asked.
 */
export async function drawSpellWithWand(gameId: string, seatId: string): Promise<string | null> {
  return change(gameId, drawSpellWithWandOn, (of) => ({ seatId, shuffle: shuffleFor(of.game) }));
}

export async function drawSpell(gameId: string, seatId: string): Promise<string | null> {
  return change(gameId, drawSpellOn, (of) => ({ seatId, shuffle: shuffleFor(of.game) }));
}

/**
 * What the Wyposażenie pile still has, for every card on it.
 *
 * Sent with the table state so a shop can show what it has rather than offering
 * something that will be refused.
 */
export async function shopStock(
  gameId: string,
  // Both lists are usually already in hand at the call site — the table state
  // reads them anyway — and fetching them a second time is two more round
  // trips on a request every device makes every couple of seconds.
  known?: { holdings: HoldingRow[]; fieldCards: { card_id: string }[] },
): Promise<Record<string, number>> {
  return countStock(
    known ?? {
      holdings: await holdingsFor(gameId),
      fieldCards: await fieldCardsFor(gameId),
    },
  );
}

/**
 * Claims the moment before the dice (17.3, 17.7, 9.1).
 *
 * Anybody may ask, including the player whose fight it is — thirteen of the
 * twenty-seven Zaklęcia say "w dowolnej chwili", so a bystander speaking into
 * someone else's fight is ordinary. Only one at a time: the floor is exclusive,
 * and while it is held nobody else may claim it and the dice do not move.
 *
 * Refused for a seat with nothing to say, which is the honest half of 9.3 —
 * the button can be offered to everybody without telling anybody anything,
 * because it is pressing it that reveals you were holding something.
 */
export async function claimSpellFloor(gameId: string, seatId: string): Promise<void> {
  await change(gameId, claimFloor, { seatId });
}

/**
 * Gives the floor back without using it.
 *
 * Reaching for a card and thinking better of it is a move somebody makes at a
 * table, and holding everybody up for the rest of the half-minute after
 * deciding is not.
 */
export async function releaseSpellFloor(gameId: string, seatId: string): Promise<void> {
  await change(gameId, releaseFloor, { seatId });
}

export async function beginFight(gameId: string, cardIds: string[]): Promise<void> {
  await change(gameId, beginFightOn, { cardIds });
}

/**
 * Picks a fight with a chosen creature, for testing.
 *
 * DEVELOPMENT ONLY — reached through the debug route, which a deployed build
 * refuses outright. Getting to a particular Wróg legitimately means walking the
 * board until the deck hands it to you, and the deck has a hundred and
 * forty-five other cards in it.
 *
 * It stages the situation and then leaves: the character is put on its own
 * field with the creature in front of it, and `beginFight` does the rest —
 * 17.5's combining, the Miecz a character brings with it, 17.3's window. A
 * shortcut that fought the creature *itself* would be a second implementation
 * of combat, tested by nobody, quietly disagreeing with the one the game uses.
 *
 * Only on your own turn, because a fight is a turn's worth of events and the
 * player whose turn it is would find one happening around them.
 */
export async function stageFight(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<void> {
  const card = EVENTS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Nieznana karta: ${cardId}`);
  if (!combatValueOf(card)) throw new Error(`${card.name} nie jest Wrogiem.`);

  // Through `change`, like everything else that writes a game. It used to read
  // the row, work out a turn_state and write it straight back — the
  // read-modify-write with nothing checking that the row had not moved
  // underneath, which is the one shape the whole `change` machinery exists to
  // stop. Being a test path is no excuse: it writes the same column the game
  // does, and a test that corrupts a table is worse than no test.
  await change(
    gameId,
    (snapshot) => {
      const seat = snapshot.seats.find((s) => s.id === seatId);
      if (!seat) throw new Error("Nieznane miejsce.");
      if (seat.seat_index !== snapshot.game.active_seat) throw new Error("To nie twoja tura.");
      if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");
      return {
        // The field as it would be if the card had just been drawn there, minus
        // the draw: nothing leaves the deck, so a staged fight does not thin it.
        writes: {
          game: {
            turn_state: only({
              phase: "field" as const,
              fieldId: seat.field_id,
              from: null,
              draw: 0,
              // Marked, because it was not drawn: `stageFight` reaches past the
              // deck and the deck still holds this Wilkołak. Everything that
              // draws the card from here on says so.
              drawn: [{ cardId: card.id, cardClass: card.cardClass, granted: true }],
              fought: [],
            }),
          },
        },
        result: undefined,
      };
    },
    undefined,
  );
  await beginFight(gameId, [card.id]);
}

/**
 * Puts Karty in front of the active seat as though they had just been drawn.
 *
 * `stageFight` without the fight, and for the three classes that have no other
 * door: a Spotkanie, a Nieznajomy and a Miejsce are obeyed rather than held, so
 * neither the hand nor a staged fight is anywhere to put one. Before this the
 * only way to see one resolve was to draw until it came up.
 *
 * Marked `granted`, because the deck still holds these cards — the whole point
 * of the test verb is that the piles are not touched. And appended rather than
 * replacing the frame when a turn is already standing on an Obszar, so 15.2's
 * order is worked out over everything drawn rather than over these cards alone.
 * With no field phase open it opens one where the figure stands, exactly as
 * `stageFight` does, so the cards can be looked at without rolling first.
 *
 * # Several at once, and why it is one commit
 *
 * `drawAll` deals what the Obszar owes in one act, because 13.4 settles the
 * whole number at the moment of arrival and nobody at a table deals a card,
 * resolves it, and then decides whether to deal the next. `deal` is `draw` with
 * the choice taken off the deck, so it has to be able to stand in for the whole
 * deal and not only for its first card.
 *
 * One `change`, folding `dealtInto` over the list rather than calling this once
 * per card. Two reasons, and the first is a rule: dealing them separately would
 * open the half-explored state between the presses that `drawAll`'s own note
 * exists to close, and every card after the first would arrive into a turn the
 * one before it had already changed. The second is the `merge` trap in
 * CLAUDE.md — `turn_state` is a column each card reads and writes, so two
 * changesets side by side would keep only the second card and silently lose the
 * first. Threading the `TurnState` through the fold sidesteps both.
 *
 * The order typed is the order they arrive in, and that is all 15.2 needs:
 * `dealtInto` hands each to `afterDraw`, which re-runs `resolutionOrder` over
 * the whole kolejka, so a Wróg named third still resolves before a Przedmiot
 * named first, and two of one class keep the order they were named in.
 */
export async function stageCards(
  gameId: string,
  seatId: string,
  cardIds: readonly string[],
): Promise<string[]> {
  const cards = cardIds.map((cardId) => {
    const card = EVENTS.find((one) => one.id === cardId);
    if (!card) throw new Error(`Nieznana karta: ${cardId}`);
    return card;
  });
  if (cards.length === 0) throw new Error("Nie podano żadnej karty.");

  await change(
    gameId,
    (snapshot) => {
    const seat = snapshot.seats.find((one) => one.id === seatId);
    if (!seat) throw new Error("Nieznane miejsce.");
    if (seat.seat_index !== snapshot.game.active_seat) throw new Error("To nie twoja tura.");
    if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");
    const fieldId = seat.field_id;

    const turn_state = cards.reduce<TurnState | null>(
      (state, card) =>
        state === null
          ? null
          : dealtInto(state, { cardId: card.id, cardClass: card.cardClass, granted: true }, fieldId),
      snapshot.game.turn_state,
    );
    // `draw`'s own refusal, in `draw`'s own words: a card resolves into the
    // turn, and mid-fight or mid-Karta there is nowhere to put one.
    if (!turn_state) throw new Error("Nie czas na ciągnięcie kart (13.4).");

    return {
      writes: {
        game: { turn_state },
        journal: cards.map((card) => ({
          seatId,
          round: snapshot.game.round,
          // One line per Karta, not one for the deal — `drawAll`'s rule, for
          // the same reason: the Dziennik records what came up, and
          // "wyciągnięto 3 Karty" is a record of a gesture.
          kind: "test-deal" as const,
          payload: { cardId: card.id, fieldId },
          manual: true,
        })),
      },
      result: undefined,
    };
    },
    undefined,
  );

  /**
   * The order the turn will reach them in, for whoever asked.
   *
   * The same `resolutionOrder` the frame ran, over the new cards alone — which
   * is the relative order they hold inside the kolejka however much was already
   * waiting there. Recomputed rather than read back off the written frame,
   * because a frame that already held a copy of one of these names could not be
   * asked which entry was the new one.
   */
  return resolutionOrder(
    cards.map((card) => ({ cardId: card.id, cardClass: card.cardClass })),
  ).map((card) => card.cardId);
}

/**
 * Walks out of a fight, for testing.
 *
 * DEVELOPMENT ONLY — reached through the debug route, which a deployed build
 * refuses outright.
 *
 * The counterpart to `stageFight`, and needed for the same reason. Staging a
 * fight to look at one thing leaves you holding the rest of it: the dice, the
 * verdict, the point of Życie. And a fight is the one phase with no way back —
 * 17.4 ends it when the dice are compared, and 19.1 will not let you leave
 * without an ability that says so, which is exactly the rule being tested.
 *
 * So this is not an escape and does not pretend to be one. Nothing is applied,
 * nothing is spent, no rule is consulted, and the journal says a fight was
 * broken off rather than fled — because a row that read like 19.1 would make
 * the test hatch indistinguishable from the thing it exists to test.
 */
export async function abandonFight(gameId: string): Promise<void> {
  await change(
    gameId,
    async (snapshot, _command, ports) => {
      // `endFight` puts the character back on its field with the fight's
      // creatures already in `fought` — startFight settles them the moment it
      // opens — so the field resumes with nothing outstanding rather than
      // offering the same creature again the moment the modal closes. A
      // *pushed* fight — a `walka` step's, a summon's — pops instead, and the
      // frame beneath takes it from there; and a round of a looping fight
      // leaves the loop on top when it pops, which `closeFight` settles.
      const state = requireTop(snapshot.game.turn_state, "fight");
      const seat = snapshot.seats.find((s) => s.seat_index === snapshot.game.active_seat);
      const { cardName } = state.fight;
      return closeFight(
        snapshot,
        state,
        ports,
        seat
          ? {
              journal: [
                {
                  seatId: seat.id,
                  round: snapshot.game.round,
                  kind: "test-fight-end" as const,
                  payload: { cardName },
                  manual: true,
                },
              ],
            }
          : {},
      );
    },
    undefined,
  );
}

/**
 * Answers the `script` frame on top of the stack (docs/STACK.md).
 *
 * The one door back into a suspended card: the choices walk down the frame's
 * cursor on the server, against the card the server holds, so a card still
 * cannot be talked into doing something it does not say.
 */
export async function answerScript(gameId: string, decided: Decisions): Promise<Resolution> {
  return change(
    gameId,
    (snapshot, command, ports) =>
      continueTopScript(snapshot, { decided: command, shuffle: shuffleFor(snapshot.game) }, ports),
    decided,
  );
}

/**
 * Answers the `ask` frame on top of the stack (docs/STACK.md).
 *
 * The other door, for a question printed on a Charakterystyka rather than on a
 * card being resolved. Chained the same way a fight's close is: a `zaklecie`
 * step that suspended into this is a card mid-sentence, and answering puts the
 * Zaklęcie in the hand and lets the card carry on in the same commit.
 */
export async function answerAsk(
  gameId: string,
  seatId: string | null,
  choice: number,
): Promise<string> {
  return change(
    gameId,
    async (snapshot, command, ports) =>
      resume(snapshot, answerAskOn(snapshot, command), ports),
    { ...(seatId ? { seatId } : {}), choice },
  );
}

/**
 * Speaks a Zaklęcie (9.6).
 *
 * The card leaves the caster's hand for the used pile and the table is told
 * what was cast and at whom. What the spell *does* is not applied: these are
 * the most interconnected cards in the box — Zwierciadło reflects whatever was
 * just cast, Władca Zaklęć negates it, Wojna Żywiołów switches every spell and
 * magic item off until the caster's next turn — and a referee that got one of
 * those subtly wrong would be worse than one that stayed out of it.
 *
 * What the app does own is the bookkeeping a table actually loses: whose hand
 * it left, that it is spent, and that everybody heard.
 *
 * Two spells are applied rather than announced, and `SpellScript.applies` says
 * which and why: both take *cards* out of play, and where a card goes when it
 * leaves is the one thing at this table only the app knows. Announcing those
 * and stepping back means the cards never reach the used pile, and 9.5 refills
 * the deck from that pile.
 *
 * 9.7 is the one hard prohibition and is enforced: nothing works on the
 * creatures of the Kamienny Most, nor on the Bestia.
 */
export async function castSpell(
  gameId: string,
  seatId: string,
  holdingId: string,
  target: NonNullable<CastSpell["target"]> = {},
  /**
   * What the caster has already answered of the spell's own effect.
   *
   * One card asks anything at all — the Władca Zdarzeń, „na inny Obszar w tym
   * samym Kręgu" — and a cast that arrives without it is refused rather than
   * spent, so this is how the second attempt carries the answer.
   */
  decided: Decisions = {},
): Promise<Cast> {
  return change(gameId, castSpellOn, { seatId, holdingId, target, decided });
}

/**
 * The Zaklęcie left in the air, taking effect.
 *
 * A spell waits while anybody at the table holds something that could answer
 * it (`castSpell`), and somebody has to be watching the clock — so this is the
 * other end of that window, safe to call at any time by anybody: with nothing
 * waiting, or with a window still open, it writes nothing and says so.
 *
 * `force` is the table saying out loud that nobody is going to answer, which is
 * the same shortcut `releaseFloor` gives a claim nobody wants any more.
 */
export async function settleSpell(gameId: string, force = false): Promise<Cast | null> {
  return change(gameId, settleSpellOn, { force });
}

export async function setFightPlayerTotal(gameId: string, total: number): Promise<void> {
  await change(gameId, setFightPlayerTotalOn, { total });
}

export async function fightRoll(
  gameId: string,
  side: "player" | "enemy",
  value: number | null,
): Promise<void> {
  await change(gameId, fightRollOn, { side, manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
}

/**
 * Closes a fight and applies its cost.
 *
 * A loss costs one point of Życie (17.4). A draw costs nothing at all (17.10) —
 * which is the detail tables most often get wrong, so the referee is careful to
 * apply literally nothing. What the *winner* takes is a choice under 17.9 and
 * is left to the player rather than assumed.
 */
export async function resolveFight(gameId: string, spoils?: Spoils): Promise<void> {
  await change(
    gameId,
    async (snapshot, command, ports) =>
      resume(snapshot, await resolveFightOn(snapshot, command, ports), ports),
    spoils ? { spoils } : undefined,
  );
}

/**
 * Takes a card off the field's stack once somebody has claimed it.
 *
 * What is still listed when the turn ends is exactly what nobody took, which is
 * what 16.8 leaves lying there for the next character.
 */
export async function takeCard(
  gameId: string,
  seatId: string,
  cardId: string,
  /** Set when this card came off a field that was holding a granted one. */
  granted = false,
): Promise<void> {
  const taken = await change(gameId, thenHold(takeCardOn), { seatId, cardId, granted });
  // A Sztuka Złota is not luggage — taking it resolves it. The command does the
  // writes it owns and hands back the script rather than guessing at a rule
  // `applyEffect` owns.
  if (taken.resolve) {
    await applyEffect(gameId, seatId, taken.resolve.effect, taken.resolve.reason);
  }
}

/**
 * A way out of an overflow frame, with the check that closes it.
 *
 * The three verbs `waysUnder` names — odrzuć, użyj, załóż — are verbs the app
 * already had, so the frame does not need a fourth. It needs each of them
 * followed by "and is the seat under now?", which is what this wraps around
 * them. 5.4 hands the choice to the player and says nothing about the method;
 * neither does this.
 *
 * Chained through the writes rather than the snapshot, because the card being
 * dropped is the one that decides the answer.
 */
function thenRelease<C, T>(handler: Handler<C, T>): Handler<C, T> {
  return async (snapshot, command, ports) => {
    const { writes, result } = await handler(snapshot, command, ports);
    /**
     * The Sakwa empties first, and then the limit is asked.
     *
     * Order matters and it is the ordinary `merge` trap: taking the bag off
     * puts what was inside back in the Plecak, which is what can push the
     * holder over the four — so the surplus has to be judged on the state that
     * already has the spill in it, or the frame would open a move late.
     */
    const spill = spilled(snapshot, writes);
    const done = merge(writes, spill);
    return { writes: merge(done, releaseOverflow(snapshot, done)), result };
  };
}

/**
 * A card gained, with the check that opens the frame if it put somebody over.
 *
 * The other half of `thenRelease`, and the reason both exist here rather than
 * inside the commands: a Karta arriving is one command's business and 5.6 is
 * the table's, so the rule is wrapped round the verb instead of written into
 * it. Sixty-seven commands write to this game and only a handful can overload
 * anybody; those are the ones wearing this.
 *
 * It matters most where the seat gaining the card is not the seat playing. A
 * raid hands a Przedmiot to the raider on somebody else's turn, and until now
 * the only thing that noticed was a refusal aimed at the overloaded player the
 * next time *they* tried to do something — by which point the table had played
 * on through a state the rules do not allow.
 */
function thenHold<C, T>(handler: Handler<C, T>): Handler<C, T> {
  return async (snapshot, command, ports) => {
    const { writes, result } = await handler(snapshot, command, ports);
    return { writes: merge(writes, holdOverflow(snapshot, writes)), result };
  };
}

export async function dropCard(gameId: string, holdingId: string): Promise<void> {
  await change(gameId, thenRelease(dropCardOn), { holdingId });
}

/**
 * Puts a seat's pack in the order its owner wants it in.
 *
 * Not a rule — 5.4 counts what you carry and has no opinion about the order it
 * sits in — but a pack of four cards you cannot arrange is one you have to read
 * every time instead of recognising. The order has to be the server's, or the
 * next two-second poll would put the cards back where they were.
 *
 * Every id is checked against the seat that claims them, and only those ids are
 * written: a request naming somebody else's card renumbers nothing, rather than
 * quietly reaching into their pack.
 *
 * Not journalled. The journal is what the *table* is allowed to read, and the
 * order of somebody's own pack is not something the rules or anybody else at
 * the table has a stake in.
 */
/* ---------------------------------------------------------------------------
 * Effects a seat is under.
 *
 * The write half of `status.ts`. Reading is `allStatuses`, which folds these
 * together with the four ad-hoc columns so a player sees one list; this half is
 * only for the effects that have nowhere else to live — an Eliksir's two points
 * of Miecz for a turn, and everything the buff system will carry once more
 * cards are transcribed.
 * ------------------------------------------------------------------------ */
export async function effectsFor(gameId: string): Promise<EffectRow[]> {
  return effectRowsFor(gameId);
}

/** Puts a seat under something, and says so. */
export async function addEffect(
  gameId: string,
  seatId: string,
  effect: { source: string; label: string; modifier: Modifier; ends: Ends },
): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: addEffectTo(snapshot, { seatId, effect }), result: undefined }),
    undefined,
  );
}

/** One of this seat's own turns has gone by (see `afterTurn`). */
export async function tickEffects(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: tickEffectsOf(snapshot, seatId), result: undefined }),
    undefined,
  );
}

/** A fight has finished, however it finished (17.4). */
export async function clearFightEffects(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({
      writes: keepOnlyIn(snapshot, seatId, afterFight(statusesIn(snapshot, seatId))),
      result: undefined,
    }),
    undefined,
  );
}

export async function reorderPack(
  gameId: string,
  seatId: string,
  holdingIds: readonly string[],
): Promise<void> {
  await change(gameId, reorderPackOn, { seatId, holdingIds });
}

export async function spendHolding(gameId: string, holdingId: string): Promise<UseResult> {
  return change(gameId, thenRelease(spendHoldingOn), (of) => ({ holdingId, shuffle: shuffleFor(of.game) }));
}

/**
 * Trades trophies for a point of Miecz.
 *
 * Rule 1.4: seven points' worth of defeated Wrogowie buys one point of Miecz,
 * and anything past a multiple of seven is lost. The traded cards go to the
 * used pile.
 */
export async function tradeTrophies(
  gameId: string,
  seatId: string,
  want: { swords?: number; cardIds?: readonly string[] } = {},
): Promise<number> {
  return change(gameId, tradeTrophiesFor, { seatId, ...want });
}

/**
 * Adjusts a tracked value directly.
 *
 * This is the manual override, and it is not a debug affordance — the physical
 * board is the source of truth, so anything the referee cannot yet compute (a
 * card effect not transcribed, a house ruling, a miscount) has to be
 * expressible. Journalled with `manual` set so the log distinguishes what the
 * engine decided from what a human asserted.
 */
export async function adjust(
  gameId: string,
  seatId: string,
  stat: Adjustable,
  delta: number,
  reason: string | null,
  record: { kind: JournalKind; manual: boolean } = { kind: "override", manual: true },
  force = false,
): Promise<Adjusted> {
  return change(gameId, adjustSeat, { seatId, stat, delta, reason, record, force });
}

/**
 * Heals a character (4.7).
 *
 * Distinct from adding Życie with the +/-, and the distinction is a rule:
 * healing restores only up to the four a character started with (4.2), while
 * gains from encounters and exploration are uncapped (4.6). Routing this
 * through the engine's `heal` keeps the ceiling in one place — an earlier
 * version of this button used the generic adjustment and would have healed a
 * character past four.
 */
export async function healSeat(
  gameId: string,
  seatId: string,
  amount = 1,
): Promise<number> {
  return change(gameId, healCommand, { seatId, amount });
}

/**
 * Changes a character's Nature (7.2).
 *
 * Rule 7.3 allows it at most once per turn. Rule 7.4 is the consequence that
 * bites: a Magic Item the new Nature may not use has to be dropped at once
 * (5.5), so the caller is told which held cards have become forbidden rather
 * than the app silently discarding somebody's Excalibur.
 */
export async function changeNature(
  gameId: string,
  seatId: string,
  nature: "good" | "evil" | "chaotic",
  /** Ignores a 7.3 mark the game itself wrote. `byHand` is the other half. */
  force = false,
  /** Somebody typed it, so 7.3 gets no mark out of it — see the command. */
  byHand = false,
): Promise<{ nowForbidden: string[] }> {
  return change(gameId, changeNatureOn, { seatId, nature, force, byHand });
}

/**
 * Turns a character to stone for three turns (20.1).
 *
 * While stone it cannot move (20.4), holds nothing (20.2) and cannot be robbed
 * of a point of Życie (20.5). Its Miecz and Magia are unchanged but unusable
 * (20.3), which is why nothing is written to them here — the seat is simply
 * skipped in turn order until the timer runs out.
 */
export async function turnToStone(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: turnToStoneOn(snapshot, { seatId }), result: undefined }),
    undefined,
  );
}

/** The other half of the pair: a Kamień lifted by hand. See `freeFromStone`. */
export async function freeFromStone(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: freeFromStoneOn(snapshot, { seatId }), result: undefined }),
    undefined,
  );
}

/**
 * A Postać out of the game, and everything it carried onto its Obszar (12.1).
 *
 * `byUser` null is the console, which may also take a *dead* one off 4.4's list —
 * see `removeCharacter` for why that is a different permission from the rest.
 */
export async function removeCharacter(
  gameId: string,
  seatId: string,
  hard: boolean,
  byUser: string | null,
): Promise<Removed> {
  return change(gameId, removeCharacterOn, { seatId, hard, byUser });
}

/** A dead Postać standing up again, where it fell. Console-only. */
export async function reviveCharacter(gameId: string, seatId: string): Promise<string> {
  return change(gameId, reviveCharacterOn, { seatId });
}

/**
 * Attacks another character standing on the same field (13.3, 17.6).
 *
 * Rule 13.1 restricts encounters to the field a move ENDED on, so an attack is
 * only legal against someone actually standing there — passing through does not
 * count. Both sides fight with their full totals (1.5, 2.5), and rule 17.9 lets
 * the winner take a point of Życie, an item, or a Sztuka Złota, which is a
 * choice and so is left to the player.
 */
export async function attackSeat(gameId: string, targetSeatId: string): Promise<void> {
  await change(gameId, attackSeatOn, { targetSeatId });
}

/** Buys a turn of the Najemnik's sword. Returns the card, so the console can name him. */
export async function payFriend(gameId: string, seatId?: string): Promise<string> {
  return await change(gameId, payFriendOn, { seatId });
}

/** The Księżniczka or the Władca mending you where they belong. Returns the points given back. */
export async function healFromFriend(
  gameId: string,
  points: number,
  seatId?: string,
): Promise<number> {
  return await change(gameId, healFromFriendOn, { seatId, points });
}

/** Giving one of those two up at their own Obszar. Returns the gold taken for it. */
export async function partWithFriend(
  gameId: string,
  holdingId: string,
  seatId?: string,
): Promise<number> {
  return await change(gameId, partWithFriendOn, { seatId, holdingId });
}

/** Has a Przyjaciel speak the Zaklęcie he carries. Returns what the table must now do. */
export async function speakCarriedSpell(gameId: string, seatId?: string) {
  return await change(gameId, speakCarriedSpellOn, { seatId });
}

/** Hands the Władca's misja in and takes the Tarcza Tolimana. */
export async function claimMission(gameId: string, seatId?: string): Promise<string> {
  return await change(gameId, claimMissionOn, { seatId });
}

/** Throws to shake off something holding the character in place. */
export async function breakFree(gameId: string, seatId?: string) {
  return await change(gameId, breakFreeOn, { seatId });
}

export async function sendRaider(
  gameId: string,
  target: { targetSeatId?: string; fieldCardId?: string },
): Promise<void> {
  await change(gameId, sendRaiderOn, target);
}

/**
 * Squares up to whatever is guarding the way through.
 *
 * The bridge entrances and the Lodowy Las all print a creature with a strength
 * and expect a normal fight, so they get one rather than a pair of buttons
 * asking the table who won. Which creature it is comes from where the character
 * is standing and what it is trying to do.
 */
export async function fightGuardian(gameId: string): Promise<void> {
  await change(gameId, fightGuardianOn, undefined);
}

/** Throws the die that gives a bridge guardian its Miecz or Magia (5 to 10). */
export async function rollGuardianStrength(
  gameId: string,
  value: number | null,
): Promise<{ strength: number }> {
  return change(gameId, rollGuardianStrengthOn, { manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
}

/**
 * The ferryman at a Przeprawa.
 *
 * "Musisz przeprawić się przez rzekę płacąc przewoźnikowi 1 Sz. Z. lub wracasz
 * na Obszar, z którego rozpocząłeś ruch." Landing here is a toll, not a stop:
 * pay it and the turn goes on as normal, or the whole move is undone and the
 * character finishes the turn where it began.
 *
 * A character with no gold has no choice, which is why refusing is always
 * available and paying is not.
 */
export async function payFerry(gameId: string, pay: boolean): Promise<{ at: string }> {
  return change(gameId, payFerryOn, { pay });
}

/**
 * What a fight came to, from the character's side.
 *
 * The same three words the combat engine produces, used here so a guardian
 * settled by an actual fight and one settled by the table saying how it went
 * travel through exactly the same code.
 */
export type FightOutcome = "wygrana" | "remis" | "przegrana";

/**
 * The table reporting how a bridge guardian went, where it is not being fought
 * through the app — companion mode with the creature resolved on the table.
 */
export async function enterBridge(
  gameId: string,
  outcome: BridgeOutcome,
): Promise<{ at: string | null }> {
  return change(gameId, enterBridgeOn, { outcome });
}

/**
 * Crosses between rings (11.1-11.8).
 *
 * Only two places on the whole board allow it, only one direction of each is
 * defended, and the two obstacles are different in kind. The Trzęsawiska are a
 * threshold — two dice against the character's Magia — so the app settles them
 * outright. The Lodowy Las is a fight with the Rycerz Wiecznych Śniegów, which
 * normally goes through `fightGuardian` and the combat engine; this route is
 * what remains for a table resolving that fight themselves.
 */
export async function crossRing(
  gameId: string,
  input: { outcome?: CrossOutcome; dice?: number[] | null; to?: FieldId } = {},
): Promise<{ to: string | null; outcome: CrossOutcome; dice?: number[]; magia?: number }> {
  return change(gameId, crossRingOn, { outcome: input.outcome, to: input.to }, {
    random: supplied(input.dice ?? [], appRandom()),
  });
}

/**
 * Declines a fight (17.2, 19).
 *
 * Rule 17.2 makes fleeing a decision taken BEFORE any dice, and 19.1 says
 * whether it works depends on the character's own special abilities or the
 * Krąg Płomieni spell — never on a die. So the answer is read off what the
 * seat is holding rather than rolled for, and a companion table can still say
 * yes or no itself.
 *
 * Three things the rules keep apart and this has to as well:
 *
 * - **Who.** 17.6 gives the attempt to the character who was *attacked*. In a
 *   duel that is never the active seat, because a duel only starts when the
 *   active seat attacks somebody (13.3).
 * - **From what.** Every printed escape covers Wrogowie. Another Postać is the
 *   Krąg Płomieni's alone — see `EscapeTarget`.
 * - **Where.** 19.3 leaves exactly one kind of escape on the Kamienny Most.
 */
export async function escape(
  gameId: string,
  reported: boolean | null,
  actorSeatId: string | null = null,
): Promise<{ succeeded: boolean; onBridge: boolean }> {
  return change(
    gameId,
    async (snapshot, command, ports) =>
      resume(snapshot, escapeOn(snapshot, command), ports),
    { reported, actorSeatId },
  );
}

/**
 * Fights the Beast, which is how the game is won or the attempt fails (14.7, 22).
 *
 * The Beast is not a card: rule 14.7 rolls for it twice. One die decides the
 * kind of fight (1-3 ordinary, 4-6 magical) and a second sets its strength from
 * 10 to 15. A character that reaches the Zamek and has announced it is fighting
 * MUST go through with it (10.5) — there is no backing out at this point.
 *
 * Winning ends the game there and then (22). Losing costs two points of Życie,
 * not one, and forces a retreat off the bridge; the character may come back and
 * try again.
 */
export async function fightBeast(
  gameId: string,
  kindRoll: number | null,
  strengthRoll: number | null,
  playerRoll: number | null,
  beastRoll: number | null,
): Promise<void> {
  // The four dice in the order the command asks for them. This is the whole of
  // what `die_source` decides, and it is decided here rather than fifteen times
  // inside the rules.
  await change(gameId, fightBeastCommand, undefined, {
    random: supplied([kindRoll, strengthRoll, playerRoll, beastRoll], appRandom()),
  });
}

/**
 * Whether this character may set foot on the Kamienny Most.
 *
 * Rule 11.9 lets a character step on only from Wymarłe Miasto or Ruiny
 * Twierdzy, and the "CEL GRY" section requires a Magiczny Miecz to walk it at
 * all. Rule 14.7 adds that the Tarcza Tolimana is what gets you into the Zamek
 * — without one you must walk past it.
 */
export function bridgeRequirements(holdings: readonly { cardId: string }[]): {
  hasSword: boolean;
  hasShield: boolean;
} {
  const ids = new Set(holdings.map((h) => h.cardId));
  return {
    hasSword: ids.has("magiczny-miecz"),
    hasShield: ids.has("tarcza-tolimana") || ids.has("tarcza-boga-tolimana"),
  };
}

/**
 * Hands the turn on — or stops, and says which it did.
 *
 * `"held"` is the surplus: the frame was opened and the turn stayed where it
 * is, so a caller that announces "turn passed" regardless would be announcing
 * the opposite of what happened. It is a return value rather than a throw
 * because a throw discards the writes, and the frame *is* the write.
 */
/**
 * This turn from the top, for the test console — see `resetTurn` in
 * `commands/turn.ts` for what it does and deliberately does not undo.
 */
export async function resetTurn(gameId: string): Promise<void> {
  await change(gameId, resetTurnOn, undefined);
}

export async function finishTurn(
  gameId: string,
  /** `turn end force`, which is the test console's and always answers "passed". */
  force = false,
): Promise<"passed" | "held"> {
  return change(gameId, finishTurnOn, { force });
}

/**
 * Puts a Przedmiot on, or takes it off.
 *
 * Only in the slotted variant — in klasyczny play there is nowhere to put
 * anything, because the rulebook has one kind of possession and one limit
 * (5.4). A table playing by the book must not find its cards quietly acquiring
 * positions on a body the rules do not have.
 *
 * `slot` of null takes the card off and puts it back in the pack. Anything
 * already in the place being filled comes off in the same breath, which is what
 * a player means by putting on a different sword.
 */
export async function equipCard(
  gameId: string,
  holdingId: string,
  slot: Slot | null,
): Promise<void> {
  await change(gameId, thenRelease(equipCardOn), { holdingId, slot });
}

/**
 * What the Kamienny Most does to a character standing on one of its fields.
 *
 * The bridge is where the game ends, and until now the app went quiet on it:
 * the seven fields between an entrance and the Zamek existed on the board and
 * did nothing. Each has a printed procedure (14.5–14.6 and the boxed field text
 * at the end of the rulebook) and this is all six of them — the Zamek itself
 * already had its own fight.
 *
 * Dice may be supplied, as everywhere else, because a table with real dice on
 * it beats a table being told what it rolled.
 */
export async function resolveBridgeOrdeal(
  gameId: string,
  input: { dice?: number[]; itemRolls?: number[] } = {},
): Promise<BridgeOrdealResult> {
  return change(gameId, resolveBridgeOrdealOn, undefined, {
    random: supplied([...(input.dice ?? []), ...(input.itemRolls ?? [])], appRandom()),
  });
}

/**
 * Rule 4.4's second half: the player takes a new character and begins again.
 *
 * "Gracz, który kierował niefortunną Postacią, może wybrać sobie nową i
 * rozpocząć z nią grę od początku (z Obszaru oznaczonego jako MGR)." Death ends
 * a character, not a player's evening — and until now the app treated it as
 * both, which in a game this long is the difference between a bad turn and
 * going to make tea for two hours.
 *
 * The new character starts as any character starts: its own MGR, its printed
 * Miecz and Magia, four Życie, one Sztuka Złota and whatever it owns before
 * anybody rolls. What the dead one was carrying stays where it fell (`killSeat`
 * put it there) for whoever passes that way.
 */
export async function takeNewCharacter(
  gameId: string,
  seatId: string,
  characterId: string,
  /** The *seat* asking, not the person — `mayChooseFor` compares it to `seatId`. */
  bySeat: string,
): Promise<void> {
  const owed = await change(gameId, takeNewCharacterOn, { seatId, characterId, bySeat });
  for (let n = 0; n < owed.spells; n++) await drawSpell(gameId, owed.seatId);
}

/* ---------------------------------------------------------------------------
 * The establishments (see `fieldScript.ts`).
 *
 * These are the three verbs the trading fields need and the card scripts had no
 * way to perform: paying for a card, handing one back, and paying for wounds.
 * Every one of them checks the price against what the character actually has,
 * because the whole reason a shop is worth encoding is that "za 2 Sz. Z. miecz"
 * is arithmetic somebody at the table gets wrong.
 *
 * Prices are read off the board here rather than taken from the request. The
 * client says what it wants to buy; what it costs is not its to say, and a
 * referee that accepted a price from the player being charged would not be one.
 * ------------------------------------------------------------------------ */

/**
 * Buys one card from the shop on the field the character is standing on.
 *
 * The gold moves only if the card does. `takeCard` is what actually hands it
 * over, and it is the one that knows about 5.4's carrying limit and 21.2's
 * empty pile — so a character who cannot carry it, or a Miecz nobody has left
 * to sell, fails before anything is paid rather than after.
 */
export async function buyGoods(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<void> {
  const bought = await change(gameId, thenHold(buyGoodsFor), { seatId, cardId });
  if (bought.resolve) {
    await applyEffect(gameId, seatId, bought.resolve.effect, bought.resolve.reason);
  }
}

/**
 * Sells one held card back for gold (the Gród's Lichwiarz).
 *
 * The card is discarded rather than left on the field: "odłóż ich Karty". That
 * matters under 21.2, because a Wyposażenie card off a character's sheet is one
 * back within somebody else's reach, which `stockLeft` reads straight off the
 * copies in play.
 */
export async function sellHolding(
  gameId: string,
  seatId: string,
  holdingId: string,
): Promise<void> {
  await change(gameId, sellHoldingFor, { seatId, holdingId });
}

/**
 * Pays a healer.
 *
 * Two limits meet here and both bite: 4.7 caps healing at the four Życie a
 * character starts with, and the purse caps how many points can be paid for.
 * Asking for more than either allows is not an error — it is answered with what
 * the money and the rule between them actually buy, which is what a healer at a
 * table would say.
 *
 * The Zamek's die is deliberately not thrown here. Its "1-4 wyleczony, 5 bez
 * zmian, 6 tracisz 1 Życie" comes *after* the money changes hands, and it is
 * the field's own roll — the same one every other die table on the board goes
 * through, so it goes through the same controls rather than being hidden inside
 * a payment.
 */
export async function payHealer(
  gameId: string,
  seatId: string,
  points: number,
): Promise<{ healed: number; paid: number }> {
  return change(gameId, payHealerFor, { seatId, points });
}

/**
 * Leaves a card lying on a field, out of nowhere.
 *
 * `grantCard`'s counterpart, and the other half of the same shortcut: that one
 * reaches a state where somebody holds a card, this one a state where a card is
 * waiting to be found. 12.1's worked example is built on gear lying on a field,
 * a dead character's pack is delivered this way, and 16.8 leaves resolved
 * Spotkania there — all of it reachable before now only by playing up to it or
 * by killing somebody.
 *
 * Not a Zaklęcie. 9.6 sends a spent spell to the used pile and nothing in the
 * box puts one on the board; `dropHolding` makes the same exception, and a
 * Zaklęcie lying on a field would be a card the field modal knows how to draw
 * and no rule knows how to pick up.
 *
 * `granted` travels with it, as everywhere else: picked up by somebody, a card
 * that appeared by fiat must not re-enter the game as a real one and reach a
 * pile the next time it is put down.
 */
export async function placeCard(
  gameId: string,
  seatId: string,
  cardId: string,
  target: FieldId | null,
): Promise<FieldId> {
  return change(gameId, placeCardOn, { seatId, cardId, target });
}

/** Its money half: coins on a square, which are not a Karta — see `placeGold`. */
export async function placeGold(
  gameId: string,
  seatId: string,
  gold: number,
  target: FieldId | null,
): Promise<{ fieldId: FieldId; gold: number }> {
  return change(gameId, placeGoldOn, { seatId, gold, target });
}

/**
 * Puts a named Karta on top of its pile, so the next `draw` is that card.
 *
 * The test shortcut that does not step round anything: `give`, `place` and
 * `summon` all put a card in play by fiat, and this one puts it back in the
 * deck's own path so that what follows is the ordinary draw with the ordinary
 * 15.2 ordering and the card's own disposition.
 */
export async function stackCard(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<"events" | "spells"> {
  return change(gameId, stackForDrawOn, { seatId, cardId });
}

/**
 * The same, for a card picked off the pile by position rather than by name.
 *
 * Hands back which card it turned out to be, since the caller asked for "the
 * tenth" and wants to be told what that was.
 */
export async function stackNth(
  gameId: string,
  seatId: string,
  pile: "events" | "spells",
  at: number,
): Promise<{ pile: "events" | "spells"; cardId: string }> {
  const cardId = await change(gameId, stackAtOn, { seatId, pile, at });
  return { pile, cardId };
}

/**
 * Sweeps an Obszar clear, for a test table that dressed one and wants it back.
 *
 * The Karty and the loose gold come back separately because they went
 * separately: cards to the used pile, coins off the board (12.1 names both as
 * lying there, and nothing in the box is a pile of spent money).
 */
export async function clearField(
  gameId: string,
  seatId: string,
  fieldId: FieldId,
  cardId?: string | null,
  gold?: number | "all",
): Promise<{ cards: string[]; gold: number }> {
  return change(gameId, clearFieldOn, {
    seatId,
    fieldId,
    ...(cardId ? { cardId } : {}),
    ...(gold !== undefined && gold !== null ? { gold } : {}),
  });
}

export async function grantCard(gameId: string, seatId: string, cardId: string): Promise<void> {
  await change(gameId, thenHold(grantCardOn), { seatId, cardId });
}

export async function placeSeat(
  gameId: string,
  seatId: string,
  target: string,
  reason: string | null,
  /** Who moved the figure, which decides the arrival and the journal — see `MovedBy`. */
  by: MovedBy,
): Promise<void> {
  await change(gameId, placeSeatOn, { seatId, target, reason, by });
}

/**
 * Opens a fight with a creature a card names rather than one lying on a field.
 *
 * The Karczma's "miejscowy osiłek (Miecz 4)" is nowhere in the deck: he is a
 * line on the board with a number after him. `beginFight` starts from a card
 * id, so it cannot be used, but everything after that — the totals, the two
 * dice, 17.4's point of Życie — is the same fight.
 */

/* ---------------------------------------------------------------------------
 * Carrying an effect out.
 *
 * A simulation that rolls the die and then asks somebody to press "−1 Złota" is
 * not simulating anything; it is a die with extra steps. This is the other
 * half: the app rolls, and then it does what the roll says.
 *
 * `isSettled` draws the line. Everything that has one outcome happens here;
 * everything the rules leave to the player — a `wybor`, which Przedmiot to
 * lose, where in the Krąg to move to — is handed back so the interface can ask
 * exactly that and nothing else.
 * ------------------------------------------------------------------------ */

/**
 * Applies one effect to one seat, as far as it goes.
 *
 * Not a pure function and deliberately not in the engine: it writes seats,
 * draws Zaklęcia and opens fights. What *is* pure is the decision about whether
 * a thing can be applied at all, and that lives in `resolve.ts` where it can be
 * tested against every card in the box.
 */
export async function applyEffect(
  gameId: string,
  seatId: string,
  effect: Effect,
  reason: string,
  decided: Decisions = {},
): Promise<Resolution> {
  return change(gameId, applyEffectOn, (of) => ({
    seatId,
    effect,
    reason,
    decided,
    shuffle: shuffleFor(of.game),
  }));
}

/**
 * Rolls one of the field's die tables and does what it says.
 *
 * The whole point of a simulation: press once, and the app throws the die,
 * reads the row and applies it. What comes back is the face and a plain-words
 * account of what happened, because a player who did not see it happen has to
 * be told — and because at a table somebody always asks to see the die.
 *
 * `pending` comes back set when the face lands on something the rules leave to
 * the player: "wybierz jedno", which Przedmiot to give up, which Obszar in the
 * Krąg to move to. Then the app has done everything except the deciding, and
 * the interface asks that one question.
 */
export async function resolveFieldOffer(
  gameId: string,
  offerName: string,
  value: number | null,
  decided: Decisions = {},
): Promise<{ offer: string; face?: number; did: string[]; pending: Effect | null }> {
  return change(gameId, resolveFieldOfferOn, (of) => ({
    offerName,
    decided,
    manual: value !== null,
    shuffle: shuffleFor(of.game),
  }), { random: supplied([value], appRandom()) });
}

/**
 * Resolves a drawn card's script — the same act as rolling a field's table,
 * for the other place effects come from.
 *
 * One press per card rather than one per outcome. A card is a thing that
 * happens to you, and pressing "−1 Życia" after reading that a card takes a
 * point of Życie is transcription, not play. Optional cards keep the press,
 * because "Jeżeli chcesz" means the press is the decision.
 *
 * Only cards actually drawn this turn: the id comes from the browser, and the
 * turn state is what says which cards are on the field in front of you.
 */
export async function resolveDrawnCard(
  gameId: string,
  cardId: string,
  value: number | null,
  decided: Decisions = {},
): Promise<{ card: string; face?: number; did: string[]; pending: Effect | null }> {
  return change(gameId, resolveDrawnCardOn, (of) => ({
    cardId,
    decided,
    manual: value !== null,
    shuffle: shuffleFor(of.game),
  }), { random: supplied([value], appRandom()) });
}

/**
 * Picks a card up off the field a character is standing on (12.1).
 *
 * Distinct from `takeCard`, which lifts something out of the turn's own stack —
 * a card just drawn. This one reaches for what was already lying there: gear a
 * dead character left, something a previous visitor dropped, a Przedmiot nobody
 * could carry. Every rule about *whether* you may have it is `takeCard`'s, so
 * this establishes the right to reach and then defers.
 *
 * "Postać, której ruch kończy się na danym Obszarze" — you must be standing on
 * it, and it must be your turn, because 13.1 is explicit that nothing happens
 * on a field you merely passed through.
 */
export async function takeFromField(
  gameId: string,
  seatId: string,
  fieldCardId: string,
): Promise<void> {
  const taken = await change(gameId, takeFromFieldOn, { seatId, fieldCardId });
  if (taken.resolve) {
    await applyEffect(gameId, seatId, taken.resolve.effect, taken.resolve.reason);
  }
}

/**
 * Sztuki Złota picked up off the Obszar, as many as the player asked for (12.1).
 *
 * No `resolve` to chase, unlike a Karta: gold is not a card that turns into
 * something on being taken, it is already the thing.
 */
export async function takeFieldGold(
  gameId: string,
  seatId: string,
  gold: number,
): Promise<{ took: number }> {
  return change(gameId, takeFieldGoldOn, { seatId, gold });
}

/**
 * Stops the Wyposażenie pile running out (21.2), for good.
 *
 * One way, and the command says why — see `setEndlessStock`.
 */
export async function endlessStock(gameId: string, on: boolean): Promise<void> {
  await change(gameId, setEndlessStockOn, { on });
}
