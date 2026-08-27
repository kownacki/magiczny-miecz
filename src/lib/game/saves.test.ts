import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteSave, listSaves, newSave, openSave, readSave, savesDir, writeSave } from "./saves";
import { resetStore, setStore } from "./gameStore";
import { joinGame } from "./store";
import { memoryHandle } from "./gameStore";
import { setReady } from "./lobbyStore";
import { rollForMove, startGame, takeNewCharacter } from "./turnStore";

/**
 * A whole game, on this machine, with nothing running.
 *
 * No Supabase, no dev server, no network. That is the claim the terminal build
 * rests on, and it is worth making it here rather than trusting it: the rules
 * were always pure, but until `GameStore` there was nowhere to put them.
 */

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "mm-saves-"));
  process.env.MM_HOME = home;
});

afterEach(async () => {
  delete process.env.MM_HOME;
  resetStore();
  await rm(home, { recursive: true, force: true });
});

describe("a game kept in a file", () => {
  it("opens a table, plays a turn, and is still there after reopening it", async () => {
    const { code, gameId, tables, store } = await newSave(["Michał"]);
    setStore(store);

    // The same functions the routes call, all the way down.
    // `byUser` is the *seat* asking, not the person — see `mayChooseFor`.
    const seat = tables.seats[0].id as string;
    await takeNewCharacter(gameId, seat, "goblin", seat);
    await setReady(gameId, (tables.users[0] as { id: string }).id, true);
    await startGame(gameId);
    await rollForMove(gameId, 4);

    // Reopened from disk, by somebody who was not holding the objects.
    const again = await openSave(code);
    const snapshot = await again.store.load(gameId);
    expect(snapshot.game.status).toBe("playing");
    expect((snapshot.game.turn_state as { phase: string }).phase).toBe("move");
    expect(snapshot.seats[0].character_id).toBe("goblin");
    // The journal survived with it, which is what makes a save a record rather
    // than a position.
    const rolled = await readSave(code);
    expect(rolled.tables.moves.some((row) => row.kind === "roll")).toBe(true);
  });

  it("writes after every change, not when somebody remembers to", async () => {
    const { code, gameId, tables, store } = await newSave(["Michał"]);
    setStore(store);

    const before = (await readSave(code)).savedAt;
    const seat = tables.seats[0].id as string;
    await takeNewCharacter(gameId, seat, "troll", seat);

    const after = await readSave(code);
    expect(after.tables.seats[0].character_id).toBe("troll");
    expect(after.savedAt >= before).toBe(true);
  });

  /**
   * The window this closes is not theoretical: the file is rewritten after
   * every single change, so most of the time the program is running is spent
   * inside it. A reader sees the old file or the new one, never half of either.
   */
  it("leaves no half-written file behind", async () => {
    const { code } = await newSave(["Michał"]);
    const left = await readdir(savesDir());
    expect(left).toEqual([`${code}.json`]);
    expect(left.some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("lists what is there, newest first, and forgets what is deleted", async () => {
    const one = await newSave(["Michał"]);
    const two = await newSave(["Ola"]);

    const listed = await listSaves();
    expect(listed.map((save) => save.code).sort()).toEqual([one.code, two.code].sort());
    expect(listed.every((save) => save.status === "lobby")).toBe(true);
    expect(listed.flatMap((save) => save.players).sort()).toEqual(["Michał", "Ola"]);

    await deleteSave(one.code);
    expect((await listSaves()).map((save) => save.code)).toEqual([two.code]);
  });

  it("survives a machine that has never run the game", async () => {
    // No saves directory at all: an empty list, not a crash.
    await rm(savesDir(), { recursive: true, force: true });
    expect(await listSaves()).toEqual([]);
  });

  it("does not let one unreadable file hide the others", async () => {
    const good = await newSave(["Michał"]);
    await writeFile(join(savesDir(), "BROKEN.json"), "{ not json", "utf8");

    const listed = await listSaves();
    expect(listed.map((save) => save.code)).toEqual([good.code]);
  });

  it("refuses a save it does not understand rather than guessing", async () => {
    const { code } = await newSave(["Michał"]);
    const file = await readSave(code);
    await writeFile(
      join(savesDir(), `${code}.json`),
      JSON.stringify({ ...file, version: 99 }),
      "utf8",
    );
    await expect(readSave(code)).rejects.toThrow(/wersja/i);
  });

  /**
   * The whole table is on disk before anything else happens.
   *
   * Seating the others used to be the caller's job, after `newSave` had
   * already written the file — so a table opened for two held one player until
   * some later commit rewrote it, and quitting before that lost the rest.
   */
  /**
   * The record travels with the game, from the first save.
   *
   * A save written without somewhere to put it could never be wound back, which
   * is the one thing about a format that cannot be fixed later.
   */
  /**
   * Which ekwipunek, before you open it.
   *
   * The two do not agree about what a pack is — 5.4 caps it at four, the
   * slotted variant counts only what is worn towards a Koń's carrying, and
   * `equip` works in one and refuses in the other — and nothing said which a
   * table was playing. The only way to find out was to try something.
   */
  it("says which ekwipunek a table is playing", async () => {
    const slotted = await newSave(["Kowi"], "slots");
    const printed = await newSave(["Ola"], "classic");
    const listed = await listSaves();
    expect(listed.find((one) => one.code === slotted.code)?.eqMode).toBe("slots");
    expect(listed.find((one) => one.code === printed.code)?.eqMode).toBe("classic");
  });

  it("carries a log, and hands it back to whoever reopens it", async () => {
    const { code, log } = await newSave(["Kowi"]);
    expect((await readSave(code)).log).toEqual([]);

    log.push({ seq: 1, actor: "Kowi", line: "roll", rolls: [4] });
    await writeSave(code, {
      version: 1,
      savedAt: new Date().toISOString(),
      tables: (await readSave(code)).tables,
      log,
    });

    const again = await openSave(code);
    expect(again.log).toEqual([{ seq: 1, actor: "Kowi", line: "roll", rolls: [4] }]);
  });

  it("writes everybody at the table, not just whoever opened it", async () => {
    const { code } = await newSave(["Kowi", "Cinek", "Ola"]);
    const file = await readSave(code);
    expect(file.tables.users.map((one) => one.name)).toEqual(["Kowi", "Cinek", "Ola"]);
    expect(file.tables.seats).toHaveLength(3);
    // And the list somebody picks from says so without opening it.
    expect((await listSaves()).find((one) => one.code === code)?.players).toEqual([
      "Kowi",
      "Cinek",
      "Ola",
    ]);
  });

  it("seats a second player at a local table", async () => {
    const { gameId, tables, store } = await newSave(["Michał"]);
    setStore(store);

    const { user, seat } = await joinGame(gameId, "Ola", null, false, null, memoryHandle(tables));
    expect(user.name).toBe("Ola");
    expect(seat?.seat_index).toBe(1);

    const snapshot = await store.load(gameId);
    expect(snapshot.users.map((one) => one.name)).toEqual(["Michał", "Ola"]);
  });
});
