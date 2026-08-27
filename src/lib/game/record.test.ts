import { afterEach, describe, expect, it } from "vitest";
import { noteRolls, startRecording, stopRecording } from "./record";
import { emptyTables, memoryStore, resetStore, setStore } from "./gameStore";
import { createGame } from "./store";
import { memoryHandle } from "./gameStore";
import { rollForMove, startGame, takeNewCharacter } from "./turnStore";
import { setReady } from "./lobbyStore";
import { activeStore } from "./gameStore";

/**
 * The dice, on their way to the record.
 *
 * Shuffles need nothing here — they are a function of the seed and the revision
 * they happen at, so replaying reaches the same order. Dice are the other door,
 * and they were gone the moment they landed.
 */

afterEach(() => {
  stopRecording();
  resetStore();
});

describe("what a replay would need", () => {
  it("says nothing when nobody is listening", () => {
    // The browser's whole life: the record lives in a save file and Supabase
    // has no column for it, so this has to be free when it is not wanted.
    expect(() => noteRolls([1, 2, 3])).not.toThrow();
    startRecording();
    expect(stopRecording()).toEqual([]);
  });

  it("collects across the several changes one line can cause", () => {
    startRecording();
    noteRolls([4]);
    noteRolls([2, 6]);
    expect(stopRecording()).toEqual([4, 2, 6]);
  });

  it("forgets what it collected once it has been read", () => {
    startRecording();
    noteRolls([5]);
    expect(stopRecording()).toEqual([5]);
    // A second read is not the same dice again.
    expect(stopRecording()).toEqual([]);
  });

  /**
   * The one that matters: a real die, thrown by a real rule, arriving here
   * without anything in `turnStore` or the commands knowing it was watched.
   */
  it("catches a die a rule actually threw", async () => {
    const tables = emptyTables();
    const { game } = await createGame("Michał", "simulation", "slots", null, memoryHandle(tables));
    setStore(memoryStore(tables));
    const seat = tables.seats[0].id as string;
    await takeNewCharacter(game.id, seat, "goblin", seat);
    await setReady(game.id, (tables.users[0] as { id: string }).id, true);
    await startGame(game.id);

    startRecording();
    await rollForMove(game.id, null);
    const rolls = stopRecording();

    expect(rolls).toHaveLength(1);
    expect(rolls[0]).toBeGreaterThanOrEqual(1);
    expect(rolls[0]).toBeLessThanOrEqual(6);
    // And it is the die the game actually used, not another one thrown beside it.
    const state = (await activeStore().load(game.id)).game.turn_state as { roll?: number };
    expect(state.roll).toBe(rolls[0]);
  });
});
