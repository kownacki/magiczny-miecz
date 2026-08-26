import { describe, expect, it } from "vitest";
import charactersData from "@/data/characters.json";
import type { Character } from "@/data/types";
import { asSeatCharacter } from "@/lib/engine/characters";
import { scriptedRandom } from "@/lib/engine/ports";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { changeNature, placeSeat, takeNewCharacter } from "./character";

const CHARACTERS = charactersData as Character[];

/* --------------------------------------------------------------------------
 * Natura (7.2-7.4).
 * ----------------------------------------------------------------------- */

describe("zmiana Natury (7.2-7.4)", () => {
  const table = (over: Parameters<typeof aSeat>[0] = {}, holdings = [] as ReturnType<typeof aHolding>[]) =>
    aTable({ game: { turn: 5 }, seats: [aSeat({ nature: "dobra", ...over })], holdings });

  it("writes the new Natura and the turn it happened on", () => {
    const { writes } = changeNature(table(), { seatId: "seat-a", nature: "zla" });
    expect(writes.seats).toEqual([
      { id: "seat-a", patch: { nature: "zla", nature_changed_turn: 5 } },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "nature-change",
      payload: { from: "dobra", to: "zla", nowForbidden: [] },
    });
  });

  /**
   * 7.3 is a turn number, not a flag: "Żadna Postać nie może zmienić swojej
   * Natury częściej niż raz w trakcie tury gry."
   */
  it("refuses a second change in the same turn", () => {
    expect(() =>
      changeNature(table({ nature_changed_turn: 5 }), { seatId: "seat-a", nature: "zla" }),
    ).toThrow(/najwyżej raz na turę/);
  });

  it("allows it again once the turn has moved on", () => {
    const { writes } = changeNature(table({ nature_changed_turn: 4 }), {
      seatId: "seat-a",
      nature: "zla",
    });
    expect(writes.seats?.[0].patch).toMatchObject({ nature_changed_turn: 5 });
  });

  /**
   * The test console's, and the reason it is a flag rather than a caller
   * quietly clearing `nature_changed_turn` first — which is the same act with
   * the rule out of sight.
   */
  it("lets the console past 7.3, and says in the journal that somebody typed it", () => {
    const { writes } = changeNature(table({ nature_changed_turn: 5 }), {
      seatId: "seat-a",
      nature: "zla",
      force: true,
    });
    expect(writes.seats?.[0].patch).toMatchObject({ nature: "zla" });
    expect(writes.journal?.[0]).toMatchObject({ kind: "nature-change", manual: true });
  });

  it("marks an ordinary change as what it is: not manual", () => {
    const { writes } = changeNature(table(), { seatId: "seat-a", nature: "zla" });
    expect(writes.journal?.[0].manual ?? false).toBe(false);
  });

  /** Magog's own card lets it change freely, and 8.2 puts that above 7.3. */
  it("lets Magog change as often as it likes", () => {
    const magog = table({ character_id: asSeatCharacter("magog"), nature_changed_turn: 5 });
    expect(changeNature(magog, { seatId: "seat-a", nature: "zla" }).result).toEqual({
      nowForbidden: [],
    });
  });

  it("does nothing at all when the Natura is already that one", () => {
    const { writes, result } = changeNature(table(), { seatId: "seat-a", nature: "dobra" });
    expect(writes).toEqual({});
    expect(result).toEqual({ nowForbidden: [] });
  });

  /**
   * 7.4 with 5.5: the Święta Włócznia is forbidden to Złe Postacie, and a
   * character who turns Zła has to put it down at once. Naming it is the whole
   * job — a referee that quietly binned somebody's relic would be worse than
   * one that says nothing.
   */
  it("names what the new Natura may not hold, and takes nothing", () => {
    const held = [
      aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" }),
      aHolding({ id: "h-helm", card_id: "helm", kind: "item" }),
    ];
    const { writes, result } = changeNature(table({}, held), { seatId: "seat-a", nature: "zla" });
    expect(result.nowForbidden).toEqual(["swieta-wlocznia"]);
    expect(writes.journal?.[0]).toMatchObject({
      payload: { nowForbidden: ["swieta-wlocznia"] },
    });
    expect(writes.holdings).toBeUndefined();
  });

  it("says nothing about a card the new Natura may keep", () => {
    const held = [aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" })];
    const { result } = changeNature(table({ nature: "zla" }, held), {
      seatId: "seat-a",
      nature: "dobra",
    });
    expect(result.nowForbidden).toEqual([]);
  });

  it("refuses a seat it does not know", () => {
    expect(() => changeNature(table(), { seatId: "nobody", nature: "zla" })).toThrow(
      /Nieznane miejsce/,
    );
  });
});

/* --------------------------------------------------------------------------
 * Moving a figure by hand.
 * ----------------------------------------------------------------------- */

describe("przestawienie figury", () => {
  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({
      game: { active_seat: 0, ...(over.game ?? {}) },
      seats: over.seats ?? [aSeat({ seat_index: 0 })],
    });

  it("moves the figure and files it as a manual correction", () => {
    const { writes } = placeSeat(table(), { seatId: "seat-a", target: "osada", reason: "test" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "osada" } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "moved-by-hand",
      manual: true,
      payload: { from: "mroczna-polana", to: "osada", reason: "test" },
    });
  });

  it("leaves the turn alone before the character has moved this turn", () => {
    const { writes } = placeSeat(table({ game: { turn_state: { phase: "roll" } } }), {
      seatId: "seat-a",
      target: "grod",
      reason: null,
    });
    expect(writes.game).toBeUndefined();
  });

  it("restages the turn on the new Obszar, with nothing drawn there yet (15.1)", () => {
    const mid = table({
      game: {
        turn_state: {
          phase: "field",
          fieldId: "mroczna-polana",
          from: null,
          draw: 2,
          drawn: [],
          fought: [],
        },
      },
    });
    const { writes } = placeSeat(mid, { seatId: "seat-a", target: "grod", reason: null });
    expect(writes.game?.turn_state).toEqual({
      phase: "field",
      fieldId: "grod",
      from: null,
      draw: 0,
      drawn: [],
      fought: [],
    });
  });

  /** The commonest reason to reach for this is a table stuck mid-something. */
  it("drags a turn stuck past the roll onto the new Obszar too", () => {
    const stuck = table({ game: { turn_state: { phase: "move", roll: 4, options: [] } } });
    const { writes } = placeSeat(stuck, { seatId: "seat-a", target: "grod", reason: null });
    expect(writes.game?.turn_state).toMatchObject({ phase: "field", fieldId: "grod" });
  });

  it("does not restage anybody else's turn", () => {
    const other = table({
      game: {
        active_seat: 1,
        turn_state: {
          phase: "field",
          fieldId: "grod",
          from: null,
          draw: 0,
          drawn: [],
          fought: [],
        },
      },
      seats: [aSeat({ seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
    });
    const { writes } = placeSeat(other, { seatId: "seat-a", target: "osada", reason: null });
    expect(writes.game).toBeUndefined();
  });

  it("refuses an Obszar that is not on the board", () => {
    expect(() =>
      placeSeat(table(), { seatId: "seat-a", target: "step", reason: null }),
    ).toThrow(/nie ma takiego Obszaru/);
  });
});

/* --------------------------------------------------------------------------
 * Taking a new Postać (4.4).
 * ----------------------------------------------------------------------- */

/** A seat whose character has just died, which is what 4.4 is written for. */
const dead = (over: Parameters<typeof aSeat>[0] = {}) =>
  aSeat({ seat_index: 0, eliminated: true, zycie: 0, zloto: 0, turns_lost: 2, ...over });

describe("nowa Postać po śmierci (4.4)", () => {
  it("seats the new character on its own MGR with its printed points", async () => {
    const table = aTable({ game: { turn: 9 }, seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca" },
      ports(),
    );
    expect(writes.seats?.[0].patch).toEqual({
      character_id: "zdobywca",
      field_id: "osada",
      miecz_own: 4,
      magia_own: 3,
      miecz_floor: 4,
      magia_floor: 3,
      nature: "chaotyczna",
      eliminated: false,
      zycie: 4,
      zloto: 1,
      turns_lost: 0,
      stone_until_turn: null,
      bridge_blocked_until_turn: null,
      nature_changed_turn: null,
      ready: true,
    });
    expect(writes.journal?.at(-1)).toMatchObject({
      seatId: "seat-a",
      turn: 9,
      kind: "new-character",
      payload: { characterId: "zdobywca" },
    });
    expect(writes.journal?.at(-1)?.payload).not.toHaveProperty("losowa");
  });

  /** Kat prints "natura: dowolna" and the player picks; nothing is defaulted. */
  it("leaves the Natura unset for a character whose card says dowolna", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "kat" },
      ports(),
    );
    expect(writes.seats?.[0].patch).toMatchObject({ nature: null });
  });

  it("deals the Przedmioty and the purse the Karta Postaci names (3.2)", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "ksiaze" },
      ports(),
    );
    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "helm", kind: "item", face: "open" },
      { seat_id: "seat-a", card_id: "miecz", kind: "item", face: "open" },
    ]);
    expect(writes.seats?.[0].patch).toMatchObject({ zloto: 5 });
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "starting-kit",
      "new-character",
    ]);
    expect(writes.journal?.[0].payload).toEqual({
      character: "ksiaze",
      items: ["helm", "miecz"],
      zloto: 5,
    });
  });

  it("says nothing about equipment for a character who starts with none", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "awanturnik" },
      ports(),
    );
    expect(writes.journal?.map((line) => line.kind)).toEqual(["new-character"]);
  });

  /**
   * The Zaklęcia are the one part of the kit a command cannot deal: a draw
   * reshuffles the pile when it runs out (9.5) and a shuffle is not something
   * a single die can be asked for. Same bargain as `startGame` — say what is
   * owed, and let the edge that owns the deck hand them over.
   */
  it("reports the Zaklęcia it is owed rather than drawing them", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes, result } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "mag" },
      ports(),
    );
    expect(result).toEqual({ seatId: "seat-a", spells: 2 });
    expect(writes.holdings).toBeUndefined();
    expect(writes.game).toBeUndefined();
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "starting-kit",
      "new-character",
    ]);
    expect(writes.journal?.[0].payload).toEqual({ character: "mag", spells: 2 });
  });

  it("is owed none by a character who starts with no Zaklęcia", async () => {
    const { result } = await takeNewCharacter(
      aTable({ seats: [dead()] }),
      { seatId: "seat-a", characterId: "ksiaze" },
      ports(),
    );
    expect(result).toEqual({ seatId: "seat-a", spells: 0 });
  });

  it("refuses to swap a Postać that is still alive", async () => {
    const table = aTable({ seats: [aSeat({ eliminated: false })] });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "mag" }, ports()),
    ).rejects.toThrow(/wciąż żyje/);
  });

  /** The dead one's card is out of the game, so it cannot be taken again. */
  it("refuses a Postać somebody is already holding, the dead one included", async () => {
    const table = aTable({
      seats: [dead(), aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("mag") })],
    });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "mag" }, ports()),
    ).rejects.toThrow(/już w grze/);
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "goblin" }, ports()),
    ).rejects.toThrow(/już w grze/);
  });

  it("refuses a character id that is not on any card", async () => {
    const table = aTable({ seats: [dead()] });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "smok" }, ports()),
    ).rejects.toThrow(/Nieznana postać: smok/);
  });

  it("refuses a seat it does not know", async () => {
    await expect(
      takeNewCharacter(aTable({ seats: [dead()] }), { seatId: "nobody", characterId: "mag" }, ports()),
    ).rejects.toThrow(/Nieznane miejsce/);
  });
});

describe("dosiadka: a latecomer to a table already running", () => {
  it("is the same deal, filed under its own name", async () => {
    const table = aTable({
      game: { turn: 4 },
      seats: [aSeat({ character_id: null, field_id: null, eliminated: false })],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca" },
      ports(),
    );
    expect(writes.journal?.at(-1)).toMatchObject({
      turn: 4,
      kind: "joined",
      payload: { characterId: "zdobywca" },
    });
    expect(writes.seats?.[0].patch).toMatchObject({ character_id: "zdobywca", ready: true });
  });
});

/* --------------------------------------------------------------------------
 * The surprise, drawn on the dice rather than on `node:crypto`.
 * ----------------------------------------------------------------------- */

describe("losowa Postać", () => {
  const takenBy = (ids: readonly string[]) =>
    ids.map((id, index) =>
      aSeat({
        id: `seat-${index + 1}`,
        seat_index: index + 1,
        character_id: asSeatCharacter(id),
      }),
    );

  /**
   * Two d6 read as a base-6 number index the 25 free cards; 1 and 1 is zero,
   * which is the first of them. The expected id comes off the same list the
   * command reads, so this cannot drift from the data.
   */
  it("picks off the dice, from whatever nobody is holding", async () => {
    const table = aTable({
      seats: [dead({ character_id: asSeatCharacter("goblin") }), ...takenBy(["mag"])],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "losowa" },
      ports({ random: scriptedRandom([1, 1]) }),
    );
    const free = CHARACTERS.filter((c) => c.id !== "goblin" && c.id !== "mag");
    expect(writes.journal?.at(-1)).toMatchObject({
      kind: "new-character",
      payload: { characterId: free[0].id, losowa: true },
    });
  });

  /**
   * The tail past the last whole multiple of 25 is rolled again rather than
   * folded back onto the first few cards, which would make them likelier.
   */
  it("throws away a roll that lands in the ragged tail and asks again", async () => {
    const table = aTable({
      seats: [dead({ character_id: asSeatCharacter("goblin") }), ...takenBy(["mag"])],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "losowa" },
      // 6,6 is 35 — past 25 and discarded; 1,2 is 1.
      ports({ random: scriptedRandom([6, 6, 1, 2]) }),
    );
    const free = CHARACTERS.filter((c) => c.id !== "goblin" && c.id !== "mag");
    expect(writes.journal?.at(-1)?.payload).toMatchObject({ characterId: free[1].id });
  });

  it("refuses when every Karta Postaci is on the table", async () => {
    const table = aTable({
      seats: [dead({ character_id: null }), ...takenBy(CHARACTERS.map((c) => c.id))],
    });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "losowa" }, ports()),
    ).rejects.toThrow(/Nie została żadna wolna Postać/);
  });
});
