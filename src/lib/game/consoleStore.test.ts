import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./consoleStore";
import { parseCommand } from "@/lib/engine/console";
import { emptyTables, memoryHandle, memoryStore, resetStore, setStore } from "./gameStore";
import { createGame } from "./store";
import { setReady } from "./lobbyStore";
import { grantCard, startGame, takeNewCharacter } from "./turnStore";

/**
 * How a pack reads, which is not how it is stored.
 *
 * `ordinal` is the browser's: you drag a hand into an order so cards can be
 * recognised by where they sit. A list of words is scanned instead, so it is
 * sorted — and the sort has to be Polish, because ŁÓDŹ belongs after LIST and a
 * default comparison puts it past Z where nobody looks for it.
 */

afterEach(() => resetStore());

async function playing(eqMode: "slots" | "classic" = "slots") {
  const tables = emptyTables();
  const { game } = await createGame("Kowi", "simulation", eqMode, null, memoryHandle(tables));
  setStore(memoryStore(tables));
  const seat = tables.seats[0].id as string;
  const user = (tables.users[0] as { id: string }).id;
  await takeNewCharacter(game.id, seat, "goblin", seat);
  await setReady(game.id, user, true);
  await startGame(game.id);
  return { gameId: game.id, actor: { userId: user, seatId: seat }, seat };
}

describe("reading what a character is carrying", () => {
  /**
   * Klasyczny, where the pack holds everything.
   *
   * In slotowy these four would not be in it: a Przedmiot that can be worn is
   * worn the moment it arrives (`slotOnArrival`), so a Hełm reaches the head
   * and never the bag. The sort is the same code either way and this is the
   * variant that puts four things in one list to sort.
   */
  it("lists the pack in Polish alphabetical order, not the order it arrived", async () => {
    const { gameId, actor, seat } = await playing("classic");
    // Deliberately out of order, and deliberately across the letter that a
    // default sort gets wrong.
    for (const card of ["zbroja", "helm", "lodz", "miecz"]) {
      await grantCard(gameId, seat, card);
    }

    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    const pack = said.split("\n").find((line) => line.startsWith("Pack"));
    expect(pack).toContain("HEŁM, ŁÓDŹ, MIECZ, ZBROJA");
  });

  /**
   * Worn is the exception. It is not a list being searched, it is a figure
   * being read down — head, then amulet, then body — and alphabetical would
   * scatter that.
   */
  it("lists what is worn down the body rather than by name", async () => {
    const { gameId, actor, seat } = await playing();
    await grantCard(gameId, seat, "tarcza-tolimana");
    await grantCard(gameId, seat, "helm");
    // Worn in the order that puts them the wrong way round by name.
    await runCommand(gameId, actor, { kind: "equip", name: "TARCZA TOLIMANA", slot: null });
    await runCommand(gameId, actor, { kind: "equip", name: "HEŁM", slot: null });

    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    const worn = said.split("\n").find((line) => line.startsWith("Worn")) ?? "";
    // `head` comes before `tarcza-tolimana` in SLOTS, whatever the names do.
    expect(worn).toContain("HEŁM");
    expect(worn.indexOf("HEŁM")).toBeLessThan(worn.indexOf("TARCZA"));
  });

  it("says how full the pack is and by whose count", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    // The number is the useful half; the mode explains where it came from.
    expect(said).toMatch(/Pack \d+\/\d+ \((slots|classic)\)/);
  });
});

/**
 * 17.9's payout at the prompt.
 *
 * A won duel is the one fight that does not settle itself, because the winner
 * chooses what to take and cannot choose before winning. Every other fight
 * still resolves inside `fight`: there is nothing to take off a Karta, since a
 * Wróg has no purse and no pack and 1.4 already says what a beaten one is
 * worth. The payout itself is proved in `spoils.test.ts`; this is the wiring
 * and the three ways of asking for it at the wrong moment.
 */
describe("taking what a won duel owes", () => {
  it("refuses when there is no fight at all", async () => {
    const { gameId, actor } = await playing();
    await expect(
      runCommand(gameId, actor, { kind: "spoils", take: "zycie", card: null }),
    ).rejects.toThrow(/Nie ma walki/);
  });

  it("reads a bare `spoils` as the Życie, which is what the app always took", () => {
    expect(parseCommand("spoils")).toEqual({
      ok: { kind: "spoils", take: "zycie", card: null },
    });
  });

  it("reads the coin, spelt either way", () => {
    expect(parseCommand("spoils zloto")).toEqual({
      ok: { kind: "spoils", take: "zloto", card: null },
    });
    expect(parseCommand("spoils złoto")).toEqual({
      ok: { kind: "spoils", take: "zloto", card: null },
    });
  });

  /** Anything else is a Przedmiot, matched against what the loser is holding. */
  it("reads anything else as a Przedmiot by name", () => {
    expect(parseCommand("spoils MIECZ")).toEqual({
      ok: { kind: "spoils", take: "zycie", card: "MIECZ" },
    });
  });
});
