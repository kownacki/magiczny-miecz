/** Playing a recorded game again, and saying whether it came out the same. */

import { parseCommand } from "@/lib/engine/console";
import { runCommand } from "./consoleStore";
import { emptyTables, memoryHandle, memoryStore, setStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import type { SaveFile } from "./saves";
import { scriptRolls, stopScripting } from "./record";
import { createGame, joinGame, seatsFor, usersFor } from "./store";
import { activeStore } from "./gameStore";

/**
 * Why replay rather than an undo stack.
 *
 * To reach move forty, run one to forty into a fresh game. Nothing is inverted,
 * so nothing can be inverted *wrongly* — and inverting is where this would have
 * gone wrong: undoing a shuffle, a reshuffle, or a deal off a pile are three
 * different operations and two of them are guesses. A replay either reproduces
 * the state or it does not, and a comparison says which.
 *
 * It is cheap for the same reason a board game is small. A hundred turns is a
 * few hundred commands against an in-memory table.
 *
 * # What has to be true for it to work
 *
 * A command is a pure function of its snapshot, its inputs and its randomness.
 * The snapshot is the game so far, so a replay from the beginning needs the
 * other two — and both are now recoverable. Shuffles come off the seed and the
 * revision (`prng.ts`), so replaying reaches the same order for nothing. Dice
 * are in the log, and `change` prefers them while they last.
 *
 * If a replay diverges, one of those three is not true, and finding out which
 * is the point of running it.
 */

/** How far to replay: every line, or the first `upTo` of them. */
export interface ReplayOptions {
  upTo?: number;
}

/**
 * The game the log describes, built again from nothing.
 *
 * The table itself is not in the log — `table new Kowi, Ola` is `mm`'s, not the
 * game's — so it is rebuilt from the people the save ended with, in the order
 * they sat down. That holds for a table opened at a terminal, which is every
 * table that has a log; a browser game has no log to replay.
 */
export async function replay(file: SaveFile, options: ReplayOptions = {}): Promise<Tables> {
  const original = file.tables.games[0] as Record<string, unknown> | undefined;
  if (!original) throw new Error("Ten zapis nie zawiera gry.");

  const players = file.tables.users
    .map((one) => (one as Record<string, unknown>).name)
    .filter((name): name is string => typeof name === "string");

  const tables = emptyTables();
  const handle = memoryHandle(tables);
  const { game } = await createGame(
    players[0] ?? null,
    "simulation",
    original.eq_mode === "classic" ? "classic" : "slots",
    null,
    handle,
  );
  for (const name of players.slice(1)) await joinGame(game.id, name, null, false, null, handle);

  /**
   * The seed is put back rather than minted.
   *
   * Every shuffle is a function of it, so a replay under a fresh seed would
   * deal a different game from the same moves — which is the failure this is
   * meant to detect, arriving from the harness instead of the engine.
   */
  (tables.games[0] as Record<string, unknown>).seed = original.seed ?? null;

  setStore(memoryStore(tables));
  const entries = options.upTo === undefined ? file.log : file.log.slice(0, options.upTo);

  try {
    for (const entry of entries) {
      const parsed = parseCommand(entry.line);
      if ("error" in parsed) throw new Error(`${entry.seq}: ${entry.line} — ${parsed.error}`);
      scriptRolls(entry.rolls);
      await runCommand(game.id, await actorFor(game.id), parsed.ok);
    }
  } finally {
    stopScripting();
  }
  return tables;
}

/**
 * Whoever the game is waiting for, which is what `mm` hands `runCommand`.
 *
 * The log records who typed a line, and this deliberately does not use it: an
 * actor read from the game is the same rule the prompt follows, so a replay
 * that needs the recorded name would be saying the two disagree.
 */
async function actorFor(gameId: string) {
  const [seats, people] = await Promise.all([seatsFor(gameId), usersFor(gameId)]);
  const game = (await activeStore().load(gameId)).game;
  const seat =
    game.active_seat === null
      ? (seats.find((one) => {
          const who = people.find((p) => p.seat_index === one.seat_index);
          return who !== undefined && !who.ready;
        }) ?? seats[0])
      : (seats.find((one) => one.seat_index === game.active_seat) ?? seats[0]);
  const driver = people.find((one) => one.seat_index === seat?.seat_index) ?? people[0];
  return { userId: driver?.id ?? "", seatId: seat?.id ?? null };
}

/**
 * Where two games differ, in the terms somebody would argue about.
 *
 * Not a deep equality: ids are uuids minted per run and mean nothing, and a
 * replay that reproduced them would be testing `gen_random_uuid` rather than
 * the rules. What has to match is the game — whose turn, standing where, with
 * what, and the journal that says how it got there.
 */
export function differences(a: Tables, b: Tables): string[] {
  const said: string[] = [];
  const check = (what: string, left: unknown, right: unknown) => {
    const l = JSON.stringify(left);
    const r = JSON.stringify(right);
    if (l !== r) said.push(`${what}: ${l} ≠ ${r}`);
  };

  const gameOf = (t: Tables) => {
    const row = (t.games[0] ?? {}) as Record<string, unknown>;
    return { status: row.status, turn: row.turn, active_seat: row.active_seat, seed: row.seed };
  };
  check("game", gameOf(a), gameOf(b));

  const seatsOf = (t: Tables) =>
    [...t.seats]
      .map((one) => one as Record<string, unknown>)
      .sort((x, y) => Number(x.seat_index) - Number(y.seat_index))
      .map((one) => ({
        seat: one.seat_index,
        character: one.character_id,
        field: one.field_id,
        life: one.life,
        gold: one.gold,
        sword: one.sword_own,
        magic: one.magic_own,
        nature: one.nature,
        eliminated: one.eliminated,
      }));
  check("seats", seatsOf(a), seatsOf(b));

  /** By card and seat, sorted: two packs holding the same cards are the same pack. */
  const heldOf = (t: Tables) => {
    const seatAt = new Map(
      t.seats.map((one) => [
        (one as Record<string, unknown>).id as string,
        (one as Record<string, unknown>).seat_index,
      ]),
    );
    return [...t.holdings]
      .map((one) => one as Record<string, unknown>)
      .map((one) => `${seatAt.get(one.seat_id as string)}:${one.card_id}:${one.kind}:${one.slot}`)
      .sort();
  };
  check("holdings", heldOf(a), heldOf(b));

  const journalOf = (t: Tables) =>
    [...t.moves]
      .map((one) => one as Record<string, unknown>)
      .sort((x, y) => Number(x.seq) - Number(y.seq))
      .map((one) => `${one.seq}:${one.kind}:${JSON.stringify(one.payload)}`);
  check("journal", journalOf(a), journalOf(b));

  return said;
}
