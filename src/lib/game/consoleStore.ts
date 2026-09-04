/** One typed line from the test console, carried out against a real table. */

import { characterName, effectRow } from "./consoleLines";

import { pickPlayer, type Command } from "@/lib/engine/console";
import { foldStatuses } from "@/lib/engine/statusRows";
import {
  driverOf,
  nameOfSeat,
} from "./commands/lobby";
import {
  isQuiet,
} from "./commands/presence";
import { seatsFor, usersFor, type SeatRow, type UserRow } from "./store";
import { activeStore } from "./gameStore";
import { seatView, turnQueueOf } from "./commands/seat";
import { VERBS, type Actor, type ConsoleContext } from "./consoleVerbs";

export type { Actor } from "./consoleVerbs";

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

  const ctx: ConsoleContext = {
    gameId,
    actor,
    seats,
    people,
    driver,
    seatOf,
    userOf,
    seatByNumber,
    pickedSeat,
    named,
    turnMoved,
    roster,
  };

  // The cast is the one seam TypeScript cannot see through, exactly as in
  // `commands/ops.ts`: the table is keyed so `VERBS[command.kind]` and
  // `command` agree by construction.
  return (VERBS[command.kind] as (c: ConsoleContext, k: Command) => Promise<string> | string)(
    ctx,
    command,
  );
}
