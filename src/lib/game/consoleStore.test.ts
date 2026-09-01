import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./consoleStore";
import { parseCommand } from "@/lib/engine/console";
import { emptyTables, memoryHandle, memoryStore, resetStore, setStore } from "./gameStore";
import { createGame } from "./store";
import { setReady } from "./lobbyStore";
import { grantCard, rollForMove, startGame, takeNewCharacter } from "./turnStore";
import { activeStore } from "./gameStore";
import { top } from "@/lib/engine/stack";

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

/**
 * The line somebody types at a console that has just refused them.
 *
 * A table set up by hand goes over 5.4's four the moment the fifth `deal`
 * lands, and from there the turn will not move: the refusal is right, and the
 * remedy — drop a Karta, spend one, put one on — is undoing the setup. `force`
 * is the way out, and it is the console's alone.
 */
describe("handing the turn on over a surplus", () => {
  const overloaded = async () => {
    const table = await playing("classic");
    for (const card of ["helm", "zbroja", "miecz", "sztylet", "latarnia"]) {
      await grantCard(table.gameId, table.seat, card);
    }
    return table;
  };

  it("will not move the turn, and says what is in the way", async () => {
    const { gameId, actor } = await overloaded();
    // The fifth `deal` opened the frame where it happened (5.6's
    // "natychmiast"), so this is the refusal rather than the hold — which is
    // the state a console actually sits in when somebody types `force`.
    await expect(
      runCommand(gameId, actor, { kind: "endturn", force: false }),
    ).rejects.toThrow(/Najpierw zejdź do limitu/);
  });

  it("passes it when forced, and says that is what it did", async () => {
    const { gameId, actor } = await overloaded();
    expect(await runCommand(gameId, actor, { kind: "endturn", force: true })).toBe(
      "Turn passed — forced.",
    );
  });
});

/**
 * "What is there to put down?" — bare `place`, which used to be a mistake.
 *
 * The same catalogue bare `deal` prints, cut into the six kinds, and the same
 * reading: naming nothing is a question. What separates the two lists is the
 * Zaklęcia, which never lie on an Obszar (9.5).
 */
describe("the catalogue a bare command prints", () => {
  it("lists what can be laid on an Obszar, by kind", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, { kind: "place", cardId: null, fieldId: null });
    expect(said).toContain("Przedmioty (");
    expect(said).toContain("Wrogowie (");
    expect(said).not.toContain("Zaklęcia (");
    // And a name out of the last group, so this is the whole list and not a head.
    expect(said).toContain("TARGOWISKO");
  });

  it("lists the Zaklęcia too when the verb is `deal`", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, { kind: "deal", cardId: null });
    expect(said).toContain("Zaklęcia (");
  });
});

/**
 * `teleport` puts the figure where you want it — and the turn goes on there.
 *
 * 13.1: „Postacie mogą spotykać się tylko na Obszarze, na którym zakończyły
 * swój ruch lub na Obszarze, na który zostały przeniesione wskutek spotkania.
 * Podobnie: tylko te Obszary mogą badać." The frame said the new Obszar owed
 * nothing, so the commonest thing a tester does — stand on the square they
 * want to see — was followed by `draw` refusing outright.
 */
describe("teleporting into a turn that goes on", () => {
  /** Past the roll, because a figure that has not moved yet is not restaged. */
  const midTurn = async () => {
    const table = await playing();
    await rollForMove(table.gameId, null);
    return table;
  };

  it("owes what the Obszar prints, and draws it", async () => {
    const { gameId, actor } = await midTurn();
    // Bezdroża prints two Karty and nothing is lying on it.
    await runCommand(gameId, actor, { kind: "teleport", fieldId: "bezdroza" });
    expect(top((await activeStore().load(gameId)).game.turn_state)).toMatchObject({
      phase: "field",
      fieldId: "bezdroza",
      draw: 2,
    });
    // Both of them, in one command: badanie Obszaru is one act (13.4), so the
    // square is owed nothing afterwards and the turn is never half-explored.
    expect(await runCommand(gameId, actor, { kind: "draw" })).toMatch(/^Drawn 2: /);
    expect(top((await activeStore().load(gameId)).game.turn_state)).toMatchObject({
      draw: 0,
      drawn: [expect.anything(), expect.anything()],
    });
  });

  it("owes nothing where the Obszar prints nothing", async () => {
    const { gameId, actor } = await midTurn();
    // The Karczma draws no Karty; it has an instruction instead.
    await runCommand(gameId, actor, { kind: "teleport", fieldId: "karczma" });
    await expect(runCommand(gameId, actor, { kind: "draw" })).rejects.toThrow(
      /nie ciągnie się Kart/,
    );
  });
});
