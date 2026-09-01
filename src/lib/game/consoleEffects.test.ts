/** What the console says about the things that are true of a character for a while. */

import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./consoleStore";
import { parseCommand } from "@/lib/engine/console";
import { emptyTables, memoryHandle, memoryStore, resetStore, setStore } from "./gameStore";
import { createGame, joinGame } from "./store";
import { setReady } from "./lobbyStore";
import { addEffect, startGame, takeNewCharacter } from "./turnStore";

afterEach(() => resetStore());

/** Two seats, both playing, so the turn order has somewhere to go. */
async function table() {
  const tables = emptyTables();
  const handle = memoryHandle(tables);
  const { game } = await createGame("Ola", "simulation", "classic", null, handle);
  setStore(memoryStore(tables));

  const first = tables.seats[0].id as string;
  const host = (tables.users[0] as { id: string }).id;
  await takeNewCharacter(game.id, first, "goblin", first);
  await setReady(game.id, host, true);

  const joined = await joinGame(game.id, "Michał", null, false, null, handle);
  const second = joined.seat!.id;
  await takeNewCharacter(game.id, second, "elf", second);
  await setReady(game.id, joined.user.id, true);

  await startGame(game.id);
  return {
    gameId: game.id,
    actor: { userId: host, seatId: first },
    first,
    second,
  };
}

/**
 * Owes turns, the way a Karczma's 3 leaves you owing them.
 *
 * Through the console's own verb, which is the point: `turns_lost` was in
 * `ADJUSTABLE` and reachable by nothing, so the one state on the board that
 * silently skips a player could not be produced at a prompt at all.
 */
const owe = (
  gameId: string,
  actor: { userId: string; seatId: string | null },
  who: string,
  turns: number,
) =>
  runCommand(gameId, actor, {
    kind: "stat",
    stat: "tury",
    delta: turns,
    set: null,
    who,
    force: false,
  });

describe("`me` says what is on a character and when it lapses", () => {
  it("prints nothing at all when nothing is true of them", async () => {
    const { gameId, actor } = await table();
    expect(await runCommand(gameId, actor, { kind: "me", who: null })).not.toContain("Effects:");
  });

  it("dates a lost turn to the round the seat plays again in", async () => {
    const { gameId, actor } = await table();
    await owe(gameId, actor, "2", 2);

    const said = await runCommand(gameId, actor, { kind: "me", who: "2" });
    // Two owed at a table of two: seat 1 is passed over on each of the first
    // two passes and is themselves again in round 3 — and the label does not
    // repeat the duration the way "Traci turę — traci 2 tury" would.
    expect(said).toContain("Traci turę — jeszcze 2 tury — wraca w rundzie 3");
  });

  it("dates a countdown past the turns the holder does not get", async () => {
    const { gameId, actor, second } = await table();
    await owe(gameId, actor, "2", 2);
    await addEffect(gameId, second, {
      source: "eliksir-sily",
      label: "Eliksir Siły",
      modifier: { kind: "points", miecz: 1 },
      ends: { kind: "turns", turns: 1 },
    });

    const said = await runCommand(gameId, actor, { kind: "me", who: "2" });
    // The buff survives one of their turns, and their next turn is in round 3.
    // `games.round + 1` would have dated it to round 2 — a turn this seat never
    // takes. That is the whole reason the date is walked rather than added.
    expect(said).toContain("Eliksir Siły — do końca tej tury — mija w rundzie 3, po turze Postaci");
  });

  it("says whose turn it is in the round, and says it differently about you", async () => {
    const { gameId, actor, first } = await table();
    await addEffect(gameId, first, {
      source: "poludnica",
      label: "Południca",
      modifier: { kind: "move-max", fields: 1 },
      ends: { kind: "turns", turns: 2 },
    });
    expect(await runCommand(gameId, actor, { kind: "me", who: null })).toContain(
      "po twojej turze",
    );
    expect(await runCommand(gameId, actor, { kind: "me", who: "2" })).not.toContain("po twojej");
  });

  it("names the round outright for a date, with no forecast caveat on it", async () => {
    const { gameId, actor } = await table();
    await runCommand(gameId, actor, { kind: "stone", stone: true, who: "1" });

    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    expect(said).toContain("Zamieniony w Kamień — mija na początku rundy 4");
    // Nothing here was projected, so nothing here is provisional.
    expect(said).not.toContain("prognoza");
  });

  it("warns once, and only where a round was worked out rather than read", async () => {
    const { gameId, actor } = await table();
    await owe(gameId, actor, "1", 1);
    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    expect(said.match(/prognoz/g)).toHaveLength(1);
  });

  it("says what a second copy did, and only when there was one", async () => {
    const { gameId, actor } = await table();
    await runCommand(gameId, actor, { kind: "effect", effect: "fog", who: null });
    await runCommand(gameId, actor, { kind: "effect", effect: "fog", who: null });
    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    // A card that visibly does nothing is what a table argues about.
    expect(said).toContain("×2 (bez zmian)");

    await runCommand(gameId, actor, { kind: "effect", effect: "barred", who: null });
    expect(await runCommand(gameId, actor, { kind: "me", who: null })).toContain(
      "Most zamknięty (tryb testowy) — do końca tej tury",
    );
  });
});

describe("`who` shows the table what is on everybody", () => {
  it("hangs each seat's effects under its own row", async () => {
    const { gameId, actor } = await table();
    await owe(gameId, actor, "2", 1);
    await runCommand(gameId, actor, { kind: "stone", stone: true, who: "1" });

    const lines = (await runCommand(gameId, actor, { kind: "who" })).split("\n");
    const at = lines.findIndex((line) => line.includes("ELF"));
    expect(lines[at + 1]).toMatch(/^ {6}\S+ Traci turę/);
    expect(lines.find((line) => line.includes("Zamieniony w Kamień"))).toBeDefined();
  });

  /**
   * 9.3 hides a hand of Zaklęcia and nothing else. An effect is a thing the
   * table can see, and being able to see it is what makes turn order followable
   * — but "po twojej turze" on one row of a list about everybody would read as
   * a claim about the other rows too.
   */
  it("speaks about every seat in the same voice, including the reader's own", async () => {
    const { gameId, actor, first } = await table();
    await addEffect(gameId, first, {
      source: "poludnica",
      label: "Południca",
      modifier: { kind: "move-max", fields: 1 },
      ends: { kind: "turns", turns: 2 },
    });
    const said = await runCommand(gameId, actor, { kind: "who" });
    expect(said).toContain("po turze Postaci");
    expect(said).not.toContain("po twojej");
  });
});

describe("the console can reach a lost turn at all", () => {
  it("reads `tury` as the debt it is", () => {
    expect(parseCommand("tury +2 Ola")).toEqual({
      ok: { kind: "stat", stat: "tury", delta: 2, set: null, who: "Ola", force: false },
    });
  });
});

/**
 * "Na 1 turę", when the turn is not yours.
 *
 * `USES` has always let the Eliksir be drunk „w dowolnym momencie", which is
 * right — you drink it in a fight somebody else started. What was wrong is what
 * happened next: `Ends.turns` counts the *holder's* own goes, so an Eliksir
 * drunk on a rival's turn survived every seat in between and the holder's own
 * next turn as well. A card that says one turn was buying a circuit.
 */
describe("an effect that ends with the turn itself", () => {
  const potion = (gameId: string, seatId: string) =>
    addEffect(gameId, seatId, {
      source: "eliksir-sily",
      label: "+2 Miecza",
      modifier: { kind: "points", miecz: 2 },
      ends: { kind: "this-turn" },
    });

  it("is spent by the end of the turn it was drunk in, on a seat that is not playing", async () => {
    const { gameId, actor, second } = await table();
    // Seat 1 is playing; seat 2 drinks. One pass, and it is gone — where a
    // countdown in seat 2's own turns would have carried it through seat 2's
    // next turn as well.
    await potion(gameId, second);
    expect(await runCommand(gameId, actor, { kind: "me", who: "2" })).toContain("+2 Miecza");

    await runCommand(gameId, actor, { kind: "turn", act: "end", force: false });
    expect(await runCommand(gameId, actor, { kind: "me", who: "2" })).not.toContain("+2 Miecza");
  });

  it("says which turn it means, and dates it without a forecast", async () => {
    const { gameId, actor, first } = await table();
    await potion(gameId, first);
    const said = await runCommand(gameId, actor, { kind: "me", who: null });
    // No round is walked for this one: the turn it ends with is the one already
    // happening, so there is nothing provisional about it.
    expect(said).toContain("+2 Miecza — do końca bieżącej tury");
    expect(said).not.toContain("prognoza");
  });
});
