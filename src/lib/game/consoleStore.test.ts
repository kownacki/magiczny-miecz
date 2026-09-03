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

async function playing(eqMode: "slots" | "classic" = "slots", who = "goblin") {
  const tables = emptyTables();
  const { game } = await createGame("Kowi", "simulation", eqMode, null, memoryHandle(tables));
  setStore(memoryStore(tables));
  const seat = tables.seats[0].id as string;
  const user = (tables.users[0] as { id: string }).id;
  await takeNewCharacter(game.id, seat, who as never, seat);
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
      runCommand(gameId, actor, { kind: "turn", act: "end", force: false }),
      // Przedmioty here and Zaklęcia below, which is the whole of the fix: the
      // sentence used to count without ever saying what it was counting.
    ).rejects.toThrow(/Gra czeka: masz o 1 Przedmiot za dużo \(5\.6\)/);
  });

  /**
   * Three Zaklęcia against a Goblin's Magia, which is two: the third lands and
   * opens the frame behind it.
   *
   * Asserted rather than swallowed. Written with a `.catch()` these tests would
   * have passed on a build where the *setup* refused, which is the one way a
   * regression test for a refusal can quietly stop testing anything.
   */
  const overSpelled = async (gameId: string, actor: { userId: string; seatId: string }) => {
    for (const spell of ["ocalony", "odrodzenie", "olsnienie"]) {
      await runCommand(gameId, actor, { kind: "deal", cardIds: [spell] });
    }
    expect(top((await activeStore().load(gameId)).game.turn_state)).toMatchObject({
      phase: "overflow",
    });
  };

  /**
   * And nothing may be dealt while the table is waiting on the surplus.
   *
   * 5.6's „natychmiast" is a frame on the stack, and `refuseWhileOverflow` is
   * the sentence every verb owes it. `deal` owed it in both halves and paid
   * neither: the Zaklęcie half went through `grantCard`, which skips every
   * check on purpose and skipped this one by accident, so the console dug the
   * hole it was standing in — `deal` a fourth Zaklęcie and a fifth and the only
   * refusal came two cards later. The Karta half was caught by the stack's own
   * generic sentence, which is true and useless: it named neither the count nor
   * the rule nor a way out.
   */
  it("will not deal another Zaklęcie onto a surplus", async () => {
    const { gameId, actor } = await playing();
    await overSpelled(gameId, actor);
    await expect(
      runCommand(gameId, actor, { kind: "deal", cardIds: ["fatum"] }),
    ).rejects.toThrow(/Gra czeka: masz o 1 Zaklęcie za dużo/);
  });

  it("answers a Karta with the frame's own words, not the stack's", async () => {
    const { gameId, actor } = await playing();
    await overSpelled(gameId, actor);
    // The count, the rule that is actually being enforced, and the ways back
    // under — none of which "trzeba odłożyć nadmiar Kart" said.
    await expect(
      runCommand(gameId, actor, { kind: "deal", cardIds: ["cudotworca"] }),
    ).rejects.toThrow(/Gra czeka: masz o 1 Zaklęcie za dużo \(2\.6\)\. Możesz odrzucić Zaklęcie albo je rzucić \(9\.4\)/);
  });

  it("deals again once the surplus is gone", async () => {
    const { gameId, actor } = await playing();
    await overSpelled(gameId, actor);
    await runCommand(gameId, actor, { kind: "putdown", name: "OCALONY" });
    expect(await runCommand(gameId, actor, { kind: "deal", cardIds: ["cudotworca"] })).toContain(
      "CUDOTWÓRCA",
    );
  });

  it("passes it when forced, and says that is what it did", async () => {
    const { gameId, actor } = await overloaded();
    expect(await runCommand(gameId, actor, { kind: "turn", act: "end", force: true })).toBe(
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
    const said = await runCommand(gameId, actor, { kind: "place", cardId: null, gold: null, fieldId: null });
    expect(said).toContain("Przedmioty (");
    expect(said).toContain("Wrogowie (");
    expect(said).not.toContain("Zaklęcia (");
    // And a name out of the last group, so this is the whole list and not a head.
    expect(said).toContain("TARGOWISKO");
  });

  it("lists the Zaklęcia too when the verb is `deal`", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, { kind: "deal", cardIds: [] });
    expect(said).toContain("Zaklęcia (");
  });
});

/**
 * Which copy `take` picks, and that the mark survives the trip.
 *
 * `clear` and `take` are the two verbs that undo `place` and `deal`, and both
 * choose between duplicates by `copiesRanked` — the conjured copy first, then
 * the newest. `take` used to answer two questions separately: it lifted the
 * first copy of that name and marked it from "is *any* copy here conjured?",
 * so a real Miecz beside a conjured one left the field marked as a card the
 * deck had never given up. That card could never go back to a pile.
 */
describe("taking one of several copies", () => {
  const marks = async (gameId: string) =>
    (await activeStore().load(gameId)).holdings.map(
      (one) => `${one.card_id}${one.granted ? " (granted)" : ""}`,
    );

  it("keeps the conjured mark on what it takes off the turn", async () => {
    const { gameId, actor } = await playing();
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["miecz"] });
    await runCommand(gameId, actor, { kind: "take", name: "MIECZ" });
    expect(await marks(gameId)).toEqual(["miecz (granted)"]);
  });

  /**
   * And off a row on the board, which is the other door — `takeFromField`, by
   * id. It passes the row's own mark and that is now authoritative, which is
   * what stops a conjured twin lying beside it deciding for it.
   */
  it("keeps it on what it takes off a row", async () => {
    const { gameId, actor } = await playing();
    // A deal first, to open the badanie 12.1 wants finished before anything is
    // collected off the square.
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["miecz"] });
    await runCommand(gameId, actor, { kind: "place", cardId: "helm", gold: null, fieldId: null });
    await runCommand(gameId, actor, { kind: "take", name: "HEŁM" });
    expect(await marks(gameId)).toEqual(["helm (granted)"]);
  });
});

/**
 * And the same key in the hand: the conjured copy is the one spent.
 *
 * `drop`, `sell`, `use` and `cast` each send a card somewhere, and `granted`
 * decides where it can go — `putOnPile` keeps a conjured card out of a deck
 * that never gave it up. Holding one real Miecz and one the console dealt,
 * "the first" was a coin toss between leaving the game a real card and leaving
 * it a test one.
 */
describe("spending one of two copies you are holding", () => {
  it("drops the conjured one and keeps the real one", async () => {
    const { gameId, actor, seat } = await playing("classic");

    /**
     * A real Miecz written straight in, because no console verb can make one:
     * everything `deal` and `place` put in a hand is `granted` by definition,
     * and the point here is to hold one of each.
     */
    const store = activeStore();
    await store.commit(await store.load(gameId), {
      holdings: {
        insert: [{ seat_id: seat, card_id: "miecz", kind: "item", face: "open", granted: false }],
      },
    });

    // And the conjured twin, off the Obszar this time.
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["miecz"] });
    await runCommand(gameId, actor, { kind: "take", name: "MIECZ" });

    const both = (await store.load(gameId)).holdings.filter((one) => one.card_id === "miecz");
    // The real one is first in the pack, so "the first" is the wrong answer.
    expect(both.map((one) => one.granted)).toEqual([false, true]);

    await runCommand(gameId, actor, { kind: "putdown", name: "MIECZ" });
    const left = (await store.load(gameId)).holdings.filter((one) => one.card_id === "miecz");
    expect(left.map((one) => one.granted)).toEqual([false]);
  });
});

/**
 * A deal is several Karty, because badanie Obszaru is.
 *
 * 13.4 settles the whole number at the moment of arrival and `drawAll` deals it
 * in one act, so `deal` — which is `draw` with the choice taken off the deck —
 * has to be able to stand in for the whole of one and not only for its first
 * card. Before this it was one card a line, which meant a tester could never
 * set up the thing 15.2 is actually about: several Karty on one Obszar.
 */
describe("dealing several Karty in one line", () => {
  /** The order the turn will reach them in, off the frame the deal wrote. */
  const waiting = async (gameId: string) =>
    (top((await activeStore().load(gameId)).game.turn_state) as { drawn: { cardId: string }[] }).drawn.map(
      (card) => card.cardId,
    );

  /**
   * 15.2, which is the whole point: lowest numeral first, whatever order they
   * were named in.
   *
   * TARGOWISKO is a Miejsce (VI), WILKOŁAK a Wróg (II) and MGŁA a Spotkanie
   * (I), and they are typed backwards on purpose.
   */
  it("orders them by class, not by the order they were typed", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, {
      kind: "deal",
      cardIds: ["targowisko", "wilkolak", "mgla"],
    });
    expect(said).toBe("Dealt: MGŁA, WILKOŁAK, TARGOWISKO.");
    expect(await waiting(gameId)).toEqual(["mgla", "wilkolak", "targowisko"]);
  });

  /**
   * "Ties keep draw order", which for a deal is the order they were named.
   *
   * Two Wrogowie of the same numeral, so nothing but arrival can separate them
   * — and `resolutionOrder` is a stable sort for exactly this reason.
   */
  it("keeps the order they were named in when the class is the same", async () => {
    const { gameId, actor } = await playing();
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["wilkolak", "cyklop"] });
    expect(await waiting(gameId)).toEqual(["wilkolak", "cyklop"]);

    const { gameId: other, actor: too } = await playing();
    await runCommand(other, too, { kind: "deal", cardIds: ["cyklop", "wilkolak"] });
    expect(await waiting(other)).toEqual(["cyklop", "wilkolak"]);
  });

  /**
   * A second deal joins the kolejka that is already there rather than replacing
   * it — and is ordered against it, not merely appended to it.
   *
   * This is `dealtInto`'s promise and the reason it is a function rather than a
   * line inside the command. A Wróg dealt after a Miejsce still goes first.
   */
  it("adds to a kolejka already waiting, and orders against it", async () => {
    const { gameId, actor } = await playing();
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["targowisko"] });
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["wilkolak", "mgla"] });
    expect(await waiting(gameId)).toEqual(["mgla", "wilkolak", "targowisko"]);
  });

  /**
   * One commit, which is what stops the second card losing the first.
   *
   * `turn_state` is a column every card in the deal reads and writes, and
   * `merge` resolves two writes to one column as *later wins* — so a deal built
   * out of one changeset per card would have kept only the last name typed. The
   * count is the test: three named, three waiting.
   */
  it("keeps every card of the deal, not just the last one written", async () => {
    const { gameId, actor } = await playing();
    await runCommand(gameId, actor, { kind: "deal", cardIds: ["mgla", "wilkolak", "targowisko"] });
    expect(await waiting(gameId)).toHaveLength(3);
  });

  /**
   * The Zaklęcia are a different pile (9.5) and go to a hand, so one line may
   * mean both — which is a fact about the box, not about the line.
   */
  it("sends a Zaklęcie to the hand and the rest to the Obszar, in one line", async () => {
    const { gameId, actor } = await playing();
    const said = await runCommand(gameId, actor, { kind: "deal", cardIds: ["wilkolak", "ocalony"] });
    expect(said).toContain("Dealt: WILKOŁAK.");
    expect(said).toContain("OCALONY");
    expect(await waiting(gameId)).toEqual(["wilkolak"]);
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

/**
 * `turn reset`: the same seat, the same turn, from the beginning.
 *
 * The two lines that used to be the only ways back — `turn end force` and
 * `turn <player>` — both cost a circuit of the table, so what came back was
 * the next turn rather than this one.
 */
describe("starting a turn over from the console", () => {
  it("puts the frame back to the rzut without moving play on", async () => {
    const { gameId, actor } = await playing();
    await rollForMove(gameId, null);
    await runCommand(gameId, actor, { kind: "teleport", fieldId: "bezdroza" });
    expect(top((await activeStore().load(gameId)).game.turn_state)).toMatchObject({
      phase: "field",
    });

    const before = (await activeStore().load(gameId)).game;
    const said = await runCommand(gameId, actor, { kind: "turn", act: "reset" });
    expect(said).toMatch(/rzut/);

    const after = (await activeStore().load(gameId)).game;
    expect(top(after.turn_state)).toEqual({ phase: "roll" });
    // The same turn, so the round and the seat are where they were.
    expect(after.round).toBe(before.round);
    expect(after.active_seat).toBe(before.active_seat);
  });
});
