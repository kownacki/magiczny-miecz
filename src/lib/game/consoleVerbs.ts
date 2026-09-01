/** The console's sixty-three verbs, one entry each: what a typed line actually does to a table. */

import { isFoeClass } from "@/data/types";
import {
  EFFECTS,
  PHASE,
  askLines,
  cardLines,
  catalogue,
  championLine,
  characterName,
  effectLines,
  fieldCardNamed,
  fieldName,
  fieldNamed,
  frameLabel,
  holdingNamed,
  idNamed,
  overflowLines,
  said,
  sameName,
  tradeMenu,
  trophyLedger,
  waitingOn,
} from "./consoleLines";
import { ruleLines } from "@/lib/engine/ruleLines";
import { cardIdNamed } from "@/lib/engine/lookup";

import { asFieldId, FIELDS, requireFieldId } from "@/lib/engine/board";
import { spellScript } from "@/lib/engine/spells";
import { SPELL_BY_ID, pileContents } from "./decks";
import { RANDOM_CHARACTER_ID } from "@/lib/engine/characters";
import { helpLines, statReply, type Command } from "@/lib/engine/console";
import { cardName, sztuki } from "@/lib/engine/polish";
import { shelfFor, trophyPointsOf } from "@/lib/engine/trophies";
import { carriesSpell } from "@/lib/engine/abilities";
import { foldStatuses } from "@/lib/engine/statusRows";
import { change } from "./change";
import { ADJUSTABLE, type Adjustable } from "./commands/adjust";
import { STONE_TURNS } from "./commands/stone";
import {
  claimTableScreen,
  leaveTable,
  renameUser,
  chooseCharacter,
  setReady,
  setTrophyMode,
  takeSeat,
  unseat,
} from "./lobbyStore";
import { gameById, holdingsFor, seatsFor, type SeatRow, type UserRow } from "./store";
import {
  abandonFight,
  addEffect,
  adjust,
  attackSeat,
  sendRaider,
  payFriend,
  speakCarriedSpell,
  breakFree,
  claimMission,
  beginFight,
  dropCard,
  equipCard,
  buyGoods,
  castSpell,
  crossRing,
  escape,
  healSeat,
  payHealer,
  sellHolding,
  tradeTrophies,
  fightBeast,
  fightGuardian,
  fightRoll,
  payFerry,
  rollGuardianStrength,
  changeNature,
  drawAll,
  drawSpell,
  drawSpellWithWand,
  finishTurn,
  resetTurn,
  moveTo,
  resolveDrawnCard,
  startGame,
  resolveFieldOffer,
  rollForMove,
  grantCard,
  placeCard,
  placeGold,
  placeSeat,
  removeCharacter,
  resolveFight,
  reviveCharacter,
  settleSpell,
  spendHolding,
  clearField,
  stackCard,
  stageCard,
  stackNth,
  takeCard,
  takeFieldGold,
  takeFromField,
  takeNewCharacter,
  turnToStone,
  answerAsk,
  answerScript,
} from "./turnStore";
import { activeStore } from "./gameStore";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { only, replaceTop, requireTop, top, topIf } from "@/lib/engine/stack";
import { askOnTop } from "@/lib/engine/ask";
import { eqModeOf, seatView, trophyModeOf, turnQueueOf } from "./commands/seat";
import { SLOT_LABEL, STORAGE, inPlayAt } from "@/lib/engine/slots";
import { DEALABLE, PLACEABLE } from "@/lib/engine/console";
import { figuresText } from "@/lib/engine/figures";
import { fitsIn, slotsFor, SLOTS, type Slot } from "@/lib/engine/slots";

/**
 * The third edge, beside `turnStore.ts` and `lobbyStore.ts`.
 *
 * The grammar this carries out is `engine/console.ts`'s and is pure; this is
 * the half with the database in it, and it does almost nothing of its own —
 * every branch calls the function the game itself calls, so a tested Życie is
 * lost the way a real one is and a staged fight rolls the dice real combat
 * rolls. Nothing here can quietly disagree with the rules by keeping its own
 * copy of them.
 *
 * It lived in `turnStore.ts`, which made that file the largest in the repo and
 * made two unrelated things one: the turn, and the shortcut for testing the
 * turn. They are not read together and they are not changed together, and only
 * one of them ships to a table that is actually playing.
 */

/**
 * Who is typing, which is now two facts rather than one.
 *
 * A person and the Postać they drive are different rows with different
 * lifetimes, and the console needs both: `kill` and `go` are about a figure on
 * the board, `kick` and `leave` are about somebody in the room. `seatId` is
 * null for a spectator, and the commands that need one say so themselves.
 */

export interface Actor {
  userId: string;
  seatId: string | null;
}

/**
 * Carries out one line from the test console.
 *
 * The grammar is in `console.ts` and is pure; this is the half with the
 * database in it, and it does almost nothing of its own — every command calls
 * the function the game itself calls, so a tested Życie is lost the way a real
 * one is, a staged fight rolls the dice the real combat rolls, and nothing here
 * can quietly disagree with the rules by having its own copy of them.
 *
 * Returns the line to print back. Refusals come up as thrown errors, which the
 * route turns into the same message any other refusal gets.
 *
 * # Which language a reply is in
 *
 * English, all of it — this is a terminal and the engine's own surface. What
 * stays Polish is what the *box* says: the journal, which is the record a
 * player reads back, and the name of anything printed on a component. So a
 * sentence is English and the things it names are not, which is the rule
 * `console.ts` already draws for what you type: `gold +5` and `pick MAGOG`.
 *
 * That is why `Postać`, `Zaklęcie`, `Obszar` and `Miecz` are in English
 * sentences here and are not translated. They are what the thing is called.
 */

/**
 * Everything a verb is given: the table it acts on, who typed the line, and
 * the handful of lookups that answer "which seat did they mean".
 *
 * This was the 190-line preamble of `runCommand` — closures the switch beneath
 * it read and nothing else could. `runCommand` builds one and hands it down.
 */
export interface ConsoleContext {
  gameId: string;
  actor: Actor;
  seats: SeatRow[];
  people: UserRow[];
  driver: (seatIndex: number) => UserRow | null;
  seatOf: (who: string | null) => SeatRow;
  userOf: (who: string | null) => UserRow;
  seatByNumber: (printed: number) => SeatRow;
  pickedSeat: (printed: number | null, characterId: string | null) => SeatRow;
  named: (seat: { seat_index: number }) => string;
  turnMoved: (passedTo: number | null) => string;
  roster: () => Promise<string>;
}

type VerbRun<K extends Command["kind"]> = (
  ctx: ConsoleContext,
  command: Extract<Command, { kind: K }>,
) => Promise<string> | string;

/**
 * One entry per verb, carried out.
 *
 * The same shape `commands/ops.ts` uses and for the same reason: these were 63
 * arms of one 1,500-line switch inside `runCommand`, each independent of the
 * others and reachable only through it. A `Record` keyed on `Command["kind"]`
 * makes a verb the compiler has not been told how to run a build error at this
 * table, rather than a `default` that throws at a prompt.
 *
 * One file rather than a directory, as with the ops: the entries do not depend
 * on one another, and any grouping — by `Group`, by what they touch — would be
 * a second taxonomy to keep in step with `engine/console.ts`'s.
 */
export const VERBS: { [K in Command["kind"]]: VerbRun<K> } = {
  help: async (_ctx, command) => {
    return helpLines(command.about).join("\n");
  },

  stat: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    /**
     * `=12` is worked into a change here, where the current value is.
     *
     * The store has one verb for a tracked number and it is "move it by": the
     * floor, the ceiling and the journal line are all written in terms of
     * what moved, and a second verb that assigns would need its own copy of
     * every one of them. So the difference lives exactly as long as it takes
     * to subtract — and everything downstream, the clamp included, goes on
     * working the way it does for a `+1`.
     */
    const standing = (seat as unknown as Record<string, number>)[ADJUSTABLE[command.stat]];
    const delta = command.set === null ? command.delta : command.set - standing;
    if (delta === 0) return `${named(seat)}: ${command.stat} is already ${standing}.`;
    /**
     * No reason string. The journal draws every manual row with "tryb
     * testowy" beside it already, so passing the same words as the reason
     * printed them twice — three times on a forced line, which also carries
     * its own "wymuszone". What the console does is marked by the flag; the
     * sentence should say what happened, once.
     */
    const done = await adjust(
      gameId,
      seat.id,
      command.stat as Adjustable,
      delta,
      null,
      undefined,
      command.force,
    );
    // The sentence is `statReply`'s, in the pure half, and it is written
    // against `moved` rather than against the delta: a change the floor
    // swallowed used to be reported as though it had happened.
    return statReply({
      who: named(seat),
      stat: command.stat,
      asked: delta,
      moved: done.moved,
      now: done.to,
      floor: done.floor,
      forced: command.force,
    });
  },

  kill: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    if (seat.eliminated) return `${named(seat)} już nie żyje.`;
    // Through the same door a lost fight goes through, so what a death does
    // to a character — its cards on the field, its Zaklęcia spent, the turn
    // handed on — happens here too (4.4).
    await adjust(gameId, seat.id, "life", -seat.life, null);
    return `${named(seat)} ginie.`;
  },

  /* ----------------------------------------------------------------------
   * People. Everything below acts on somebody rather than on a Postać.
   * ------------------------------------------------------------------- */
  /**
   * The whole table in one answer: seats, Postacie, drivers and ids.
   *
   * The only command here that reads rather than writes, and the reason the
   * rest of them are typeable at all — `kick`, `seat` and `host` all want a
   * handle on somebody, and a spectator has exactly one: the four characters
   * printed here. Everything else on the line is on the screen already; the
   * id is not, because it is not a thing a player has any use for until
   * somebody has to be pointed at.
   */
  who: async (ctx) => {
    const { roster } = ctx;
    return roster();
  },

  unseat: async (ctx, command) => {
    const { gameId, userOf, turnMoved } = ctx;
    const user = userOf(command.who);
    if (user.seat_index === null) return `${user.name} is not driving anything.`;
    const { passedTo } = await unseat(gameId, user.id);
    return `${user.name} is out of seat ${user.seat_index + 1}; the Postać stays.${turnMoved(
      passedTo,
    )}`;
  },

  /**
   * Somebody sits down, which is the one door into a seat.
   *
   * The number is checked against the seats that exist before the command is
   * asked, because a person's `seat_index` is only refused by the rules for
   * being *somebody else's* — nothing in there says the chair has to be
   * there at all, and a typo would otherwise seat somebody in seat 47.
   */
  seat: async (ctx, command) => {
    const { gameId, userOf, seatByNumber, named } = ctx;
    const user = userOf(command.who);
    const seat = seatByNumber(command.seat);
    await takeSeat(gameId, user.id, seat.seat_index);
    return `${user.name} drives ${named(seat)}${
      seat.character_id ? ` — ${characterName(seat.character_id)}` : ""
    }.`;
  },

  /**
   * Off the table, by somebody else's decision.
   *
   * The Postać is untouched: it is not theirs to take away, and 4.4 is the
   * only thing in the book that removes one. What goes is the person — and
   * the journal records that they were thrown off rather than that they
   * walked, which is the difference `leave` exists to draw.
   */
  kick: async (ctx, command) => {
    const { gameId, userOf, turnMoved } = ctx;
    const user = userOf(command.who);
    const { passedTo } = await leaveTable(gameId, user.id, true);
    return `${user.name} is off the table.${turnMoved(passedTo)}`;
  },

  /** The same exit, by your own choice. Only ever yourself — see the grammar. */
  leave: async (ctx) => {
    const { gameId, userOf, turnMoved } = ctx;
    const me = userOf(null);
    const { passedTo } = await leaveTable(gameId, me.id, false);
    return `${me.name} leaves the table.${turnMoved(passedTo)}`;
  },

  rename: async (ctx, command) => {
    const { gameId, userOf } = ctx;
    const user = userOf(command.who);
    const was = user.name;
    await renameUser(gameId, user.id, command.name);
    return `${was} is now ${command.name.trim()}.`;
  },

  /**
   * The host role handed over.
   *
   * Handed over *by the host*, whoever typed it. `takeHostRole` refuses
   * anybody else while the host is present and it is right to — there is no
   * co-host — but this console is the one caller deliberately allowed to be
   * anybody, exactly as `pick` is: a tester driving four people from one
   * browser is every one of them at once.
   */
  host: async (ctx, command) => {
    const { gameId, actor, people, userOf } = ctx;
    const user = userOf(command.who);
    const host = people.find((one) => one.is_host);
    await claimTableScreen(gameId, user.id, host?.id ?? actor.userId);
    return `${user.name} runs the table.`;
  },

  /* ----------------------------------------------------------------------
   * Postacie in and out of the game (4.4).
   * ------------------------------------------------------------------- */
  /**
   * A Postać out of the game, named by its seat or by what is printed on it.
   *
   * The console passes `byUser: null`, which is what lets it take a *dead* one
   * off 4.4's list — a host may only withdraw a Postać that is still playing.
   * Both are journalled `manual`, because both are breaks in a rulebook that
   * removes a Postać exactly once and never puts one back.
   */
  remove: async (ctx, command) => {
    const { gameId, pickedSeat } = ctx;
    const seat = pickedSeat(command.seat, command.characterId);
    const { characterId, returned } = await removeCharacter(gameId, seat.id, command.hard, null);
    const spilled =
      returned.length === 0
        ? ""
        : ` Back on the piles: ${returned.map((id) => cardName(id)).join(", ")}.`;
    return `${characterName(characterId)} is out of the game${
      command.hard ? " for good" : " — the Karta goes back in the pool"
    }.${spilled}`;
  },

  /** The undo for a death that should not have happened. */
  revive: async (ctx, command) => {
    const { gameId, pickedSeat } = ctx;
    const seat = pickedSeat(command.seat, command.characterId);
    const back = await reviveCharacter(gameId, seat.id);
    return `${characterName(back)} stands up again on ${fieldName(seat.field_id)}.`;
  },

  /**
   * A Karta happens to you, exactly as if it had come off the top.
   *
   * One path for all six classes, because `draw` is one path for all six
   * classes: the card joins the turn and resolves the way its class resolves
   * — a Wróg attacks (16.2), a Spotkanie is obeyed (16.1), a Przedmiot is
   * offered and you `take` it (16.6). The two verbs this replaced put a card
   * where *they* thought it should go, which is why one of them could not
   * take a Wróg and neither could take a Spotkanie.
   *
   * The Zaklęcia are the one exception and not a special case: they are a
   * different pile, and 9.5 deals one into a hand rather than onto an Obszar.
   * Dealt face down, like every other (9.3).
   *
   * Nothing leaves a pile either way — see `stackCard` for when you want that.
   */
  deal: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    if (command.cardId === null) return catalogue(DEALABLE);
    const seat = seatOf(null);
    if (SPELL_BY_ID.has(command.cardId)) {
      await grantCard(gameId, seat.id, command.cardId);
      return `${named(seat)} draws ${cardName(command.cardId)}.`;
    }
    await stageCard(gameId, seat.id, command.cardId);
    return `Dealt: ${cardName(command.cardId)}.`;
  },

  /**
   * An Obszar swept clear — the inverse of `place`, and of a `deal` whose
   * Karta has since settled there.
   */
  clear: async (ctx, command) => {
    const { gameId, seatOf } = ctx;
    const seat = seatOf(null);
    const where = command.fieldId ?? seat.field_id;
    if (!where) throw new Error("Postać nie stoi na żadnym polu.");
    const gone = await clearField(
      gameId,
      seat.id,
      requireFieldId(where),
      command.cardId,
      command.gold ?? undefined,
    );
    if (command.cardId) return `${cardName(command.cardId)} off ${fieldName(asFieldId(where))}.`;
    // Named on its own, the money is the whole answer: a line reporting "0 Kart
    // on the used pile" alongside would be counting something nobody asked
    // about.
    if (command.gold !== null) {
      return `${sztuki(gone.gold)} off ${fieldName(asFieldId(where))}.`;
    }
    // The Karty and the loose gold are two different fates and the line says
    // both: cards go to the used pile (9.5 deals them again), coins simply go.
    const cards = `${gone.cards.length} ${gone.cards.length === 1 ? "Karta" : "Kart"} on the used pile`;
    const coins = gone.gold > 0 ? `, ${gone.gold} gold off the board` : "";
    return `${fieldName(asFieldId(where))} swept — ${cards}${coins}.`;
  },

  place: async (ctx, command) => {
    const { gameId, seatOf } = ctx;
    // Money is not a Karta and does not go through the catalogue: `place gold 5`
    // puts coins on the square, `place 2 SZTUKI ZŁOTA` puts down the Przedmiot
    // of that name, which becomes coins only when somebody takes it.
    if (command.gold !== null) {
      const seat = seatOf(null);
      const put = await placeGold(gameId, seat.id, command.gold, command.fieldId);
      return `${sztuki(put.gold)} on ${fieldName(put.fieldId)}.`;
    }
    // Bare, the same answer bare `deal` gives, minus the one class that never
    // lies on an Obszar: a Zaklęcie is its own pile and goes to a hand (9.5).
    if (command.cardId === null) return catalogue(PLACEABLE);
    const seat = seatOf(null);
    const where = await placeCard(gameId, seat.id, command.cardId, command.fieldId);
    return `${cardName(command.cardId)} lies on ${FIELDS.get(where)?.name ?? where}.`;
  },

  nature: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    // By hand always, forced only when asked: a Natura somebody typed does
    // not use up the character's one change of the turn, but a change the
    // *game* made this turn still refuses until `force` says otherwise.
    await changeNature(gameId, seat.id, command.nature, command.force, true);
    // 7.4 by way of 5.5 used to be spelled out here, card by card — the
    // command hands back which holdings the new Natura may not keep. The
    // slots say it themselves now, going red where the cards lie, so the line
    // is back to reporting the one thing it did.
    return `${named(seat)} is ${command.nature}.`;
  },

  /**
   * A seat that died taking a character again (4.4).
   *
   * The same door the reborn modal goes through, which is the point: the
   * modal is on the dead player's own device, and a tester driving four seats
   * from one browser cannot reach it. Naming a character is the reason this
   * is worth a command at all — a particular Charakterystyka is otherwise
   * reachable only by re-dealing the whole table.
   */
  pick: async (ctx, command) => {
    const { gameId, seatOf, seatByNumber, named } = ctx;
    const seat = command.seat === null ? seatOf(null) : seatByNumber(command.seat);
    const wanted = command.characterId ?? RANDOM_CHARACTER_ID;
    /**
     * Two different acts, and the console used to reach for the second one
     * for both.
     *
     * Choosing in the poczekalnia is `chooseCharacter`; taking a new Postać
     * after a death is 4.4's `takeNewCharacter`, which refuses a seat whose
     * Postać is still alive. So the console could not change its mind before
     * the game began, and `pick LOSOWA` drew a Karta and named it out loud —
     * where the browser's Losowa stays face down until `startGame`, which is
     * the whole point of it.
     *
     * The console acts as the seat it is naming, in both: this is the test
     * shortcut, and refusing it on `mayChooseFor` would refuse the one caller
     * deliberately allowed to be anybody.
     */
    if ((await activeStore().load(gameId)).game.status === "lobby") {
      await chooseCharacter(gameId, seat.id, wanted, seat.id);
    } else {
      await takeNewCharacter(gameId, seat.id, wanted, seat.id);
    }
    const after = (await seatsFor(gameId)).find((one) => one.id === seat.id);
    return `${named(seat)} plays ${characterName(after?.character_id ?? null)}.`;
  },

  /**
   * The three things anybody does to a turn: hand it on, start it over, or
   * walk play round to somebody.
   *
   * One handler because it is one word now — see the `turn` Command. The two
   * acts that overrule the rules are locked by `needsOf`, not here: a verb
   * decides what it does, and `permits` decides who may.
   */
  turn: async (ctx, command) => {
    const { gameId, seats, seatOf, named } = ctx;

    if (command.act === "end") {
      // The turn does not always pass: a surplus opens a frame instead, and
      // saying "Turn passed" over one would be the console announcing the
      // opposite of what it just did. Forced, it always passes — that is what
      // the word buys — so the frame is never the answer.
      if ((await finishTurn(gameId, command.force)) === "passed") {
        return command.force ? "Turn passed — forced." : "Turn passed.";
      }
      return overflowLines(await activeStore().load(gameId)).join("\n");
    }

    /**
     * The same seat, the same turn, from the beginning.
     *
     * `turn end force` and `turn <player>` both cost a circuit of the table —
     * the round advances and every countdown ticks — which is a different
     * table from the one being tested.
     */
    if (command.act === "reset") {
      await resetTurn(gameId);
      return `${named(seatOf(null))} starts this turn again — rzut.`;
    }

    /**
     * Hands play round until it is somebody's turn.
     *
     * By passing, not by writing `active_seat`: 10.1's order is not a number
     * to be set, and going round properly is what spends the lost turns, ticks
     * the effects, leaves the drawn cards on their field and advances the
     * counter that 20.1 measures stone in. So a seat that is stoned is reached
     * by the stone running out, which is the honest answer to asking for its
     * turn.
     *
     * Bounded, because a seat can be unreachable — eliminated, or a table
     * where everybody owes turns. The bound is generous enough to outlast
     * three turns of stone and is a backstop rather than the exit.
     */
    const seat = seatOf(command.who);
    if (!seat.character_id) throw new Error(`${named(seat)} has no character.`);
    if (seat.eliminated) throw new Error(`${named(seat)} is dead — try \`revive\`.`);
    const players = seats.filter((s) => s.character_id && !s.eliminated).length;
    for (let pass = 0; pass <= players * 8; pass++) {
      const game = await gameById(gameId);
      if (game.active_seat === seat.seat_index) {
        return pass === 0
          ? `It is already ${named(seat)}'s turn.`
          : `${named(seat)} to play — ${pass} ${pass === 1 ? "turn" : "turns"} passed.`;
      }
      await finishTurn(gameId);
    }
    throw new Error(`Could not reach ${named(seat)} — stone, or turns owed all round.`);
  },

  stone: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    await turnToStone(gameId, seat.id);
    return `${named(seat)} is stone for ${STONE_TURNS} turns (20.1).`;
  },

  /**
   * The three states a card makes and nothing else does.
   *
   * Written through `addEffect`, so each one is the same row the card would
   * have written and is read by the same code — the cap consulted when a die
   * is rolled for a move, the freeze the turn order skips, 11.11's refusal at
   * the bridge. Ending after one of the holder's own turns, because a test
   * that has to be undone by hand is one somebody forgets to undo.
   */
  effect: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    const { label, modifier } = EFFECTS[command.effect];
    await addEffect(gameId, seat.id, {
      source: "tryb testowy",
      label,
      modifier,
      ends: { kind: "turns", turns: 1 },
    });
    return `${named(seat)}: ${label}.`;
  },

  /**
   * Somewhere else on the board, and the turn goes on there (13.1).
   *
   * An arrival rather than a correction: what lies on the Obszar comes into
   * the turn and what it prints is owed, so `draw` works and the Obszar can be
   * explored. Otherwise the commonest thing a tester does — put the figure on
   * the square they want to see — left them standing on it with `draw`
   * refusing, „ten Obszar daje 1 — tyle już tu leży albo wyciągnięto".
   *
   * The position *override* is the other reading and keeps it: correcting a
   * desync must not spend Karty on a move nobody made.
   */
  teleport: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    await placeSeat(gameId, seat.id, command.fieldId, null, "konsola");
    return `${named(seat)} stands on ${FIELDS.get(command.fieldId)?.name ?? command.fieldId}.`;
  },

  /* ----------------------------------------------------------------------
   * Shops, healers and Zaklęcia.
   * ------------------------------------------------------------------- */
  buy: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const card = idNamed(command.name);
    await buyGoods(gameId, seat.id, card);
    return `${named(seat)} buys ${cardName(card)}.`;
  },

  sell: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const held = await holdingNamed(gameId, seat.id, command.name);
    await sellHolding(gameId, seat.id, held.id);
    return `${named(seat)} sells ${cardName(held.card_id)}.`;
  },

  /**
   * A point of Życie back, or several bought from a healer.
   *
   * Two different acts share the word because from where somebody is sitting
   * there is one — "put a point back" — and whether it is free or paid for is
   * the Obszar's business. A number means the healer, since that is the only
   * one you can buy more than one of.
   */
  heal: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const now =
      command.points === null
        ? await healSeat(gameId, seat.id)
        : await payHealer(gameId, seat.id, command.points);
    return `${named(seat)} — ${typeof now === "number" ? now : "?"} Życia.`;
  },

  cast: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const held = await holdingNamed(gameId, seat.id, command.name);
    /**
     * What comes after `at` is whatever the Zaklęcie is aimed at.
     *
     * Three kinds, and the card says which: a Postać for most of them, an
     * Obszar for the Władca Gromu, a Karta lying on the board for the Siewca
     * Spustoszenia and the Władca Zdarzeń. Read off the spell rather than
     * guessed from the word, so `cast WŁADCA GROMU at Karczma` and `cast
     * SIEWCA at CYKLOP` both mean what they say.
     */
    const aim = spellScript(held.card_id)?.target;
    /**
     * The creature standing opposite, which is not a Karta on the board.
     *
     * A Wróg in a fight may be one a Karta conjured or 17.5's pack fighting
     * as one, so `fieldCardNamed` cannot find him and `seatOf` would go
     * looking for a player of that name. Matched off the frame instead —
     * which is also the only handle the server has for him (law 4).
     */
    const inFight = top((await activeStore().load(gameId)).game.turn_state);
    const atTheFoe =
      command.who !== null &&
      inFight.phase === "fight" &&
      inFight.fight.cardName.toLowerCase().startsWith(command.who.toLowerCase());

    const at =
      command.who && !atTheFoe && aim !== "obszar" && aim !== "karta-na-planszy"
        ? seatOf(command.who)
        : null;
    const onField =
      command.who && aim === "obszar" ? requireFieldId(fieldNamed(command.who)) : null;
    const onCard =
      command.who && !atTheFoe && aim === "karta-na-planszy"
        ? await fieldCardNamed(gameId, command.who)
        : null;
    /**
     * And where it goes, for the card that puts down what it picks up.
     *
     * The Władca Zdarzeń is the only Zaklęcie that asks a second question,
     * and the cast is refused until it is answered — so `to` is not a
     * convenience here, it is the other half of the card.
     */
    const goesTo = command.to ? requireFieldId(fieldNamed(command.to)) : null;
    const done = await castSpell(
      gameId,
      seat.id,
      held.id,
      {
        ...(at ? { seatIndex: at.seat_index } : {}),
        ...(onField ? { fieldId: onField } : {}),
        ...(onCard ? { fieldCardId: onCard.id } : {}),
        ...(atTheFoe ? { foeInFight: true as const } : {}),
      },
      goesTo ? { destination: goesTo } : {},
    );
    /**
     * What happened where the app carried the Zaklęcie out, and the card's
     * own sentence where it did not.
     *
     * Printing the prose for both made an applied spell look exactly like an
     * announced one — "Ofiara rzuca kostką: 1 — Kamień; …" reads as an
     * instruction to the table whether or not the die has already been
     * thrown, and thirteen of them have now.
     */
    const aimed =
      (atTheFoe && inFight.phase === "fight"
        ? ` at ${inFight.fight.cardName}`
        : at
        ? ` at ${named(at)}`
        : onField
          ? ` at ${fieldName(onField)}`
          : onCard
            ? ` at ${cardName(onCard.card_id)}`
            : "") + (goesTo ? ` to ${fieldName(goesTo)}` : "");
    return [
      `${named(seat)} casts ${done.spell}${aimed}.`,
      ...(done.did && done.did.length > 0 ? done.did : done.effect ? [done.effect] : []),
    ].join("\n");
  },

  /**
   * The other end of the pause a cast opens.
   *
   * A Zaklęcie waits while anybody at the table could answer it, and this is
   * the table saying nobody will — the same shortcut `release` gives a claim
   * on the floor. It also happens on its own when the window closes, so with
   * nothing waiting this is not an error, it is nothing to do.
   */
  endcast: async (ctx) => {
    const { gameId } = ctx;
    const done = await settleSpell(gameId, true);
    return done ? [`${done.spell} takes effect.`, ...(done.did ?? [])].join("\n") : "Nothing is in the air.";
  },

  trade: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    /**
     * Names are matched the way every other card name is, so a player types
     * what is printed rather than an id. Naming nothing trades everything.
     */
    const chosen = command.cards.map((name) => {
      const found = cardIdNamed(name);
      if ("id" in found) return found.id;
      if ("candidates" in found) {
        throw new Error(`Which one — ${found.candidates.join(", ")}?`);
      }
      throw new Error(`No card called \`${name}\`.`);
    });

    const gained = await tradeTrophies(gameId, seat.id, {
      ...(command.swords !== null ? { swords: command.swords } : {}),
      ...(chosen.length ? { cardIds: chosen } : {}),
    });
    return gained > 0
      ? `${named(seat)} trades trophies for ${gained} Miecz${gained === 1 ? "" : "e"}.`
      : `${named(seat)} has nothing to trade.`;
  },

  /**
   * Which way this table keeps a beaten Wróg (1.4). See docs/TROFEA.md.
   *
   * Reading it needs no seat and no turn, so a bare `trophies` answers from
   * the poczekalnia as well as mid-game — which is the point of asking: the
   * one moment you can still change it is the one moment the answer is not
   * yet on any card.
   */
  trophies: async (ctx, command) => {
    const { gameId } = ctx;
    const snapshot = await activeStore().load(gameId);
    if (command.mode === null) {
      const mode = trophyModeOf(snapshot.game);
      const how =
        mode === "cards"
          ? "the Karty are kept and handed in (as printed)"
          : "Wrogowie are scored and the Karty go back to the pile";
      /**
       * What can still be done about it, which is not symmetric once the game
       * is running: „Karty pokonanych" can still become „Punkty", because
       * every held Karta carries its own value, and nothing can go back.
       */
      const may =
        snapshot.game.status === "lobby"
          ? ""
          : mode === "cards"
            ? " — the game has started; `trophies points` still converts, but not back."
            : " — the game has started, so it stands.";
      return `Trophies: ${mode} — ${how}${may}`;
    }
    await setTrophyMode(gameId, command.mode);
    return `Trophies: ${command.mode}.`;
  },

  /**
   * The Bestia, which is how the game is won (14.7, 22).
   *
   * Four dice — the kind of fight, its strength, and one each — and all four
   * are the app's, so this is one line where the browser walks four presses.
   * 10.5 makes it compulsory once announced; there is no backing out, which
   * is why nothing here offers one.
   */
  beast: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    await fightBeast(gameId, null, null, null, null);
    const after = (await activeStore().load(gameId)).game;
    if (after.status === "finished") return `${named(seat)} beats the Bestia. That is the game.`;
    const now = (await seatsFor(gameId)).find((one) => one.id === seat.id);
    return now?.eliminated
      ? `${named(seat)} loses to the Bestia and dies (14.7, 4.4).`
      : `${named(seat)} loses to the Bestia — 2 Życia, and off the Most (14.7).`;
  },

  /**
   * Turning off the ring onto the Kamienny Most (11.10).
   *
   * A move rather than a thing of its own: the bridge is taken *in passing*,
   * so it arrives as one of the destinations a roll reaches and is told apart
   * from the plain walk by intent rather than by where it lands. That is why
   * `moveTo` has a `viaBridge` at all, and why this verb is really "take the
   * one option that is the bridge".
   *
   * `enterBridge` is the other door and is companion mode's: it takes an
   * outcome a table already fought for.
   */
  bridge: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const state = top((await activeStore().load(gameId)).game.turn_state) as {
      options?: { fieldId: string; fieldName: string; bridge?: unknown }[];
    };
    const offered = (state.options ?? []).find((one) => one.bridge !== undefined);
    if (!offered) throw new Error("Nie ma stąd wejścia na Most.");
    await moveTo(gameId, offered.fieldId, true);
    return `${named(seat)} turns onto the Most at ${offered.fieldName}.`;
  },

  cross: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const done = await crossRing(gameId, command.to ? { to: command.to } : {});
    const rolled = done.dice ? ` (${done.dice.join("+")} against Magia ${done.magia})` : "";
    return done.to
      ? `${named(seat)} crosses to ${fieldName(asFieldId(done.to))}.${rolled}`
      : `${named(seat)} does not get across.${rolled}`;
  },

  guardian: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    await fightGuardian(gameId);
    return `${named(seat)} squares up to what is in the way.`;
  },

  ferry: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const { at } = await payFerry(gameId, command.pay);
    return command.pay
      ? `${named(seat)} pays the Przeprawa and lands on ${fieldName(asFieldId(at))}.`
      : `${named(seat)} does not pay, and goes back to ${fieldName(asFieldId(at))}.`;
  },

  /* ----------------------------------------------------------------------
   * What you carry. A holding's id is a uuid, so everything here is named by
   * the card and resolved against what this seat is actually holding.
   * ------------------------------------------------------------------- */
  /**
   * Off the turn's draw, or off the Obszar you are standing on.
   *
   * One verb for both because from where somebody is sitting there is one
   * act — that card, into my hands — and which pile the app is holding it in
   * is the app's business. The browser has two buttons because it draws the
   * two places differently.
   */
  take: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const snapshot = await activeStore().load(gameId);

    /**
     * Loose gold, which 12.1 names beside the Karty and which no `name` can
     * find: coins have no name, and „all" is the reading a bare `take gold`
     * gets because that is what a hand does at a table.
     *
     * `takeFieldGold` is the same door the Obszar's „weź" goes through, so the
     * three conditions in 12.1 are checked once, in the command, and the
     * console cannot quietly get a laxer version of them.
     */
    if (command.name === null) {
      const lying = snapshot.fieldGold.find((one) => one.field_id === seat.field_id);
      const want = command.gold ?? lying?.gold ?? 0;
      const took = await takeFieldGold(gameId, seat.id, want);
      return `${named(seat)} takes ${sztuki(took.took)} off the Obszar.`;
    }

    const state = top(snapshot.game.turn_state) as {
      drawn?: { cardId: string }[];
      resolved?: string[];
    };

    const drawn = (state.drawn ?? []).filter(
      (one) => !(state.resolved ?? []).includes(one.cardId),
    );
    const hitDrawn = drawn.find((one) => sameName(one.cardId, command.name));
    if (hitDrawn) {
      await takeCard(gameId, seat.id, hitDrawn.cardId);
      return `${named(seat)} takes ${cardName(hitDrawn.cardId)}.`;
    }

    const here = snapshot.fieldCards.filter((one) => one.field_id === seat.field_id);
    const hitField = here.find((one) => sameName(one.card_id, command.name));
    if (!hitField) throw new Error(`Nothing here called \`${command.name}\`.`);
    await takeFromField(gameId, seat.id, hitField.id);
    return `${named(seat)} takes ${cardName(hitField.card_id)} off the Obszar.`;
  },

  putdown: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const held = await holdingNamed(gameId, seat.id, command.name);
    await dropCard(gameId, held.id);
    return `${named(seat)} puts ${cardName(held.card_id)} down.`;
  },

  use: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const held = await holdingNamed(gameId, seat.id, command.name);
    const done = await spendHolding(gameId, held.id);
    return [`${named(seat)} uses ${cardName(held.card_id)}.`, ...(done.did ?? [])].join("\n");
  },

  equip: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const held = await holdingNamed(gameId, seat.id, command.name);
    /**
     * The place is worked out from the card, and only asked for when it
     * genuinely fits two — `slotsFor` already knows, so making somebody name
     * a slot for a Hełm would be asking a question with one answer.
     */
    const fits = slotsFor(held.card_id);
    if (command.slot === null && fits.length > 1) {
      throw new Error(`Where — ${fits.join(", ")}?`);
    }
    const slot = (command.slot ?? fits[0] ?? null) as Slot | null;
    if (slot !== null && !fitsIn(held.card_id, slot)) {
      throw new Error(`${cardName(held.card_id)} does not go in ${slot}.`);
    }
    await equipCard(gameId, held.id, slot);
    if (slot === null) return `${named(seat)} carries ${cardName(held.card_id)}.`;
    // Putting a Karta away is not wearing it — the one place in this list
    // that is not somewhere on a character.
    return STORAGE.includes(slot)
      ? `${named(seat)} puts ${cardName(held.card_id)} away — ${SLOT_LABEL[slot]}.`
      : `${named(seat)} wears ${cardName(held.card_id)} — ${slot}.`;
  },

  /* ----------------------------------------------------------------------
   * Encounters, played rather than decided. `summon` and `settle` below are
   * the testmode pair: one conjures a Wróg, the other writes an outcome. The
   * three here do neither — they throw the dice the rules throw.
   * ------------------------------------------------------------------- */
  /**
   * A fight, from squaring up to the result, in one line.
   *
   * The browser walks this in four presses — begin, the player's die, the
   * enemy's, then settle — because each of them is a number the table wants
   * to watch appear. At a prompt that would be four lines to learn and three
   * of them with nothing to decide, so the die rolls and the answer comes
   * back. Every step is still the function the browser calls, so a fight
   * typed here and a fight clicked there are the same fight.
   */
  fight: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const snapshot = await activeStore().load(gameId);
    // Already in one — the dice are what is owed, not another opponent.
    const field = topIf(snapshot.game.turn_state, "field");
    if (field) {
      const waiting = (field.drawn ?? []).filter(
        (one) => isFoeClass(one.cardClass) && !(field.resolved ?? []).includes(one.cardId),
      );
      if (waiting.length === 0) throw new Error("No Wróg here to fight.");
      const wanted = command.cardId
        ? waiting.filter((one) => one.cardId === command.cardId)
        : waiting;
      if (wanted.length === 0) throw new Error(`${cardName(command.cardId ?? "")} is not here.`);
      if (wanted.length > 1 && !command.cardId) {
        throw new Error(`Which one — ${wanted.map((one) => cardName(one.cardId)).join(", ")}?`);
      }
      await beginFight(gameId, [wanted[0].cardId]);
    }

    /**
     * A guardian's strength first, where the board makes it a roll.
     *
     * Both bridge entrances print a die table rather than a number, and
     * `afterFightRoll` refuses to compare until that die has landed — so
     * rolling the two combat dice before it silently did nothing and the
     * fight could not be settled. It is owed only sometimes, which is why it
     * is asked for here rather than by the verb that starts the fight: every
     * fight comes through this line, and only some of them owe it.
     */
    const owed = topIf((await activeStore().load(gameId)).game.turn_state, "fight");
    if (owed?.fight.strengthRoll === null) await rollGuardianStrength(gameId, null);

    // Null on both, because the app throws its own dice in simulation.
    await fightRoll(gameId, "player", null);
    await fightRoll(gameId, "enemy", null);

    const after = topIf((await activeStore().load(gameId)).game.turn_state, "fight");
    const fight = after?.fight;
    if (!fight) return "The fight is over.";
    const mine = fight.playerTotal + (fight.playerRoll ?? 0);
    const theirs = fight.enemyTotal + (fight.enemyRoll ?? 0);
    const said =
      `${named(seat)} ${mine} (${fight.playerTotal}+${fight.playerRoll ?? 0})` +
      ` vs ${fight.cardName} ${theirs} (${fight.enemyTotal}+${fight.enemyRoll ?? 0})`;

    const OUTCOME = { wygrana: "won", przegrana: "lost", remis: "drawn" } as const;
    const outcome = fight.result ? OUTCOME[fight.result.outcome] : "unsettled";

    /**
     * A won duel stops here and waits, because 17.9 gives the winner a choice
     * and the winner cannot make it before they have won.
     *
     * "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia …
     * lub zabrać mu jeden Przedmiot albo Sztukę Złota." Every other fight
     * settles itself: there is nothing to choose against a Karta, because a
     * Wróg has no purse and no pack and 1.4 already says what a beaten one is
     * worth. So this is the only fight that takes two presses, which is also
     * the shape the browser has had all along — `fight-done` is its own
     * button there.
     */
    if (fight.opponentSeat !== undefined && fight.result?.outcome === "wygrana") {
      return `${said} — ${outcome}. \`spoils\` to take it: bare for the Życie, \`zloto\`, or a Przedmiot by name (17.9).`;
    }

    await resolveFight(gameId);
    const ended = topIf((await activeStore().load(gameId)).game.turn_state, "fight");
    return `${said} — ${outcome}.${ended ? " Still fighting." : ""}`;
  },

  escape: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    // Null: the app rolls. A reported number is companion mode's.
    const fled = await escape(gameId, null);
    return fled.succeeded
      ? `${named(seat)} slips away.${fled.onBridge ? " Back off the Most." : ""}`
      : `${named(seat)} does not get away.`;
  },

  attack: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    await attackSeat(gameId, seat.id);
    return `${named(seatOf(null))} attacks ${named(seat)}.`;
  },

  claim: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const took = await claimMission(gameId);
    return `${named(seat)} completes the misja and receives ${took}.`;
  },

  free: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const out = await breakFree(gameId);
    return out.freed.length > 0
      ? `${named(seat)} rolls ${out.die} and breaks free.`
      : `${named(seat)} rolls ${out.die} — still held.`;
  },

  ask: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const said = await speakCarriedSpell(gameId);
    return `${named(seat)}: ${said.spell}${said.effect ? ` — ${said.effect}` : ""}`;
  },

  pay: async (ctx) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const paid = await payFriend(gameId);
    return `${named(seat)} pays ${cardName(paid)} for this turn.`;
  },

  raid: async (ctx, command) => {
    const { gameId, seats, driver, seatOf, named } = ctx;
    /**
     * "zaatakował Postać lub Wroga" — so a name here is either, and which one
     * is settled by looking. A player is tried first because that is the
     * commoner target and the names cannot collide: a Postać is somebody at
     * the table, and a Wróg is a card lying on the board.
     */
    const me = seatOf(null);
    const snapshot = await activeStore().load(gameId);
    const player = seats.find((one) => {
      const name = driver(one.seat_index)?.name;
      return (
        one.id !== me.id &&
        ((name !== undefined && name !== null && sameName(name, command.who)) ||
          sameName(cardName(one.character_id ?? ""), command.who))
      );
    });
    if (player) {
      await sendRaider(gameId, { targetSeatId: player.id });
      return `${named(me)} sends a Przyjaciel against ${named(player)}.`;
    }

    const lying = snapshot.fieldCards.find((row) => sameName(cardName(row.card_id), command.who));
    if (!lying) throw new Error(`No Postać or Wróg called \`${command.who}\`.`);
    await sendRaider(gameId, { fieldCardId: lying.id });
    return `${named(me)} sends a Przyjaciel against ${cardName(lying.card_id)}.`;
  },

  /**
   * The deck arranged so the next `draw` is a card somebody named.
   *
   * Says which pile, because the two are drawn by different verbs — a
   * Zaklęcie stacked and then hunted for with `draw` would look broken.
   */
  stack: async (ctx, command) => {
    const { gameId, seatOf } = ctx;
    const seat = seatOf(null);
    const put =
      command.cardId !== null
        ? { pile: await stackCard(gameId, seat.id, command.cardId), cardId: command.cardId }
        : await stackNth(gameId, seat.id, command.pile, command.at);
    const where =
      put.pile === "spells"
        ? "on top of the Zaklęcia — next `spell` takes it"
        : "on top of the Karty Zdarzeń — next `draw` takes it";
    return `${cardName(put.cardId)} is ${where}.`;
  },

  /**
   * What is left to deal, and what has been dealt.
   *
   * Numbered from the top, because that is the number `stack 10` takes — the
   * two are one another's halves. The used pile is counted rather than
   * listed: what matters about it is 9.5, that it is what comes back when the
   * draw runs out, and sixty names would bury the twenty that are still live.
   */
  pile: async (ctx, command) => {
    const { gameId } = ctx;
    const snapshot = await activeStore().load(gameId);
    const one = (pile: "events" | "spells", title: string) => {
      const { draw, discard } = pileContents(snapshot.game, pile);
      const head =
        `${title}: ${draw.length} left, ${discard.length} used` +
        (discard.length > 0 ? " (9.5 turns these over when the draw runs out)" : "");
      if (command.pile === null) {
        return [head, ...(draw.length > 0 ? [`  top: ${draw.slice(0, 5).map((c) => c.name).join(", ")}`] : [])];
      }
      return [head, ...draw.map((card, at) => `  ${String(at + 1).padStart(3)}  ${card.name}`)];
    };
    if (command.pile === "events") return one("events", "Karty Zdarzeń").join("\n");
    if (command.pile === "spells") return one("spells", "Zaklęcia").join("\n");
    return [...one("events", "Karty Zdarzeń"), "", ...one("spells", "Zaklęcia")].join("\n");
  },

  settle: async (ctx, command) => {
    const { gameId } = ctx;
    /**
     * Decides the fight you are in, without arranging dice to do it.
     *
     * Rolling until the answer comes out right is what a tester would
     * otherwise have to do, and against a Wilkołak with Miecz 10 there are
     * totals no pair of dice can reach — so the result is written and then
     * *applied* by `resolveFight`, the same function the last die calls. What
     * follows a loss follows here too: 17.4's Zbroja rolled against the point
     * of Życie, 4.4 if it was the last one, the guardian's own price on the
     * Kamienny Most.
     */
    const fightName = await change(
      gameId,
      (snapshot) => {
        const state = top(snapshot.game.turn_state);
        if (state.phase !== "fight") throw new Error("No fight is happening.");
        const fight = state.fight;
        const settled =
          command.outcome === "remis"
            ? ({ outcome: "remis", kind: fight.kind } as const)
            : ({
                outcome: command.outcome,
                kind: fight.kind,
                winner: command.outcome === "wygrana" ? "Postać" : fight.cardName,
                loser: command.outcome === "wygrana" ? fight.cardName : "Postać",
              } as const);
        return {
          writes: {
            game: {
              turn_state: replaceTop(snapshot.game.turn_state, {
                ...state,
                // The dice are filled in as well, because everything
                // downstream reads a settled fight as one that was rolled.
                fight: {
                  ...fight,
                  playerRoll: fight.playerRoll ?? 0,
                  enemyRoll: fight.enemyRoll ?? 0,
                  result: settled,
                },
              }),
            },
          },
          result: fight.cardName,
        };
      },
      undefined,
    );
    await resolveFight(gameId);
    return command.outcome === "remis"
      ? "Fight drawn."
      : command.outcome === "wygrana"
        ? `Won against ${fightName}.`
        : `Lost to ${fightName}.`;
  },

  endgame: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    /**
     * The end of the whole thing, which in this box has only one door.
     *
     * "CEL GRY" makes beating the Bestia the win and there is no other, so
     * winning is that: the game finished, the turn over, and the victory in
     * the journal — the state `fightBeast` leaves behind, without walking the
     * Kamienny Most to get there.
     *
     * Losing is not its mirror, because the rulebook has no losing condition.
     * What it has is 14.7 — the Bestia takes two points of Życie from
     * whoever loses to it, and 4.4 does the rest if that was the last of
     * them. So `losegame` loses to the Bestia rather than inventing a defeat
     * the game does not have.
     */
    const seat = seatOf(null);
    if (command.won) {
      await change(
        gameId,
        (snapshot) => ({
          writes: {
            game: { status: "finished", turn_state: only({ phase: "end" }) },
            journal: [
              {
                seatId: seat.id,
                round: snapshot.game.round,
                kind: "victory" as const,
                payload: { kind: "ordinary", beastTotal: 0 },
              },
            ],
          },
          result: undefined,
        }),
        undefined,
      );
      return `${named(seat)} beats the Bestia. Game over.`;
    }
    await change(
      gameId,
      (snapshot) => ({
        writes: {
          journal: [
            {
              seatId: seat.id,
              round: snapshot.game.round,
              kind: "beast-loss" as const,
              payload: { kind: "ordinary", beastTotal: 0 },
            },
          ],
        },
        result: undefined,
      }),
      undefined,
    );
    await adjust(gameId, seat.id, "life", -2, null);
    const after = (await seatsFor(gameId)).find((s) => s.id === seat.id);
    return after?.eliminated
      ? `${named(seat)} loses to the Bestia and dies (14.7, 4.4).`
      : `${named(seat)} loses to the Bestia — 2 Życia (14.7).`;
  },

  /**
   * 17.9's payout, which only a won duel owes.
   *
   * Bare is the Życie — the one the app always took, and still the ordinary
   * answer. `zloto` takes a Sztuka Złota. A name takes that Przedmiot,
   * matched against what the loser is actually holding, so "MIECZ" points at
   * their Miecz and not at the idea of one.
   */
  spoils: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(null);
    const { fight } = requireTop((await activeStore().load(gameId)).game.turn_state, "fight");
    if (fight.opponentSeat === undefined) {
      throw new Error("Tylko pojedynek z Postacią coś daje zwycięzcy (17.9).");
    }
    if (fight.result?.outcome !== "wygrana") throw new Error("Najpierw trzeba wygrać (17.9).");

    if (command.card === null) {
      await resolveFight(gameId, command.take === "zloto" ? { take: "zloto" } : undefined);
      return command.take === "zloto"
        ? `${named(seat)} takes a Sztuka Złota (17.9).`
        : `${named(seat)} takes a point of Życia (17.9).`;
    }

    const loser = (await seatsFor(gameId)).find((one) => one.seat_index === fight.opponentSeat);
    if (!loser) throw new Error("Nieznane miejsce.");
    const found = cardIdNamed(command.card);
    if (!("id" in found)) {
      throw new Error(
        "candidates" in found
          ? `Which one — ${found.candidates.join(", ")}?`
          : `No card called \`${command.card}\`.`,
      );
    }
    const theirs = (await holdingsFor(gameId)).find(
      (one) => one.seat_id === loser.id && one.card_id === found.id && one.kind === "item",
    );
    if (!theirs) throw new Error(`${cardName(found.id)} — pokonany tego nie ma (17.9).`);

    await resolveFight(gameId, { take: "przedmiot", holdingId: theirs.id });
    return `${named(seat)} takes ${cardName(found.id)} (17.9).`;
  },

  endfight: async (ctx) => {
    const { gameId } = ctx;
    await abandonFight(gameId);
    return "Fight dropped.";
  },

  /* ----------------------------------------------------------------------
   * Playing. Everything below is the game as printed — the same functions
   * the browser's buttons call, reached by typing instead of clicking.
   * ------------------------------------------------------------------- */
  ready: async (ctx, command) => {
    const { gameId, userOf } = ctx;
    const person = userOf(command.who);
    await setReady(gameId, person.id, command.ready);
    return command.ready ? "Ready." : "Not yet.";
  },

  start: async (ctx) => {
    const { gameId } = ctx;
    await startGame(gameId);
    return "The game begins.";
  },

  roll: async (ctx) => {
    const { gameId } = ctx;
    // Null, not a number: the app throws it. A typed die is companion mode's,
    // and "in simulation, nothing is entered by hand".
    await rollForMove(gameId, null);
    const state = top((await activeStore().load(gameId)).game.turn_state) as {
      roll?: number;
      options?: { fieldId: string; fieldName: string }[];
    };
    const where = (state.options ?? []).map((one) => one.fieldName).join(", ");
    return `Rolled ${state.roll ?? "?"}.${where ? ` Reaches: ${where}.` : " Nowhere to go."}`;
  },

  move: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    await moveTo(gameId, command.fieldId);
    return `${named(seatOf(null))} walks to ${fieldName(command.fieldId)}.`;
  },

  /**
   * The whole of what the Obszar owes, in one line (13.4).
   *
   * It used to be one Karta per `draw`, so exploring a Płaskowyż Mgieł was
   * three commands and two of them landed the turn in a state the game has no
   * name for. Badanie Obszaru is one motion at a table and it is one here.
   */
  draw: async (ctx) => {
    const { gameId } = ctx;
    const { cards, dealt, recycled } = await drawAll(gameId);
    const turned = recycled ? " The pile was turned over." : "";
    if (dealt === 0) return `Nothing to draw.${turned}`;
    return `Drawn ${dealt}: ${cards.map((card) => card.name).join(", ")}.${turned}`;
  },

  /**
   * The reply to a question a Karta or an Obszar asked.
   *
   * Nothing about a pending question is stored: `resolveDrawnCard` hands one
   * back as a return value and writes nothing for it, and the browser keeps
   * the answers in a modal's state and re-sends the whole path each time. So
   * this does the same — the choices are the path, not the last pick, and the
   * server re-walks the card against them from the start.
   */
  answer: async (ctx, command) => {
    const { gameId } = ctx;
    const snapshot = await activeStore().load(gameId);
    // A question owed to a Charakterystyka outranks even a suspended card,
    // because it is what is literally on screen — a `zaklecie` step that
    // asked put this above its own frame.
    const asked = askOnTop(snapshot.game.turn_state);
    if (asked) {
      const pick = command.choices?.[0];
      if (pick === undefined) {
        throw new Error(askLines(snapshot, asked.seatId).join("\n"));
      }
      const took = await answerAsk(gameId, asked.seatId, pick);
      return `${cardName(took)} taken.`;
    }
    // A suspended card outranks everything else: the frame is what the turn
    // is stuck on, and the answer goes to it.
    if (top(snapshot.game.turn_state).phase === "script") {
      const done = await answerScript(gameId, { choices: command.choices });
      return said(done.did, done.pending !== null);
    }
    const state = requireTop(
      snapshot.game.turn_state,
      "field",
      "Nothing is waiting for an answer.",
    );

    const decided = { choices: command.choices };
    // The Obszar's own table first: 13.4 makes it compulsory, so it is what
    // the turn is actually stuck on.
    const offer = compulsoryOffer(state.fieldId ?? null, state.resolved ?? []);
    if (offer && !command.card) {
      const done = await resolveFieldOffer(gameId, offer.name, null, decided);
      return said(done.did, done.pending !== null);
    }

    const waiting = (state.drawn ?? []).filter(
      (one) => !(state.resolved ?? []).includes(one.cardId),
    );
    if (waiting.length === 0) throw new Error("Nothing is waiting for an answer.");

    let card = waiting[0];
    if (command.card) {
      const hit = waiting.find(
        (one) => cardName(one.cardId).toLowerCase() === command.card!.toLowerCase(),
      );
      if (!hit) throw new Error(`Not waiting: ${command.card}.`);
      card = hit;
    } else if (waiting.length > 1) {
      throw new Error(
        `Which one — ${waiting.map((one) => cardName(one.cardId)).join(", ")}?`,
      );
    }
    const done = await resolveDrawnCard(gameId, card.cardId, null, decided);
    return said(done.did, done.pending !== null);
  },

  /**
   * What a Karta says, read without holding it.
   *
   * The one thing you could not do in a poczekalnia was find out what you
   * were about to pick — 27 Karty Postaci, each with two or three clauses of
   * Charakterystyka, and no way to read one. Choosing blind is not choosing.
   */
  card: async (_ctx, command) => {
    return cardLines(command.name).join("\n");
  },

  rule: async (_ctx, command) => {
    return ruleLines(command.about).join("\n");
  },

  look: async (ctx) => {
    const { gameId, named } = ctx;
    const snapshot = await activeStore().load(gameId);
    const game = snapshot.game;

    /**
     * The poczekalnia is a different question, and used to get the turn's
     * answer: "Tura 0 — nobody / Obszar: — / Faza: rzut", which is three
     * facts about a game that has not started. What somebody wants here is
     * who is at the table and what is still owed before `start` will work.
     */
    /**
     * A finished game is not a poczekalnia.
     *
     * `look` split on "playing or not", so winning the game reported "Lobby —
     * 1 at the table" — which is the one state it certainly was not. Nothing
     * stores a winner (the row keeps only `finished`), so the journal is
     * where the answer is, and this says so rather than inventing one.
     */
    if (game.status === "finished") {
      return [
        `Round ${game.round} — the game is over.`,
        "`journal` says how it ended.",
      ].join("\n");
    }

    if (game.status !== "playing") {
      const seatOfUser = (who: { seat_index: number | null }) =>
        snapshot.seats.find((one) => one.seat_index === who.seat_index);
      const waiting = snapshot.users.map((who) => {
        const seat = seatOfUser(who);
        // Somebody who stood up is watching, not undecided — `startGame`
        // never waits for them, and neither should this.
        if (!seat) return `  ${who.name ?? "?"} — watching`;
        const has = seat.character_id ? characterName(seat.character_id) : "no Postać";
        return `  ${who.name ?? "?"} — ${has}${who.ready ? " · ready" : ""}`;
      });
      const owed = snapshot.users.filter((who) => {
        const seat = seatOfUser(who);
        return seat !== undefined && (!seat.character_id || !who.ready);
      });
      return [
        `Lobby — ${snapshot.users.length} at the table.`,
        ...waiting,
        owed.length === 0
          ? "Everyone ready — `start` begins the game."
          : `Waiting for: ${owed.map((who) => who.name ?? "?").join(", ")}.`,
      ].join("\n");
    }

    /**
     * Nobody's turn, which is a state and not an error.
     *
     * 4.4 lets a player whose Postać died choose another, so a table where
     * every one of them is dead is not over — it is waiting for somebody to
     * pick. Nothing said so: `look` gave the turn's answer as usual and read
     * "Round 8 — nobody / Obszar: — / Phase: roll", which is three facts about
     * a turn that is not happening, and every command after it refused with
     * "Brak aktywnego gracza".
     */
    if (game.active_seat === null) {
      const out = snapshot.seats.filter((one) => one.character_id);
      return [
        `Round ${game.round} — nobody is playing.`,
        ...out.map((one) => `  ${named(one)} — ${one.eliminated ? "dead" : "out of play"}`),
        "4.4: whoever lost a Postać may `pick` another and start from its MGR.",
      ].join("\n");
    }

    // Two questions: what is on screen at all, and the roll and options
    // that only a `move` frame has.
    const state = top(game.turn_state);
    const moving = topIf(game.turn_state, "move");
    const active = snapshot.seats.find((one) => one.seat_index === game.active_seat);
    const here = snapshot.fieldCards.filter((one) => one.field_id === active?.field_id);
    const standing = snapshot.seats.filter(
      (one) => one.field_id === active?.field_id && !one.eliminated,
    );
    const phase = state.phase;
    return [
      `Round ${game.round} — ${active ? named(active) : "nobody"}`,
      `Obszar: ${fieldName(active?.field_id ?? null)}`,
      `Phase: ${PHASE[phase] ?? phase}${moving ? ` (rolled ${moving.roll})` : ""}`,
      // The pile under the running frame, when there is one — a summoned
      // fight over the roll it interrupted. Printed bottom-up so it reads in
      // the order it will resolve back down. Silent at depth 1, which is
      // every ordinary turn.
      ...(game.turn_state.stack.length > 1
        ? [
            `Stack: ${game.turn_state.stack.map(frameLabel).join(" › ")}`,
          ]
        : []),
      ...(moving?.options.length
        ? [`Reaches: ${moving.options.map((one) => one.fieldName).join(", ")}`]
        : []),
      ...(here.length
        ? [`On the Obszar: ${here.map((one) => cardName(one.card_id)).join(", ")}`]
        : []),
      // Loose gold on its own line rather than at the end of that one: it is
      // not a Karta, and „TARGOWISKO, GROTA, 5 Sztuk Złota" reads as a third
      // card until you get to the end of it. 12.1 makes it as much everybody's
      // business as 16.8 makes the Karty.
      ...(((): string[] => {
        const coins = snapshot.fieldGold.find((one) => one.field_id === active?.field_id);
        return coins && coins.gold > 0 ? [`Gold here: ${sztuki(coins.gold)}`] : [];
      })()),
      // The one thing the whole table is waiting on, spelled out with its
      // ways out — before `waitingOn`, because it is what everything else in
      // this list has stopped for.
      ...overflowLines(snapshot),
      ...waitingOn(top(game.turn_state)),
      ...(standing.length > 1
        ? [`Also here: ${standing.map((one) => named(one)).join(", ")}`]
        : []),
    ].join("\n");
  },

  me: async (ctx, command) => {
    const { gameId, actor, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    const snapshot = await activeStore().load(gameId);
    const mine = snapshot.holdings.filter((one) => one.seat_id === seat.id);
    /**
     * 9.3 keeps a hand of Zaklęcia concealed, and this prints your own —
     * which is exactly what a player may look at. Somebody else's is counted
     * and not named.
     */
    const own = seat.id === actor.seatId;
    /** Polish collation: ŁÓDŹ sorts after LIST, where somebody would look for it. */
    const byName = (a: { card_id: string }, b: { card_id: string }) =>
      cardName(a.card_id).localeCompare(cardName(b.card_id), "pl");
    const spells = mine.filter((one) => one.kind === "spell").sort(byName);
    /**
     * Friends and trophies are not gear and do not belong under "Pack".
     *
     * 6.3 lets a character keep any number of Przyjaciele and `carriedCount`
     * has always known it, so a Rycerz was being listed inside a "Pack 2/4"
     * he was not one of the two of — the count and the list beneath it
     * disagreed, and the list is what a player reads. A trophy is 1.4's, held
     * to be traded for Miecz rather than carried, and was in there for the
     * same reason: everything that was not a Zaklęcie fell through to gear.
     */
    const items = mine.filter((one) => one.kind === "item");
    const friends = mine.filter((one) => one.kind === "friend").sort(byName);
    const trophies = mine.filter((one) => one.kind === "trophy").sort(byName);
    const escorted = mine.filter((one) => one.kind === "carried").sort(byName);
    const view = seatView(snapshot, seat.id);
    /**
     * Sorted for reading, not kept in the order somebody arranged them.
     *
     * `ordinal` is the browser's: you drag a pack into an order so cards can
     * be *recognised* by where they sit, which is a thing a hand of tiles has
     * and a list of words does not. A list is scanned instead, so it is
     * alphabetical — and Polish collation, because ŁÓDŹ sorts after LIST and
     * a default sort puts it somewhere nobody would look.
     *
     * Worn is the exception and goes in the body's own order: head, amulet,
     * body, hands. That is not a list being searched, it is a figure being
     * read down, and alphabetical would scatter it.
     */
    const worn = items
      .filter((one) => inPlayAt(one.slot))
      .sort((a, b) => SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot));
    const carried = items.filter((one) => one.slot === null).sort(byName);
    // Not worn and not in the Plecak: put away, and out of both counts. Its
    // own line, because "Worn: KIJ I SZNUR (tajemna-sakwa)" said the one
    // thing about such a Karta that is not true.
    const stowed = items.filter((one) => STORAGE.includes(one.slot as Slot)).sort(byName);
    /**
     * Beaten minus held, as a multiset: two Nobbiny are two of each, and a
     * set difference would call the second one gone.
     *
     * Asked in both variants now. It used to be „Karty pokonanych" only,
     * because „Punkty" had no trophy holding to subtract from — it does, and
     * the subtraction means the same thing there: whom this seat beat and no
     * longer has.
     */
    // `shelfFor` is the one place this subtraction lives — the panel's and
    // the console's, since it moved into the engine where both may reach it.
    const leftHand = shelfFor(
      seat.trophy_beaten,
      trophies.map((one) => ({ holdingId: one.id, cardId: one.card_id })),
    )
      .filter((one) => one.gone)
      .map((one) => one.cardId);
    return [
      `${named(seat)}${seat.eliminated ? " — dead" : ""}`,
      /**
       * All three figures 1.5 quotes, in one line and in `figures.ts`'s
       * notation — the same one the browser draws.
       *
       * The fight figure was on a line of its own and only when it differed,
       * which is the figure a player is deciding on: every weapon in the box
       * counts „w walce" and nowhere else, so for anybody armed it is *the*
       * number, and it was the one below the fold.
       *
       * Own points were also the wrong way round here — printed first with
       * the parametr in parentheses, where the notation leads with the
       * parametr and keeps the bazowe figure in them.
       */
      `Sword ${figuresText(seat.sword_own, view.parametr.miecz, view.walka.miecz)}  ` +
        `Magic ${figuresText(seat.magic_own, view.parametr.magia, view.walka.magia)}  ` +
        `Life ${seat.life}  Gold ${seat.gold}`,
      // Who is doing the fighting, when it is not you. The numbers above
      // already say what he brings; this says whose they are — and why the
      // fight figure can be the smallest of the three.
      ...(championLine(view) ? [`In a fight: ${championLine(view)}`] : []),
      `Nature: ${seat.nature ?? "—"}   Obszar: ${fieldName(seat.field_id)}`,
      /**
       * What is true of this character for a while, and when it stops being.
       *
       * Above the pack on purpose: a Kamień or a Krąg Płomieni decides
       * whether the rest of this sheet can be acted on at all, and it was the
       * one thing about a character the console never printed — the browser
       * had glyphs for it and a terminal had nothing.
       */
      ...effectLines(
        foldStatuses(view.statuses, {
          queue: turnQueueOf(snapshot),
          seatIndex: seat.seat_index,
          mine: own,
        }),
      ),
      // Worn and carried are different places — 5.1 and the slot variant both
      // turn on which — and listing a Hełm you are wearing under "Pack" said
      // equipping it had not worked.
      /**
       * How much of the pack is used, and which rules are counting.
       *
       * Nothing anywhere said which ekwipunek a table was playing, and the
       * two do not agree about what a pack is: 5.4 caps it at four, the
       * slotted variant counts only what is worn towards a Koń's carrying,
       * and `equip` works in one and refuses in the other. The only way to
       * find out was to try something and be told no.
       */
      ...(worn.length
        ? [`Worn: ${worn.map((one) => `${cardName(one.card_id)} (${one.slot})`).join(", ")}`]
        : []),
      ...(stowed.length
        ? [
            `Schowane: ${stowed
              .map((one) => `${cardName(one.card_id)} (${SLOT_LABEL[one.slot as Slot]})`)
              .join(", ")} — nie liczy się do 5.4 i nikt tego nie zabierze`,
          ]
        : []),
      `Pack ${view.carried}/${view.carryLimit} (${eqModeOf(snapshot.game)}): ` +
        `${carried.length ? carried.map((one) => cardName(one.card_id)).join(", ") : "empty"}`,
      // 6.2: friends lie face up, so everyone may read them — no `own` gate.
      ...(friends.length
        ? [`Friends: ${friends.map((one) => cardName(one.card_id)).join(", ")}`]
        : []),
      /**
       * 1.4: held to be traded for Miecz, which is not the same as carried.
       *
       * The arithmetic is the useful half and the player is the one choosing
       * what to hand in, so the line carries what each Karta is worth, what
       * they total, and what a trade of everything would waste. Without it
       * the choice 1.4 gives you has to be done on paper.
       */
      /**
       * One line for both variants, because there is one trade.
       *
       * „Punkty" used to print a pool here — `pointLedger`, a running total
       * in sevens — which was the wrong model of the variant: it holds
       * trophies like the printed rule and differs only in having sent the
       * Karty back at the kill. So the ledger above serves both, waste
       * included, and that is the whole of it.
       */
      ...(trophies.length
        ? [
            `Trophies: ${trophies
              .map((one) => `${cardName(one.card_id)} ${trophyPointsOf(one.card_id, view.parametr)}`)
              .join(", ")}` +
              trophyLedger(trophies.map((one) => one.card_id), view.parametr),
            ...tradeMenu(trophies.map((one) => one.card_id), view.parametr),
          ]
        : []),
      /**
       * And who you beat and no longer hold, which the hand cannot say.
       *
       * A cashed Karta is deleted and 1.4 sends it to the stos zużytych, so
       * the list above shrinks and nothing records that it ever had them. The
       * seat's own list of everyone beaten is the other half; the difference
       * is this. Said after the hand, greyed by the parenthesis, because it
       * is a record rather than something to act on.
       */
      ...(own && leftHand.length > 0
        ? [`Beaten, not held: ${leftHand.map((cardId) => cardName(cardId)).join(", ")}`]
        : []),
      /**
       * What a Przyjaciel is carrying, which is not in the hand.
       *
       * Named only where the card says it may be: the Gnom's is "wolno ci ją
       * obejrzeć" and the Krzyżowiec's says no such thing, so his is listed
       * as a Zaklęcie he has and not as a Zaklęcie you know.
       */
      ...(own && escorted.length
        ? [
            `Carried: ${escorted
              .map((one) => {
                const by = one.carried_by ?? "";
                const may = carriesSpell([by])?.mozeszObejrzec ?? false;
                return `${cardName(by)} — ${may ? cardName(one.card_id) : "1 Zaklęcie (face down)"}`;
              })
              .join(", ")}`,
          ]
        : []),
      own
        /**
         * With the limit, the way the pack carries its own.
         *
         * 2.6's is the limit that moves under you — the Zaczarowane Wzgórza
         * suspend what a Pierścień lends and with it the right to a third
         * Zaklęcie — so a hand that was legal a moment ago can be over
         * without anything having been drawn. Without the number here, the
         * refusal at the next roll is the first anybody hears of it.
         */
        ? `Zaklęcia ${spells.length}/${view.spellCapacity}: ` +
          `${spells.length ? spells.map((one) => cardName(one.card_id)).join(", ") : "none"}`
        : `Zaklęcia ${spells.length}/${view.spellCapacity} (face down — 9.3)`,
    ].join("\n");
  },

  spell: async (ctx, command) => {
    const { gameId, seatOf, named } = ctx;
    const seat = seatOf(command.who);
    const spellId = command.wand
      ? await drawSpellWithWand(gameId, seat.id)
      : await drawSpell(gameId, seat.id);
    // Null is the Chochlik: nothing was dealt, a question is on screen
    // instead. Read back rather than guessed at, so the console names the
    // Karty the server actually lifted — and only for the seat they are for.
    if (spellId === null) return askLines(await activeStore().load(gameId), seat.id).join("\n");
    return `${named(seat)} draws ${cardName(spellId)}.`;
  },
};
