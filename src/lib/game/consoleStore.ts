/** One typed line from the test console, carried out against a real table. */

import characters from "@/data/characters.json";
import { ruleLines } from "@/lib/engine/ruleLines";
import { cardIdNamed, describeCard } from "@/lib/engine/lookup";

import type { Character } from "@/data/types";
import { asFieldId, FIELDS, requireFieldId, type FieldId } from "@/lib/engine/board";
import { spellScript } from "@/lib/engine/spells";
import { SPELL_BY_ID, pileContents } from "./decks";
import { isRandomPick, RANDOM_CHARACTER_ID } from "@/lib/engine/characters";
import {
  helpLines,
  pickPlayer,
  statReply,
  type Command,
  type EffectName,
} from "@/lib/engine/console";
import { cardName } from "@/lib/engine/polish";
import { combatValueOf } from "@/lib/engine/cards";
import { EVENTS, SPELL_BY_REF } from "./decks";
import { TROPHY_RATE, offersFor } from "./commands/shop";
import { carriesSpell, fightsForYou, heldAbilities, type Ability } from "@/lib/engine/abilities";
import type { Modifier } from "@/lib/engine/status";
import { foldStatuses, type StatusRow } from "@/lib/engine/statusRows";
import { change } from "./change";
import { ADJUSTABLE, type Adjustable } from "./commands/adjust";
import { driverOf, isQuiet, nameOfSeat } from "./commands/lobby";
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
import { gameById, holdingsFor, seatsFor, usersFor, type SeatRow, type UserRow } from "./store";
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
  drawCard,
  drawSpell,
  drawSpellWithWand,
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
  settleSpell,
  spendHolding,
  clearField,
  stackCard,
  stageCard,
  stackNth,
  takeCard,
  takeFromField,
  stageFight,
  takeNewCharacter,
  turnToStone,
  answerAsk,
  answerScript,
} from "./turnStore";
import { activeStore } from "./gameStore";
import { compulsoryOffer } from "@/lib/engine/fieldScript";
import { only, replaceTop, top } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";
import { askOnTop } from "@/lib/engine/ask";
import { overflowOnTop, overflowSaid } from "@/lib/engine/overflow";
import { overflowOf, waysOut } from "./commands/overflow";
import type { Snapshot } from "./change";
import { eqModeOf, seatView, trophyModeOf, turnQueueOf } from "./commands/seat";
import { DEALABLE } from "@/lib/engine/console";
import { figuresText } from "@/lib/engine/figures";
import { fitsIn, slotsFor, SLOTS, type Slot } from "@/lib/engine/slots";
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
  fog: { label: "Mgła (tryb testowy)", modifier: { kind: "move-max", fields: 1 } },
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
  script: "a Karta mid-resolution",
  loop: "a Wróg fought in rounds",
  overflow: "somebody is over their limit",
  end: "end of turn",
};

/**
 * One frame, named for the `Stack:` line.
 *
 * A loop is the one frame whose kind is not the interesting part: three heads
 * with one cut is a different position from three with two, and "a Wróg fought
 * in rounds" says neither. It is also the one frame never on top, so this line
 * is the only place it is ever seen.
 */
function frameLabel(frame: TurnPhase): string {
  if (frame.phase === "loop") {
    return `${frame.of.cardName}: ${frame.round} ${frame.done + 1} z ${frame.times}`;
  }
  return PHASE[frame.phase] ?? frame.phase;
}

/**
 * The overflow frame written out, with every way out of it listed.
 *
 * Public, all of it, and that is the difference from `askLines`. A hand of
 * Zaklęcia is 9.3's secret; a Przedmiot is not, and neither is the fact that
 * somebody is carrying more than they may. The whole table is waiting on this,
 * so the whole table is told what it is waiting for and what would end it.
 *
 * The ways out are read fresh rather than off the frame, because using a card
 * changes them — see `waysOut`.
 */
function overflowLines(snapshot: Snapshot): string[] {
  const frame = overflowOnTop(snapshot.game.turn_state);
  if (!frame) return [];
  const seat = snapshot.seats.find((one) => one.id === frame.seatId);
  const over = overflowOf(snapshot, frame.seatId);
  if (!seat || !over) return [];

  const whose = nameOfSeat(snapshot.users, seat.seat_index);
  const said: Record<string, string> = {
    odrzuc: "odrzuć  (na Obszar)",
    uzyj: "użyj    (na stos zużytych)",
    zaloz: "załóż   (na siebie)",
  };
  return [
    overflowSaid(over, whose),
    ...waysOut(snapshot, frame.seatId).map(
      (way) => `  ${said[way.kind]}  ${cardName(way.cardId)}`,
    ),
    "  — `drop <nazwa>`, `use <nazwa>` albo `equip <nazwa>`",
  ];
}

/**
 * The `ask` frame written out, with its options numbered for `answer <n>`.
 *
 * Shown only to the seat it is waiting on. The two Karty are off the top of a
 * pile nobody may see (9.3, and `withoutDeck`), so a console driving another
 * seat is told that somebody is choosing and not what they are choosing
 * between — the same line every other device gets.
 */
function askLines(snapshot: Snapshot, forSeatId: string | null): string[] {
  const frame = askOnTop(snapshot.game.turn_state);
  if (!frame) return [];
  const who = snapshot.seats.find((one) => one.id === frame.seatId);
  const whose = who ? nameOfSeat(snapshot.users, who.seat_index) : "somebody";
  if (forSeatId !== frame.seatId) return [`${whose} is choosing a Zaklęcie (9.3 — not yours to see).`];
  return [
    `${frame.reason}: pick one — \`answer <n>\``,
    ...frame.question.refs.map((ref, at) => {
      const spell = SPELL_BY_REF.get(ref);
      return `  ${at} — ${spell ? cardName(spell.id) : ref}`;
    }),
  ];
}

/** The question the turn is stuck on, for `look`. */
function waitingOn(turnState: unknown): string[] {
  const state = turnState as {
    phase?: string;
    fieldId?: FieldId;
    drawn?: { cardId: string }[];
    resolved?: string[];
    fought?: string[];
  };
  if (state.phase !== "field") return [];
  const offer = compulsoryOffer(state.fieldId ?? null, state.resolved ?? []);
  /**
   * Fought counts as dealt with, not just resolved.
   *
   * 17.4 settles a Wróg the moment the dice are compared, and `beginFight`
   * refuses a rematch on that same list — so a creature in `fought` is one this
   * turn can do nothing more about, whether it was beaten or walked away from.
   * Reading only `resolved` had the console announce a Smok as still waiting
   * after he had been killed and picked up as a trophy, which is the referee
   * telling the table to deal with something it has already dealt with.
   */
  const settled = new Set([...(state.resolved ?? []), ...(state.fought ?? [])]);
  const waiting = (state.drawn ?? []).filter((one) => !settled.has(one.cardId));
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

/**
 * A card id off a printed name, for the verbs that name one nobody holds yet.
 *
 * `buy` is the only one: what is on sale is the Obszar's list rather than
 * anything in a hand, so there is no holding to look the id up from.
 */
function idNamed(said: string): string {
  const found = cardIdNamed(said);
  if ("id" in found) return found.id;
  if ("candidates" in found) throw new Error(`Which one — ${found.candidates.join(", ")}?`);
  throw new Error(`No card called \`${found.missing}\`.`);
}

/** Whether a card id is the card somebody just named. */
function sameName(cardId: string, said: string): boolean {
  return fold(cardName(cardId)) === fold(said.trim());
}

/**
 * An Obszar by the name printed on the board, for a Zaklęcie thrown at one.
 *
 * The `place` verb resolves its field in the parser, where the grammar knows
 * it is a field. `cast` cannot: what the word after `at` names depends on the
 * card, and the card is not known until the hand has been looked in.
 */
function fieldNamed(said: string): FieldId {
  const want = fold(said.trim());
  for (const field of FIELDS.values()) {
    if (fold(field.name) === want || field.id === said.trim()) return field.id;
  }
  const near = [...FIELDS.values()].filter((field) => fold(field.name).startsWith(want));
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((field) => field.name).join(", ")}?`);
  }
  throw new Error(`No Obszar called \`${said}\`.`);
}

/** A Karta lying face up on the board, by name (16.8). */
async function fieldCardNamed(gameId: string, said: string) {
  const snapshot = await activeStore().load(gameId);
  const hit = snapshot.fieldCards.find((row) => sameName(row.card_id, said));
  if (hit) return hit;
  const near = snapshot.fieldCards.filter((row) =>
    fold(cardName(row.card_id)).startsWith(fold(said.trim())),
  );
  if (near.length > 0) {
    throw new Error(`Which one — ${near.map((row) => cardName(row.card_id)).join(", ")}?`);
  }
  throw new Error(`No Karta called \`${said}\` is lying on the board.`);
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
/**
 * Who is doing the fighting, when it is not the character.
 *
 * Only the Rycerz does this, and without saying so the fight line reads as a
 * character who has mysteriously become 3 and 3 — worse for a player holding
 * one, because his figure is often *lower* than their own and looks like a bug
 * rather than the card working.
 */
function championLine(view: { abilities: readonly Ability[]; holdings: readonly { cardId: string }[] }): string {
  if (!fightsForYou(view.abilities)) return "";
  const who = view.holdings.find((held) => fightsForYou(heldAbilities([held.cardId])));
  return who ? `${cardName(who.cardId)} fights for you` : "";
}

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
    /**
     * Through the store, not through `gameById`.
     *
     * `gameById` reads the Supabase singleton directly, so `who` answered
     * "Missing SUPABASE_URL" at a terminal playing a save file — the one
     * surface that has no Postgres behind it. Every other read in here goes
     * through the port, which is the whole reason the port exists.
     */
    const snapshot = await activeStore().load(gameId);
    const game = snapshot.game;
    const queue = turnQueueOf(snapshot);
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
        /**
         * And what is on them, which is the whole reason a roster is read.
         *
         * 9.3 hides a hand of Zaklęcia and nothing else: an effect is a thing
         * the table can see, and has to be able to see, because whose turn is
         * being passed over and why is exactly what makes turn order hard to
         * follow. `mine` is false here on purpose even for your own row — this
         * is the list of everybody, and "po twojej turze" on one line of it
         * reads as a claim about the others.
         */
        effects: foldStatuses(seatView(snapshot, seat.id).statuses, {
          queue,
          seatIndex: seat.seat_index,
        }),
      };
    });

    const wide = Math.max(0, ...rows.map((row) => row.card.length));
    const lines = rows.flatMap((row) => [
      `${row.at}  ${row.card.padEnd(wide)}  ${row.who}`,
      // Indented under the seat they belong to rather than squeezed into a
      // fourth column: one seat can carry five of these and a column would
      // wrap every other row on the table.
      ...row.effects.map((effect) => `      ${effectRow(effect)}`),
    ]);

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
    case "deal": {
      if (command.cardId === null) {
        return DEALABLE.flatMap((group, at) => [
          ...(at > 0 ? [""] : []),
          `${group.title} (${group.cards.length})`,
          ...columns(group.cards.map((one) => one.name)),
        ]).join("\n");
      }
      const seat = seatOf(null);
      if (SPELL_BY_ID.has(command.cardId)) {
        await grantCard(gameId, seat.id, command.cardId);
        return `${named(seat)} draws ${cardName(command.cardId)}.`;
      }
      await stageCard(gameId, seat.id, command.cardId);
      return `Dealt: ${cardName(command.cardId)}.`;
    }

    /**
     * An Obszar swept clear — the inverse of `place`, and of a `deal` whose
     * Karta has since settled there.
     */
    case "clear": {
      const seat = seatOf(null);
      const where = command.fieldId ?? seat.field_id;
      if (!where) throw new Error("Postać nie stoi na żadnym polu.");
      const gone = await clearField(gameId, seat.id, requireFieldId(where), command.cardId);
      return command.cardId
        ? `${cardName(command.cardId)} off ${fieldName(asFieldId(where))}.`
        : `${fieldName(asFieldId(where))} swept — ${gone.length} ${gone.length === 1 ? "Karta" : "Kart"} on the used pile.`;
    }

    case "place": {
      const seat = seatOf(null);
      const where = await placeCard(gameId, seat.id, command.cardId, command.fieldId);
      return `${cardName(command.cardId)} lies on ${FIELDS.get(where)?.name ?? where}.`;
    }

    case "nature": {
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
     * Shops, healers and Zaklęcia.
     * ------------------------------------------------------------------- */

    case "buy": {
      const seat = seatOf(null);
      const card = idNamed(command.name);
      await buyGoods(gameId, seat.id, card);
      return `${named(seat)} buys ${cardName(card)}.`;
    }

    case "sell": {
      const seat = seatOf(null);
      const held = await holdingNamed(gameId, seat.id, command.name);
      await sellHolding(gameId, seat.id, held.id);
      return `${named(seat)} sells ${cardName(held.card_id)}.`;
    }

    /**
     * A point of Życie back, or several bought from a healer.
     *
     * Two different acts share the word because from where somebody is sitting
     * there is one — "put a point back" — and whether it is free or paid for is
     * the Obszar's business. A number means the healer, since that is the only
     * one you can buy more than one of.
     */
    case "heal": {
      const seat = seatOf(null);
      const now =
        command.points === null
          ? await healSeat(gameId, seat.id)
          : await payHealer(gameId, seat.id, command.points);
      return `${named(seat)} — ${typeof now === "number" ? now : "?"} Życia.`;
    }

    case "cast": {
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
    }

    /**
     * The other end of the pause a cast opens.
     *
     * A Zaklęcie waits while anybody at the table could answer it, and this is
     * the table saying nobody will — the same shortcut `release` gives a claim
     * on the floor. It also happens on its own when the window closes, so with
     * nothing waiting this is not an error, it is nothing to do.
     */
    case "endcast": {
      const done = await settleSpell(gameId, true);
      return done ? [`${done.spell} takes effect.`, ...(done.did ?? [])].join("\n") : "Nothing is in the air.";
    }

    case "trade": {
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
    }

    /**
     * Which way this table keeps a beaten Wróg (1.4). See docs/TROFEA.md.
     *
     * Reading it needs no seat and no turn, so a bare `trophies` answers from
     * the poczekalnia as well as mid-game — which is the point of asking: the
     * one moment you can still change it is the one moment the answer is not
     * yet on any card.
     */
    case "trophies": {
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
    }

    /**
     * The Bestia, which is how the game is won (14.7, 22).
     *
     * Four dice — the kind of fight, its strength, and one each — and all four
     * are the app's, so this is one line where the browser walks four presses.
     * 10.5 makes it compulsory once announced; there is no backing out, which
     * is why nothing here offers one.
     */
    case "beast": {
      const seat = seatOf(null);
      await fightBeast(gameId, null, null, null, null);
      const after = (await activeStore().load(gameId)).game;
      if (after.status === "finished") return `${named(seat)} beats the Bestia. That is the game.`;
      const now = (await seatsFor(gameId)).find((one) => one.id === seat.id);
      return now?.eliminated
        ? `${named(seat)} loses to the Bestia and dies (14.7, 4.4).`
        : `${named(seat)} loses to the Bestia — 2 Życia, and off the Most (14.7).`;
    }

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
    case "bridge": {
      const seat = seatOf(null);
      const state = top((await activeStore().load(gameId)).game.turn_state) as {
        options?: { fieldId: string; fieldName: string; bridge?: unknown }[];
      };
      const offered = (state.options ?? []).find((one) => one.bridge !== undefined);
      if (!offered) throw new Error("Nie ma stąd wejścia na Most.");
      await moveTo(gameId, offered.fieldId, true);
      return `${named(seat)} turns onto the Most at ${offered.fieldName}.`;
    }

    case "cross": {
      const seat = seatOf(null);
      const done = await crossRing(gameId, command.to ? { to: command.to } : {});
      const rolled = done.dice ? ` (${done.dice.join("+")} against Magia ${done.magia})` : "";
      return done.to
        ? `${named(seat)} crosses to ${fieldName(asFieldId(done.to))}.${rolled}`
        : `${named(seat)} does not get across.${rolled}`;
    }

    case "guardian": {
      const seat = seatOf(null);
      await fightGuardian(gameId);
      return `${named(seat)} squares up to what is in the way.`;
    }

    case "ferry": {
      const seat = seatOf(null);
      const { at } = await payFerry(gameId, command.pay);
      return command.pay
        ? `${named(seat)} pays the Przeprawa and lands on ${fieldName(asFieldId(at))}.`
        : `${named(seat)} does not pay, and goes back to ${fieldName(asFieldId(at))}.`;
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
      const state = top(snapshot.game.turn_state) as {
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
      const owed = top((await activeStore().load(gameId)).game.turn_state) as {
        fight?: { strengthRoll?: number | null };
      };
      if (owed.fight?.strengthRoll === null) await rollGuardianStrength(gameId, null);

      // Null on both, because the app throws its own dice in simulation.
      await fightRoll(gameId, "player", null);
      await fightRoll(gameId, "enemy", null);

      const after = top((await activeStore().load(gameId)).game.turn_state) as {
        fight?: {
          cardName: string;
          playerTotal: number;
          enemyTotal: number;
          playerRoll: number | null;
          enemyRoll: number | null;
          /** An object, not a string — `CombatResult` carries who won as well. */
          result: { outcome: "wygrana" | "przegrana" | "remis" } | null;
          /** Set only in a duel, which is the one fight 17.9 pays out for. */
          opponentSeat?: number;
        };
      };
      const fight = after.fight;
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
      const ended = top((await activeStore().load(gameId)).game.turn_state) as { phase?: string };
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

    case "claim": {
      const seat = seatOf(null);
      const took = await claimMission(gameId);
      return `${named(seat)} completes the misja and receives ${took}.`;
    }

    case "free": {
      const seat = seatOf(null);
      const out = await breakFree(gameId);
      return out.freed.length > 0
        ? `${named(seat)} rolls ${out.die} and breaks free.`
        : `${named(seat)} rolls ${out.die} — still held.`;
    }

    case "ask": {
      const seat = seatOf(null);
      const said = await speakCarriedSpell(gameId);
      return `${named(seat)}: ${said.spell}${said.effect ? ` — ${said.effect}` : ""}`;
    }

    case "pay": {
      const seat = seatOf(null);
      const paid = await payFriend(gameId);
      return `${named(seat)} pays ${cardName(paid)} for this turn.`;
    }

    case "raid": {
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
    }

    /**
     * The deck arranged so the next `draw` is a card somebody named.
     *
     * Says which pile, because the two are drawn by different verbs — a
     * Zaklęcie stacked and then hunted for with `draw` would look broken.
     */
    case "stack": {
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
    }

    /**
     * What is left to deal, and what has been dealt.
     *
     * Numbered from the top, because that is the number `stack 10` takes — the
     * two are one another's halves. The used pile is counted rather than
     * listed: what matters about it is 9.5, that it is what comes back when the
     * draw runs out, and sixty names would bury the twenty that are still live.
     */
    case "pile": {
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
    }

    /**
     * 17.9's payout, which only a won duel owes.
     *
     * Bare is the Życie — the one the app always took, and still the ordinary
     * answer. `zloto` takes a Sztuka Złota. A name takes that Przedmiot,
     * matched against what the loser is actually holding, so "MIECZ" points at
     * their Miecz and not at the idea of one.
     */
    case "spoils": {
      const seat = seatOf(null);
      const state = top((await activeStore().load(gameId)).game.turn_state) as {
        phase?: string;
        fight?: { opponentSeat?: number; result?: { outcome: string } | null };
      };
      const fight = state.fight;
      if (state.phase !== "fight" || !fight) throw new Error("Nie ma walki.");
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
    }

    case "endfight":
      await abandonFight(gameId);
      return "Fight dropped.";

    case "endturn": {
      // The turn does not always pass: a surplus opens a frame instead, and
      // saying "Turn passed" over one would be the console announcing the
      // opposite of what it just did.
      if ((await finishTurn(gameId)) === "passed") return "Turn passed.";
      return overflowLines(await activeStore().load(gameId)).join("\n");
    }

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
      const state = top((await activeStore().load(gameId)).game.turn_state) as {
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
      const state = top(snapshot.game.turn_state) as {
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

    /**
     * The Instrukcja, for the surface that cannot open the Księga.
     *
     * Off the table like `help` and `card`: a rule is true before anybody sits
     * down, and somebody reading up on 17.4 before starting should not have to
     * open a game to do it.
     */
    case "rule":
      return ruleLines(command.about).join("\n");

    case "look": {
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

      const state = top(game.turn_state) as {
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
        `Round ${game.round} — ${active ? named(active) : "nobody"}`,
        `Obszar: ${fieldName(active?.field_id ?? null)}`,
        `Phase: ${PHASE[phase] ?? phase}${state.roll ? ` (rolled ${state.roll})` : ""}`,
        // The pile under the running frame, when there is one — a summoned
        // fight over the roll it interrupted. Printed bottom-up so it reads in
        // the order it will resolve back down. Silent at depth 1, which is
        // every ordinary turn.
        ...(game.turn_state.stack.length > 1
          ? [
              `Stack: ${game.turn_state.stack.map(frameLabel).join(" › ")}`,
            ]
          : []),
        ...(state.options?.length
          ? [`Reaches: ${state.options.map((one) => one.fieldName).join(", ")}`]
          : []),
        ...(here.length
          ? [`On the Obszar: ${here.map((one) => cardName(one.card_id)).join(", ")}`]
          : []),
        // The one thing the whole table is waiting on, spelled out with its
        // ways out — before `waitingOn`, because it is what everything else in
        // this list has stopped for.
        ...overflowLines(snapshot),
        ...waitingOn(top(game.turn_state)),
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
        .filter((one) => one.slot !== null)
        .sort((a, b) => SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot));
      const carried = items.filter((one) => one.slot === null).sort(byName);
      /**
       * Beaten minus held, as a multiset: two Nobbiny are two of each, and a
       * set difference would call the second one gone.
       *
       * Asked in both variants now. It used to be „Karty pokonanych" only,
       * because „Punkty" had no trophy holding to subtract from — it does, and
       * the subtraction means the same thing there: whom this seat beat and no
       * longer has.
       */
      const leftHand = (() => {
        const still = trophies.map((one) => one.card_id);
        return seat.trophy_beaten.filter((cardId) => {
          const at = still.indexOf(cardId);
          if (at === -1) return true;
          still.splice(at, 1);
          return false;
        });
      })();
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
                .map((one) => `${cardName(one.card_id)} ${trophyPoints(one.card_id, view.parametr)}`)
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
    }

    case "spell": {
      const seat = seatOf(command.who);
      const spellId = command.wand
        ? await drawSpellWithWand(gameId, seat.id)
        : await drawSpell(gameId, seat.id);
      // Null is the Chochlik: nothing was dealt, a question is on screen
      // instead. Read back rather than guessed at, so the console names the
      // Karty the server actually lifted — and only for the seat they are for.
      if (spellId === null) return askLines(await activeStore().load(gameId), seat.id).join("\n");
      return `${named(seat)} draws ${cardName(spellId)}.`;
    }
  }
}

/**
 * A list of names as indented rows, so a long one does not scroll a heading off.
 *
 * Sixty-three Przedmioty in one column is a page; in rows of four it is a
 * paragraph. Fixed at four rather than measured against a terminal, because
 * nothing here knows how wide one is and a wrong guess wraps every row.
 */
/**
 * What a second copy of an effect did, in the two words it takes to say it.
 *
 * Only ever printed where there *was* a second copy. A card that visibly did
 * nothing is the sort of thing a table argues about two turns later, and the
 * argument is always the same one: did it stack? `stackingOf` already knows;
 * this is that answer reaching the person who drew the card.
 */
const STACK_SAID: Record<StatusRow["stacking"], string> = {
  sums: "sumuje się",
  queues: "po kolei",
  refreshes: "odnawia",
  exclusive: "bez zmian",
};

/** One effect, as a line: what it is, how many landed, and when it lapses. */
function effectRow(row: StatusRow): string {
  return (
    `${row.mark.glyph} ${row.label}` +
    (row.count > 1 ? ` ×${row.count} (${STACK_SAID[row.stacking]})` : "") +
    ` — ${row.when}`
  );
}

/**
 * A seat's effects as a block, with the one caveat that applies to all of them.
 *
 * The caveat is printed once and only where it is earned. A round taken off a
 * stored deadline is exact; a round worked out by walking the turn order is a
 * forecast, because the next Karta drawn can add a lost turn to somebody and
 * move every date after it. Saying so on every line would be noise, and noise
 * is what stops the real warnings being read.
 */
function effectLines(rows: readonly StatusRow[]): string[] {
  if (rows.length === 0) return [];
  return [
    "Effects:",
    ...rows.map((row) => `  ${effectRow(row)}`),
    ...(rows.some((row) => row.lapse?.certainty === "prognoza")
      ? ["  (rundy liczone w turach są prognozą — jedna Karta może je przesunąć)"]
      : []),
  ];
}

function columns(names: readonly string[], perRow = 4): string[] {
  const widest = Math.max(...names.map((one) => one.length), 0);
  const rows: string[] = [];
  for (let at = 0; at < names.length; at += perRow) {
    rows.push(
      "  " +
        names
          .slice(at, at + perRow)
          .map((one) => one.padEnd(widest))
          .join("  ")
          .trimEnd(),
    );
  }
  return rows;
}

/**
 * What one beaten Wróg is worth towards 1.4's sevens.
 *
 * `mirror` is the holder's own Miecz, for the Sobowtór, who has no number of
 * his own — see `combatValueOf`.
 */
function trophyPoints(cardId: string, mirror?: { miecz: number }): number {
  const card = EVENTS.find((one) => one.id === cardId);
  return (card ? combatValueOf(card, mirror)?.total : 0) ?? 0;
}

/**
 * The sum, the Miecze it buys and what handing in all of it would burn.
 *
 * Said because 1.4 gives the player the choice of what to offer, and a choice
 * you have to do arithmetic for on paper is a choice the referee is not helping
 * with. Empty when there is nothing to say — a hand worth less than one Miecz
 * has no waste to warn about, only a total.
 */
function trophyLedger(cardIds: readonly string[], mirror: { miecz: number }): string {
  const points = cardIds.reduce((sum, cardId) => sum + trophyPoints(cardId, mirror), 0);
  const swords = Math.floor(points / TROPHY_RATE);
  const wasted = points - swords * TROPHY_RATE;
  if (swords < 1) return `  (${points} pkt — ${TROPHY_RATE} za Miecz)`;
  return `  (${points} pkt → ${swords} Miecz${swords === 1 ? "" : "e"}, ${wasted} przepadnie)`;
}

/**
 * What each number of Miecze would actually cost, one row apiece.
 *
 * The line above says what an all-in trade comes to, which is the trade nobody
 * should make: 1.4 lets you pick, and picking well is a subset-sum the engine
 * already solves. Printing the answers turns "what do I hand in for two
 * Miecze" from arithmetic on paper into a line you read and a number you type.
 *
 * Nothing when there is only the one way to do it — a hand that buys exactly
 * one Miecz using everything it has needs no menu, and the line above already
 * said so.
 */
function tradeMenu(cardIds: readonly string[], mirror: { miecz: number }): string[] {
  const offers = offersFor(
    cardIds.map((cardId) => ({ cardId, points: trophyPoints(cardId, mirror) })),
  );
  if (offers.length === 0) return [];
  const only = offers.length === 1 && offers[0].cardIds.length === cardIds.length;
  if (only) return [];
  return offers.map((offer) => {
    const cost =
      offer.cardIds.length === cardIds.length
        ? "wszystko"
        : offer.cardIds.map((cardId) => cardName(cardId)).join(", ");
    const burn = offer.wasted > 0 ? `, ${offer.wasted} przepadnie` : ", nic nie przepadnie";
    return `  trade ${offer.swords} → ${cost} (${offer.points} pkt${burn})`;
  });
}

