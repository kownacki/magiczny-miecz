import { top } from "@/lib/engine/stack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "@/lib/engine/console";
import { runCommand } from "./consoleStore";
import { activeStore, resetStore, setStore } from "./gameStore";
import { newSave, readSave, writeSave } from "./saves";
import { startRecording, stopRecording, stopScripting } from "./record";
import { differences, replay } from "./replay";
import { seatsFor, usersFor } from "./store";
import type { Recorded } from "./record";

/**
 * The claim this whole thing rests on: a game is a function of what was typed.
 *
 * If a recorded game replays to the same state, then the engine is
 * deterministic, the seed really does carry the shuffles, and the log really is
 * every input. If it does not, one of those three is false — and which is what
 * `differences` is for.
 */

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "mm-replay-"));
  process.env.MM_HOME = home;
});

afterEach(async () => {
  delete process.env.MM_HOME;
  stopScripting();
  stopRecording();
  resetStore();
  await rm(home, { recursive: true, force: true });
});

/**
 * Plays a game the way `mm` does, recording each line that changed something.
 *
 * The save is written after each entry, not left for the next commit to carry:
 * the file is written *during* a command, so an entry pushed afterwards is one
 * behind until something else happens. `mm` writes for the same reason, and a
 * test that did not would replay a log missing its last line.
 */
async function played(lines: string[]) {
  const { code, gameId, tables, log, store } = await newSave(["Kowi", "Ola"]);
  setStore(store);
  const keep = async () =>
    writeSave(code, { version: 1, savedAt: new Date().toISOString(), tables, log });

  for (const line of lines) {
    const parsed = parseCommand(line);
    if ("error" in parsed) throw new Error(`${line}: ${parsed.error}`);
    const was = (await activeStore().load(gameId)).game.revision;
    startRecording();
    try {
      await runCommand(gameId, await actorFor(gameId), parsed.ok);
    } catch {
      // A refused line changed nothing and is not recorded — same as `mm`.
      stopRecording();
      continue;
    }
    const now = (await activeStore().load(gameId)).game.revision;
    const rolls = stopRecording();
    if (now !== was) {
      log.push({ seq: log.length + 1, actor: "?", line, rolls } as Recorded);
      await keep();
    }
  }
  return { code, gameId, tables, log, keep };
}

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

/** A few turns of an actual game — a roll, a walk, whatever the Obszar wanted. */
async function someTurns(turns: number): Promise<string[]> {
  const lines = ["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"];
  const { gameId, log, keep } = await played(lines);
  for (let n = 0; n < turns; n++) {
    const state = top((await activeStore().load(gameId)).game.turn_state) as {
      options?: { fieldName: string }[];
    };
    const next: string[] = ["roll"];
    if (state.options?.length) next.push(`move ${state.options[0].fieldName}`);
    next.push("draw", "answer", "endturn");
    for (const line of next) {
      const parsed = parseCommand(line);
      if ("error" in parsed) continue;
      startRecording();
      const was = (await activeStore().load(gameId)).game.revision;
      try {
        await runCommand(gameId, await actorFor(gameId), parsed.ok);
      } catch {
        stopRecording();
        continue;
      }
      const now = (await activeStore().load(gameId)).game.revision;
      const rolls = stopRecording();
      if (now !== was) {
        log.push({ seq: log.length + 1, actor: "?", line, rolls } as Recorded);
        await keep();
      }
    }
    lines.push(...next);
  }
  return lines;
}

describe("playing a recorded game again", () => {
  it("reaches the same table from the same log", async () => {
    const { code } = await played(["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"]);
    const saved = await readSave(code);

    const again = await replay(saved);
    expect(differences(saved.tables, again)).toEqual([]);
  });

  /**
   * The one that would fail if the dice were not in the log. A roll is the
   * first thing in a game that could have come out otherwise.
   */
  it("throws the dice it threw the first time", async () => {
    await someTurns(4);
    const codes = (await import("./saves")).listSaves;
    const [only] = await codes();
    const saved = await readSave(only.code);
    expect(saved.log.some((one) => one.rolls.length > 0)).toBe(true);

    const again = await replay(saved);
    expect(differences(saved.tables, again)).toEqual([]);
  });

  it("stops where it is told, for winding back to a moment", async () => {
    const { code } = await played(["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"]);
    const saved = await readSave(code);

    // Before `start`, so the game has not begun.
    const partway = await replay(saved, { upTo: saved.log.length - 1 });
    expect((partway.games[0] as { status?: string }).status).toBe("lobby");
    // And the whole thing does begin it, so `upTo` is the only difference.
    expect((await replay(saved)).games[0]).toMatchObject({ status: "playing" });
  });

  /**
   * Divergence has to be visible, or a replay that quietly differs is worse
   * than no replay at all.
   */
  it("says where two games differ rather than only that they do", async () => {
    const { code } = await played(["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"]);
    const saved = await readSave(code);
    const again = await replay(saved);

    (again.seats[0] as Record<string, unknown>).life = 1;
    const said = differences(saved.tables, again);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^seats:/);
  });

  it("deals a different game under a different seed, which is why the seed is put back", async () => {
    const { code } = await played(["pick GOBLIN", "ready", "pick WIEDŹMA", "ready", "start"]);
    const saved = await readSave(code);

    const wrong = { ...saved, tables: { ...saved.tables, games: [{ ...saved.tables.games[0], seed: "inny" }] } };
    const other = await replay(wrong);
    // The opening Zaklęcia come off a shuffled pile, so the hands differ.
    expect(differences(saved.tables, other).length).toBeGreaterThan(0);
  });
});
