/** One typed line from the test console, carried out against a real table. */

import characters from "@/data/characters.json";
import { describeCard } from "@/lib/engine/lookup";

import type { Character } from "@/data/types";
import { FIELDS, type FieldId } from "@/lib/engine/board";
import { isRandomPick, RANDOM_CHARACTER_ID } from "@/lib/engine/characters";
import {
  helpLines,
  pickPlayer,
  statReply,
  type Command,
  type EffectName,
} from "@/lib/engine/console";
import { cardName } from "@/lib/engine/polish";
import type { Modifier } from "@/lib/engine/status";
import { change } from "./change";
import { ADJUSTABLE, type Adjustable } from "./commands/adjust";
import { driverOf, isQuiet, nameOfSeat } from "./commands/lobby";
import { STONE_TURNS } from "./commands/stone";
import {
  claimTableScreen,
  leaveTable,
  renameUser,
  setReady,
  takeSeat,
  unseat,
} from "./lobbyStore";
import { gameById, seatsFor, usersFor, type SeatRow, type UserRow } from "./store";
import {
  abandonFight,
  addEffect,
  adjust,
  attackSeat,
  beginFight,
  dropCard,
  equipCard,
  escape,
  fightRoll,
  changeNature,
  drawCard,
  drawSpell,
  finishTurn,
  moveTo,
  resolveDrawnCard,
  startGame,
  resolveFieldOffer,
  rollForMove,
  grantCard,
  placeCard,
  placeSeat,
  removeCharacter,
  resolveFight,
  reviveCharacter,
  spendHolding,
  takeCard,
  takeFromField,
  stageFight,
  takeNewCharacter,
  turnToStone,
} from "./turnStore";
import { activeStore } from "./gameStore";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { fitsIn, slotsFor, type Slot } from "@/lib/engine/slots";
import { fold } from "@/lib/engine/search";

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
 * What each of the console's three effect words writes.
 *
 * The label is what a player is shown, so it names the card the state comes
 * from rather than the word that was typed — a chip reading "frozen" would be
 * the only English on anybody's screen, and the point of the state is to look
 * exactly like the card's.
 */
const EFFECTS: Record<EffectName, { label: string; modifier: Modifier }> = {
  fog: { label: "Mgła (tryb testowy)", modifier: { kind: "move-max", pola: 1 } },
  frozen: { label: "Bez ruchu (tryb testowy)", modifier: { kind: "frozen" } },
  barred: {
    label: "Most zamknięty (tryb testowy)",
    modifier: { kind: "barred", place: "most" },
  },
};

/**
 * What is printed on a Karta Postaci, from what the column holds.
 *
 * The surprise is a state and not a card (`RANDOM_CHARACTER_ID`), so it says
 * so rather than coming back as a missing name — a seat that has chosen to be
 * dealt one is not the same as a seat that has chosen nothing.
 */
function characterName(id: string | null): string {
  if (!id) return "—";
  if (isRandomPick(id)) return "niespodzianka";
  return (characters as Character[]).find((one) => one.id === id)?.name ?? id;
}

/**
 * What an Obszar is called, or an em dash for a figure that is nowhere.
 *
 * Takes a `FieldId` and not a string: `seatsFor` narrowed the column on the way
 * in, so there is nothing to guard against here and a cast would only be this
 * file forgetting that.
 */
function fieldName(fieldId: FieldId | null): string {
  if (!fieldId) return "—";
  return FIELDS.get(fieldId)?.name ?? fieldId;
}

/**
 * Who is typing, which is now two facts rather than one.
 *
 * A person and the Postać they drive are different rows with different
 * lifetimes, and the console needs both: `kill` and `go` are about a figure on
 * the board, `kick` and `leave` are about somebody in the room. `seatId` is
 * null for a spectator, and the commands that need one say so themselves.
 */
/** What a resolution did, and whether the card is still asking. */
function said(did: readonly string[], pending: boolean): string {
  const lines = did.length > 0 ? did.join("\n") : "Nic się nie stało.";
  return pending ? `${lines}\nWciąż czeka — odpowiedz jeszcze raz (\`look\`).` : lines;
}

/**
 * The turn's phase, spelled out.
 *
 * The stored words are the engine's and read as such — `field` is a phase name
 * rather than a thing you can point at — so this is only the difference between
 * a state machine's label and a sentence.
 */
const PHASE: Record<string, string> = {
  roll: "roll",
  move: "move",
  field: "the Obszar",
  fight: "fight",
  bridge: "the Most",
  end: "end of turn",
};

/** The question the turn is stuck on, for `look`. */
function waitingOn(turnState: unknown): string[] {
  const state = turnState as {
    phase?: string;
    fieldId?: FieldId;
    drawn?: { cardId: string }[];
    resolved?: string[];
  };
  if (state.phase !== "field") return [];
  const offer = compulsoryOffer(state.fieldId ?? null, state.resolved ?? []);
  const waiting = (state.drawn ?? []).filter(
    (one) => !(state.resolved ?? []).includes(one.cardId),
  );
  return [
    ...(offer ? [`The Obszar asks: ${offer.name} — \`answer\` or \`answer <n>\``] : []),
    ...(waiting.length
      ? [`Waiting: ${waiting.map((one) => cardName(one.cardId)).join(", ")}`]
      : []),
  ];
}

/**
 * One Karta read out, or the reason it could not be.
 *
 * Shared with `mm`, which answers `card` before it has a game to answer it
 * against — see `worksOffTable`. The refusal is a throw here because that is
 * how every other refusal in this file reaches the surface.
 */
export function cardLines(name: string): string[] {
  const found = describeCard(name);
  if ("lines" in found) return found.lines;
  if ("candidates" in found) throw new Error(`Which one — ${found.candidates.join(", ")}?`);
  throw new Error(`No card called \`${found.missing}\`.`);
}

/** Whether a card id is the card somebody just named. */
function sameName(cardId: string, said: string): boolean {
  return fold(cardName(cardId)) === fold(said.trim());
}

/**
 * One of this seat's holdings, by the name printed on it.
 *
 * A holding's id is a uuid and a person types a name, so every verb that acts
 * on something carried goes through here. Two copies of the same card are the
 * same card as far as this is concerned — the first is as good as the second.
 */
async function holdingNamed(gameId: string, seatId: string, said: string) {
  const snapshot = await activeStore().load(gameId);
  const mine = snapshot.holdings.filter((one) => one.seat_id === seatId);
  const hit = mine.find((one) => sameName(one.card_id, said));
  if (hit) return hit;
  const near = mine.filter((one) => fold(cardName(one.card_id)).startsWith(fold(said.trim())));
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((one) => cardName(one.card_id)).join(", ")}?`);
  }
  throw new Error(`You are not holding \`${said}\`.`);
}

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
export async function runCommand(
  gameId: string,
  actor: Actor,
  command: Command,
): Promise<string> {
  const [seats, people] = await Promise.all([seatsFor(gameId), usersFor(gameId)]);

  /** Whoever is driving a given seat, or nobody — `driverOf`'s, off the people here. */
  const driver = (seatIndex: number) => driverOf(people, seatIndex);

  /**
   * Whose seat a command is about: the one named, or your own.
   *
   * Named by player, by character, or by seat number — whichever is on screen
   * when somebody types. Any seated player may act on any seat here, as they
   * may with the corrections: at a table people fix each other's boards.
   */
  const seatOf = (who: string | null): SeatRow => {
    if (!who) {
      const mine = seats.find((seat) => seat.id === actor.seatId);
      if (!mine) throw new Error("You are not driving a Postać.");
      return mine;
    }
    // The matching itself is `pickPlayer`'s, in the pure half, where a table of
    // four can be written down and asked about without a database behind it.
    const hit = pickPlayer(
      seats.map((seat) => ({
        seat: seat.seat_index,
        name: driver(seat.seat_index)?.name ?? null,
        character: seat.character_id,
      })),
      who,
    );
    if ("error" in hit) throw new Error(hit.error);
    return seats[hit.at];
  };

  /**
   * Which *person* a command is about: the one named, or yourself.
   *
   * The same handles as a seat and one more — the four-character id, which is
   * the only one a spectator has. That is the whole reason this is a second
   * lookup rather than `seatOf` reading the driver off the row it found:
   * somebody driving nothing cannot be named by a chair or by a Postać, and
   * `kick`, `seat` and `rename` are precisely the words you reach for when
   * they are.
   */
  const userOf = (who: string | null): UserRow => {
    if (!who) {
      const me = people.find((one) => one.id === actor.userId);
      if (!me) throw new Error("No such player.");
      return me;
    }
    const hit = pickPlayer(
      people.map((one) => ({
        seat: one.seat_index,
        name: one.name,
        character:
          one.seat_index === null
            ? null
            : (seats.find((seat) => seat.seat_index === one.seat_index)?.character_id ?? null),
        id: one.id,
      })),
      who,
    );
    if ("error" in hit) throw new Error(hit.error);
    return people[hit.at];
  };

  /** A seat by the number printed beside it, which counts from one. */
  const seatByNumber = (printed: number) => {
    const hit = seats.find((seat) => seat.seat_index === printed - 1);
    if (!hit) throw new Error(`Nie ma miejsca ${printed}.`);
    return hit;
  };

  /**
   * The seat a Postać command names: `3` or `MAGOG`, and never both.
   *
   * Both of these act on a *figure* rather than on a chair or a person, so the
   * Karta's own printed name is as good a handle as the seat number — and for
   * `revive` it is the better one, because the thing you are naming is exactly
   * the card that is lying in the box.
   */
  const pickedSeat = (printed: number | null, characterId: string | null): SeatRow => {
    if (printed !== null) return seatByNumber(printed);
    if (characterId !== null) {
      const hit = seats.find((seat) => seat.character_id === characterId);
      if (!hit) throw new Error(`${characterName(characterId)} nie stoi przy tym stole.`);
      return hit;
    }
    return seatOf(null);
  };


  /**
   * What to call a seat in a line printed back.
   *
   * `nameOfSeat`'s and not this file's: whoever is driving it, and the chair
   * when nobody is. An empty seat is a real state now rather than a missing
   * name, and one place decides what it is called.
   */
  const named = (seat: { seat_index: number }) => nameOfSeat(people, seat.seat_index);

  /** What a command that moved the turn on has to say about it. */
  const turnMoved = (passedTo: number | null) =>
    passedTo === null ? "" : ` Turn passes to seat ${passedTo + 1}.`;

  /**
   * The table written out: one line to a seat, and the watchers under it.
   *
   * The one answer in this file that is not a change, and the one that makes
   * the rest of the person commands typeable. A seat is on the screen already
   * and can be named by its number or its Postać; a **spectator** is on nobody's
   * board and can be named by nothing but their id, which is what this prints
   * and what nothing else shows.
   *
   * Read as four columns and a tail: whose turn it is, the number beside the
   * chair, the Karta Postaci standing in it, and the person driving it. `†` is
   * 4.4 — the Postać is out and the chair is still theirs.
   */
  const roster = async () => {
    const now = Date.now();
    const game = await gameById(gameId);
    // Readiness is the poczekalnia's word and means nothing once play has
    // started, so it is only printed where it can still be acted on.
    const waiting = game.status === "lobby";

    const person = (one: UserRow) => {
      const marks = [
        one.id === actor.userId ? "you" : null,
        one.is_host ? "host" : null,
        isQuiet(one, now) ? "away" : null,
        waiting && !one.ready ? "not ready" : null,
      ].filter((mark): mark is string => mark !== null);
      return `${one.name} ${one.id}${marks.length > 0 ? ` (${marks.join(", ")})` : ""}`;
    };

    const seated = new Set<string>();
    const rows = seats.map((seat) => {
      const one = driver(seat.seat_index);
      if (one) seated.add(one.id);
      return {
        at: `${game.active_seat === seat.seat_index ? "▸" : " "}${seat.seat_index + 1}`,
        card: characterName(seat.character_id) + (seat.eliminated ? " †" : ""),
        who: one ? person(one) : "—",
      };
    });

    const wide = Math.max(0, ...rows.map((row) => row.card.length));
    const lines = rows.map((row) => `${row.at}  ${row.card.padEnd(wide)}  ${row.who}`);

    // Everybody the seats did not account for, which is what a spectator is:
    // somebody at the table driving nothing (4.4 lets a player whose Postać
    // died decline to take another, and a full table seats latecomers nowhere).
    const watching = people.filter((one) => !seated.has(one.id));
    if (watching.length > 0) lines.push(`watching: ${watching.map(person).join(", ")}`);
    return lines.length > 0 ? lines.join("\n") : "Nobody is at this table.";
  };

  switch (command.kind) {
    case "help":
      return helpLines(command.about).join("\n");

    case "stat": {
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
    }

    case "kill": {
      const seat = seatOf(command.who);
      if (seat.eliminated) return `${named(seat)} już nie żyje.`;
      // Through the same door a lost fight goes through, so what a death does
      // to a character — its cards on the field, its Zaklęcia spent, the turn
      // handed on — happens here too (4.4).
      await adjust(gameId, seat.id, "life", -seat.life, null);
      return `${named(seat)} ginie.`;
    }

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
    case "who":
      return roster();

    /**
     * A player out of their seat, and the Postać left where it stands.
     *
     * Mid-game a seat is not deleted but *left*: the Postać keeps its Obszar,
     * its cards and its żetony, and the chair is there for somebody to take
     * over — the same person from another tab, or anybody else in the room.
     * This is what the rulebook has no word for, because in 1993 everybody was
     * in one room and a person who stood up came back.
     *
     * Which also means it cannot strand the table: `unseat` hands the turn on
     * when the seat it empties is the one whose turn it is.
     */
    case "unseat": {
      const user = userOf(command.who);
      if (user.seat_index === null) return `${user.name} is not driving anything.`;
      const { passedTo } = await unseat(gameId, user.id);
      return `${user.name} is out of seat ${user.seat_index + 1}; the Postać stays.${turnMoved(
        passedTo,
      )}`;
    }

    /**
     * Somebody sits down, which is the one door into a seat.
     *
     * The number is checked against the seats that exist before the command is
     * asked, because a person's `seat_index` is only refused by the rules for
     * being *somebody else's* — nothing in there says the chair has to be
     * there at all, and a typo would otherwise seat somebody in seat 47.
     */
    case "seat": {
      const user = userOf(command.who);
      const seat = seatByNumber(command.seat);
      await takeSeat(gameId, user.id, seat.seat_index);
      return `${user.name} drives ${named(seat)}${
        seat.character_id ? ` — ${characterName(seat.character_id)}` : ""
      }.`;
    }

    /**
     * Off the table, by somebody else's decision.
     *
     * The Postać is untouched: it is not theirs to take away, and 4.4 is the
     * only thing in the book that removes one. What goes is the person — and
     * the journal records that they were thrown off rather than that they
     * walked, which is the difference `leave` exists to draw.
     */
    case "kick": {
      const user = userOf(command.who);
      const { passedTo } = await leaveTable(gameId, user.id, true);
      return `${user.name} is off the table.${turnMoved(passedTo)}`;
    }

    /** The same exit, by your own choice. Only ever yourself — see the grammar. */
    case "leave": {
      const me = userOf(null);
      const { passedTo } = await leaveTable(gameId, me.id, false);
      return `${me.name} leaves the table.${turnMoved(passedTo)}`;
    }

    case "rename": {
      const user = userOf(command.who);
      const was = user.name;
      await renameUser(gameId, user.id, command.name);
      return `${was} is now ${command.name.trim()}.`;
    }

    /**
     * The host role handed over.
     *
     * Handed over *by the host*, whoever typed it. `takeHostRole` refuses
     * anybody else while the host is present and it is right to — there is no
     * co-host — but this console is the one caller deliberately allowed to be
     * anybody, exactly as `pick` is: a tester driving four people from one
     * browser is every one of them at once.
     */
    case "host": {
      const user = userOf(command.who);
      const host = people.find((one) => one.is_host);
      await claimTableScreen(gameId, user.id, host?.id ?? actor.userId);
      return `${user.name} runs the table.`;
    }

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
    case "remove": {
      const seat = pickedSeat(command.seat, command.characterId);
      const { characterId, returned } = await removeCharacter(gameId, seat.id, command.hard, null);
      const spilled =
        returned.length === 0
          ? ""
          : ` Back on the piles: ${returned.map((id) => cardName(id)).join(", ")}.`;
      return `${characterName(characterId)} is out of the game${
        command.hard ? " for good" : " — the Karta goes back in the pool"
      }.${spilled}`;
    }

    /** The undo for a death that should not have happened. */
    case "revive": {
      const seat = pickedSeat(command.seat, command.characterId);
      const back = await reviveCharacter(gameId, seat.id);
      return `${characterName(back)} stands up again on ${fieldName(seat.field_id)}.`;
    }

    case "give": {
      const seat = seatOf(null);
      await grantCard(gameId, seat.id, command.cardId);
      return `${named(seat)} takes ${cardName(command.cardId)}.`;
    }

    case "place": {
      const seat = seatOf(null);
      const where = await placeCard(gameId, seat.id, command.cardId, command.fieldId);
      return `${cardName(command.cardId)} lies on ${FIELDS.get(where)?.name ?? where}.`;
    }

    case "nature": {
      const seat = seatOf(command.who);
      const { nowForbidden } = await changeNature(gameId, seat.id, command.nature, command.force);
      // 7.4 by way of 5.5: the cards the new Natura may not hold have to go,
      // and a tester who was not told which they are would find out two turns
      // later. `changeNature` works this out already; nothing was reading it.
      const dropped =
        nowForbidden.length > 0
          ? ` Now forbidden: ${nowForbidden.map((id) => cardName(id)).join(", ")}.`
          : "";
      return `${named(seat)} is ${command.nature}.${dropped}`;
    }

    /**
     * A seat that died taking a character again (4.4).
     *
     * The same door the reborn modal goes through, which is the point: the
     * modal is on the dead player's own device, and a tester driving four seats
     * from one browser cannot reach it. Naming a character is the reason this
     * is worth a command at all — a particular Charakterystyka is otherwise
     * reachable only by re-dealing the whole table.
     */
    case "pick": {
      const seat = command.seat === null ? seatOf(null) : seatByNumber(command.seat);
      // The console acts as the seat it is naming: this is the test shortcut,
      // and refusing it on `mayChooseFor` would refuse the one caller that is
      // deliberately allowed to be anybody.
      await takeNewCharacter(
        gameId,
        seat.id,
        command.characterId ?? RANDOM_CHARACTER_ID,
        seat.id,
      );
      const after = (await seatsFor(gameId)).find((one) => one.id === seat.id);
      return `${named(seat)} plays ${characterName(after?.character_id ?? null)}.`;
    }

    /**
     * Hands play round until it is somebody's turn.
     *
     * By passing, not by writing `active_seat`: 10.1's order is not a number to
     * be set, and going round properly is what spends the lost turns, ticks the
     * effects, leaves the drawn cards on their field and advances the counter
     * that 20.1 measures stone in. So a seat that is stoned is reached by the
     * stone running out, which is the honest answer to asking for its turn.
     *
     * Bounded, because a seat can be unreachable — eliminated, or a table where
     * everybody owes turns. The bound is generous enough to outlast three turns
     * of stone and is a backstop rather than the exit.
     */
    case "turn": {
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
    }

    case "stone": {
      const seat = seatOf(command.who);
      await turnToStone(gameId, seat.id);
      return `${named(seat)} is stone for ${STONE_TURNS} turns (20.1).`;
    }

    /**
     * The three states a card makes and nothing else does.
     *
     * Written through `addEffect`, so each one is the same row the card would
     * have written and is read by the same code — the cap consulted when a die
     * is rolled for a move, the freeze the turn order skips, 11.11's refusal at
     * the bridge. Ending after one of the holder's own turns, because a test
     * that has to be undone by hand is one somebody forgets to undo.
     */
    case "effect": {
      const seat = seatOf(command.who);
      const { label, modifier } = EFFECTS[command.effect];
      await addEffect(gameId, seat.id, {
        source: "tryb testowy",
        label,
        modifier,
        ends: { kind: "turns", turns: 1 },
      });
      return `${named(seat)}: ${label}.`;
    }

    case "teleport": {
      const seat = seatOf(null);
      await placeSeat(gameId, seat.id, command.fieldId, null);
      return `${named(seat)} stands on ${FIELDS.get(command.fieldId)?.name ?? command.fieldId}.`;
    }

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
    case "take": {
      const seat = seatOf(null);
      const snapshot = await activeStore().load(gameId);
      const state = snapshot.game.turn_state as {
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
    }

    case "putdown": {
      const seat = seatOf(null);
      const held = await holdingNamed(gameId, seat.id, command.name);
      await dropCard(gameId, held.id);
      return `${named(seat)} puts ${cardName(held.card_id)} down.`;
    }

    case "use": {
      const seat = seatOf(null);
      const held = await holdingNamed(gameId, seat.id, command.name);
      const done = await spendHolding(gameId, held.id);
      return [`${named(seat)} uses ${cardName(held.card_id)}.`, ...(done.did ?? [])].join("\n");
    }

    case "equip": {
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
      return slot === null
        ? `${named(seat)} carries ${cardName(held.card_id)}.`
        : `${named(seat)} wears ${cardName(held.card_id)} — ${slot}.`;
    }

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
    case "fight": {
      const seat = seatOf(null);
      const snapshot = await activeStore().load(gameId);
      const state = snapshot.game.turn_state as {
        phase?: string;
        drawn?: { cardId: string; cardClass: string }[];
        resolved?: string[];
      };

      // Already in one — the dice are what is owed, not another opponent.
      if (state.phase !== "fight") {
        const waiting = (state.drawn ?? []).filter(
          (one) => one.cardClass === "foe" && !(state.resolved ?? []).includes(one.cardId),
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

      // Null on both, because the app throws its own dice in simulation.
      await fightRoll(gameId, "player", null);
      await fightRoll(gameId, "enemy", null);

      const after = (await activeStore().load(gameId)).game.turn_state as {
        fight?: {
          cardName: string;
          playerTotal: number;
          enemyTotal: number;
          playerRoll: number | null;
          enemyRoll: number | null;
          /** An object, not a string — `CombatResult` carries who won as well. */
          result: { outcome: "wygrana" | "przegrana" | "remis" } | null;
        };
      };
      const fight = after.fight;
      if (!fight) return "The fight is over.";
      const mine = fight.playerTotal + (fight.playerRoll ?? 0);
      const theirs = fight.enemyTotal + (fight.enemyRoll ?? 0);
      const said =
        `${named(seat)} ${mine} (${fight.playerTotal}+${fight.playerRoll ?? 0})` +
        ` vs ${fight.cardName} ${theirs} (${fight.enemyTotal}+${fight.enemyRoll ?? 0})`;

      await resolveFight(gameId);
      const ended = (await activeStore().load(gameId)).game.turn_state as { phase?: string };
      const OUTCOME = { wygrana: "won", przegrana: "lost", remis: "drawn" } as const;
      const outcome = fight.result ? OUTCOME[fight.result.outcome] : "unsettled";
      return `${said} — ${outcome}.${ended.phase === "fight" ? " Still fighting." : ""}`;
    }

    case "escape": {
      const seat = seatOf(null);
      // Null: the app rolls. A reported number is companion mode's.
      const fled = await escape(gameId, null);
      return fled.succeeded
        ? `${named(seat)} slips away.${fled.onBridge ? " Back off the Most." : ""}`
        : `${named(seat)} does not get away.`;
    }

    case "attack": {
      const seat = seatOf(command.who);
      await attackSeat(gameId, seat.id);
      return `${named(seatOf(null))} attacks ${named(seat)}.`;
    }

    case "summon": {
      const seat = seatOf(null);
      await stageFight(gameId, seat.id, command.cardId);
      return `${named(seat)} fights ${cardName(command.cardId)}.`;
    }

    case "settle": {
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
          const state = snapshot.game.turn_state;
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
                turn_state: {
                  ...state,
                  // The dice are filled in as well, because everything
                  // downstream reads a settled fight as one that was rolled.
                  fight: {
                    ...fight,
                    playerRoll: fight.playerRoll ?? 0,
                    enemyRoll: fight.enemyRoll ?? 0,
                    result: settled,
                  },
                },
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
    }

    case "endgame": {
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
              game: { status: "finished", turn_state: { phase: "end" as const } },
              journal: [
                {
                  seatId: seat.id,
                  turn: snapshot.game.turn,
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
                turn: snapshot.game.turn,
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
    }

    case "endfight":
      await abandonFight(gameId);
      return "Fight dropped.";

    case "endturn":
      await finishTurn(gameId);
      return "Turn passed.";

    /* ----------------------------------------------------------------------
     * Playing. Everything below is the game as printed — the same functions
     * the browser's buttons call, reached by typing instead of clicking.
     * ------------------------------------------------------------------- */

    case "ready": {
      const person = userOf(command.who);
      await setReady(gameId, person.id, command.ready);
      return command.ready ? "Ready." : "Not yet.";
    }

    case "start":
      await startGame(gameId);
      return "The game begins.";

    case "roll": {
      // Null, not a number: the app throws it. A typed die is companion mode's,
      // and "in simulation, nothing is entered by hand".
      await rollForMove(gameId, null);
      const state = (await activeStore().load(gameId)).game.turn_state as {
        roll?: number;
        options?: { fieldId: string; fieldName: string }[];
      };
      const where = (state.options ?? []).map((one) => one.fieldName).join(", ");
      return `Rolled ${state.roll ?? "?"}.${where ? ` Reaches: ${where}.` : " Nowhere to go."}`;
    }

    case "move": {
      await moveTo(gameId, command.fieldId);
      return `${named(seatOf(null))} walks to ${fieldName(command.fieldId)}.`;
    }

    case "draw": {
      const { card, recycled } = await drawCard(gameId, null);
      const turned = recycled ? " The pile was turned over." : "";
      return card ? `Drawn: ${card.name}.${turned}` : `Nothing to draw.${turned}`;
    }

    /**
     * The reply to a question a Karta or an Obszar asked.
     *
     * Nothing about a pending question is stored: `resolveDrawnCard` hands one
     * back as a return value and writes nothing for it, and the browser keeps
     * the answers in a modal's state and re-sends the whole path each time. So
     * this does the same — the choices are the path, not the last pick, and the
     * server re-walks the card against them from the start.
     */
    case "answer": {
      const snapshot = await activeStore().load(gameId);
      const state = snapshot.game.turn_state as {
        phase?: string;
        fieldId?: FieldId;
        drawn?: { cardId: string }[];
        resolved?: string[];
      };
      if (state.phase !== "field") throw new Error("Nothing is waiting for an answer.");

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
    }

    /**
     * What a Karta says, read without holding it.
     *
     * The one thing you could not do in a poczekalnia was find out what you
     * were about to pick — 27 Karty Postaci, each with two or three clauses of
     * Charakterystyka, and no way to read one. Choosing blind is not choosing.
     */
    case "card":
      return cardLines(command.name).join("\n");

    case "look": {
      const snapshot = await activeStore().load(gameId);
      const game = snapshot.game;

      /**
       * The poczekalnia is a different question, and used to get the turn's
       * answer: "Tura 0 — nobody / Obszar: — / Faza: rzut", which is three
       * facts about a game that has not started. What somebody wants here is
       * who is at the table and what is still owed before `start` will work.
       */
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

      const state = game.turn_state as {
        phase?: string;
        roll?: number;
        options?: { fieldId: string; fieldName: string }[];
      };
      const active = snapshot.seats.find((one) => one.seat_index === game.active_seat);
      const here = snapshot.fieldCards.filter((one) => one.field_id === active?.field_id);
      const standing = snapshot.seats.filter(
        (one) => one.field_id === active?.field_id && !one.eliminated,
      );
      const phase = state.phase ?? "";
      return [
        `Turn ${game.turn} — ${active ? named(active) : "nobody"}`,
        `Obszar: ${fieldName(active?.field_id ?? null)}`,
        `Phase: ${PHASE[phase] ?? phase}${state.roll ? ` (rolled ${state.roll})` : ""}`,
        ...(state.options?.length
          ? [`Reaches: ${state.options.map((one) => one.fieldName).join(", ")}`]
          : []),
        ...(here.length
          ? [`On the Obszar: ${here.map((one) => cardName(one.card_id)).join(", ")}`]
          : []),
        ...waitingOn(game.turn_state),
        ...(standing.length > 1
          ? [`Also here: ${standing.map((one) => named(one)).join(", ")}`]
          : []),
      ].join("\n");
    }

    case "me": {
      const seat = seatOf(command.who);
      const snapshot = await activeStore().load(gameId);
      const mine = snapshot.holdings.filter((one) => one.seat_id === seat.id);
      /**
       * 9.3 keeps a hand of Zaklęcia concealed, and this prints your own —
       * which is exactly what a player may look at. Somebody else's is counted
       * and not named.
       */
      const own = seat.id === actor.seatId;
      const spells = mine.filter((one) => one.kind === "spell");
      const items = mine.filter((one) => one.kind !== "spell");
      const worn = items.filter((one) => one.slot !== null);
      const carried = items.filter((one) => one.slot === null);
      return [
        `${named(seat)}${seat.eliminated ? " — dead" : ""}`,
        `Sword ${seat.sword_own}  Magic ${seat.magic_own}  Life ${seat.life}  Gold ${seat.gold}`,
        `Nature: ${seat.nature ?? "—"}   Obszar: ${fieldName(seat.field_id)}`,
        // Worn and carried are different places — 5.1 and the slot variant both
        // turn on which — and listing a Hełm you are wearing under "Pack" said
        // equipping it had not worked.
        ...(worn.length
          ? [`Worn: ${worn.map((one) => `${cardName(one.card_id)} (${one.slot})`).join(", ")}`]
          : []),
        `Pack: ${carried.length ? carried.map((one) => cardName(one.card_id)).join(", ") : "empty"}`,
        own
          ? `Zaklęcia: ${spells.length ? spells.map((one) => cardName(one.card_id)).join(", ") : "none"}`
          : `Zaklęcia: ${spells.length} (face down — 9.3)`,
      ].join("\n");
    }

    case "spell": {
      const seat = seatOf(command.who);
      const spellId = await drawSpell(gameId, seat.id);
      return `${named(seat)} draws ${cardName(spellId)}.`;
    }
  }
}
