import { describe, expect, it } from "vitest";
import charactersData from "@/data/characters.json";
import type { Character } from "@/data/types";
import { asSeatCharacter } from "@/lib/engine/characters";
import { scriptedRandom } from "@/lib/engine/ports";
import { FIELDS, asFieldId } from "@/lib/engine/board";
import { aHolding, aSeat, aTable, aUser, ports } from "../fixture";
import { only, top } from "@/lib/engine/stack";
import {
  changeNature,
  chooseCharacter,
  dealCharacters,
  mayChooseFor,
  placeSeat,
  takeNewCharacter,
} from "./character";

const CHARACTERS = charactersData as Character[];

/* --------------------------------------------------------------------------
 * Natura (7.2-7.4).
 * ----------------------------------------------------------------------- */

describe("zmiana Natury (7.2-7.4)", () => {
  const table = (over: Parameters<typeof aSeat>[0] = {}, holdings = [] as ReturnType<typeof aHolding>[]) =>
    aTable({ game: { round: 5 }, seats: [aSeat({ nature: "good", ...over })], holdings });

  it("writes the new Natura and the turn it happened on", () => {
    const { writes } = changeNature(table(), { seatId: "seat-a", nature: "evil" });
    expect(writes.seats).toEqual([
      { id: "seat-a", patch: { nature: "evil", nature_changed_round: 5 } },
    ]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "nature-change",
      payload: { from: "good", to: "evil", nowForbidden: [] },
    });
  });

  /**
   * 7.3 is a turn number, not a flag: "Żadna Postać nie może zmienić swojej
   * Natury częściej niż raz w trakcie tury gry."
   */
  it("refuses a second change in the same turn", () => {
    expect(() =>
      changeNature(table({ nature_changed_round: 5 }), { seatId: "seat-a", nature: "evil" }),
    ).toThrow(/najwyżej raz na turę/);
  });

  it("allows it again once the turn has moved on", () => {
    const { writes } = changeNature(table({ nature_changed_round: 4 }), {
      seatId: "seat-a",
      nature: "evil",
    });
    expect(writes.seats?.[0].patch).toMatchObject({ nature_changed_round: 5 });
  });

  /**
   * The test console's, and the reason it is a flag rather than a caller
   * quietly clearing `nature_changed_round` first — which is the same act with
   * the rule out of sight.
   */
  it("lets the console past 7.3, and says in the journal that somebody typed it", () => {
    const { writes } = changeNature(table({ nature_changed_round: 5 }), {
      seatId: "seat-a",
      nature: "evil",
      force: true,
    });
    expect(writes.seats?.[0].patch).toMatchObject({ nature: "evil" });
    expect(writes.journal?.[0]).toMatchObject({ kind: "nature-change", manual: true });
  });

  /**
   * The half of 7.3 the console has no business in. Typing a Natura is not the
   * character changing one, so it cannot use up the change 7.3 allows them —
   * and the mark this used to leave would refuse the next card that tried.
   */
  it("leaves no mark of 7.3 when somebody typed it", () => {
    const { writes } = changeNature(table(), {
      seatId: "seat-a",
      nature: "evil",
      byHand: true,
    });
    expect(writes.seats?.[0].patch).toEqual({ nature: "evil" });
    expect(writes.journal?.[0]).toMatchObject({ manual: true });
  });

  /**
   * And the half it does: a mark that is already there can only be the game's
   * own, so the console meets a change that really happened and is told about
   * it rather than quietly walking through.
   */
  it("still refuses a typed change over a 7.3 the game wrote", () => {
    expect(() =>
      changeNature(table({ nature_changed_round: 5 }), {
        seatId: "seat-a",
        nature: "evil",
        byHand: true,
      }),
    ).toThrow(/force/);
  });

  it("marks an ordinary change as what it is: not manual", () => {
    const { writes } = changeNature(table(), { seatId: "seat-a", nature: "evil" });
    expect(writes.journal?.[0].manual ?? false).toBe(false);
  });

  /**
   * Lifted in both directions, which is the half that was missing.
   *
   * A forced change that left 7.3's mark behind would spend the character's one
   * change of the turn on something that never happened in the game: the next
   * card to turn them Zły would be refused, and the player would be reading
   * "drugiej zmiany nie będzie" over a Natura nobody at the table had changed.
   */
  it("leaves no 7.3 behind it when the console did it", () => {
    const { writes } = changeNature(table(), {
      seatId: "seat-a",
      nature: "evil",
      force: true,
    });
    expect(writes.seats?.[0].patch).toEqual({ nature: "evil" });
  });

  it("still records the turn when the game did it", () => {
    const { writes } = changeNature(table(), { seatId: "seat-a", nature: "evil" });
    expect(writes.seats?.[0].patch).toMatchObject({ nature_changed_round: 5 });
  });

  /** Magog's own card lets it change freely, and 8.2 puts that above 7.3. */
  it("lets Magog change as often as it likes", () => {
    const magog = table({ character_id: asSeatCharacter("magog"), nature_changed_round: 5 });
    expect(changeNature(magog, { seatId: "seat-a", nature: "evil" }).result).toEqual({
      nowForbidden: [],
    });
  });

  /**
   * 7.4 with 5.5, and 5.3 is about *having* the card: "nie może być w
   * posiadaniu". The Święta Włócznia is forbidden to Złe Postacie, so a
   * character who turns Zła does not merely stop counting it — it leaves their
   * hands at once, and 12.1 says where it lands.
   */
  it("puts down what the new Natura may not possess, in klasyczny", () => {
    const held = [
      aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" }),
      aHolding({ id: "h-helm", card_id: "helm", kind: "item" }),
    ];
    const { writes, result } = changeNature(table({}, held), { seatId: "seat-a", nature: "evil" });
    expect(result.nowForbidden).toEqual(["swieta-wlocznia"]);
    // The Hełm nobody has an opinion about stays exactly where it is.
    expect(writes.holdings?.delete).toEqual(["h-wlocznia"]);
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "swieta-wlocznia", granted: false },
    ]);
  });

  /**
   * And not in slotowy, which has already split carrying from using.
   *
   * 5.3 forbids possession *because* it forbids use, and in the variant a card
   * in the Plecak is carried and not used. So it stays — red, inert, and
   * refused by `equipCard` — and is still named, because naming it is what
   * turns the tile red.
   */
  it("leaves it in the pack where the variant has places to put things", () => {
    const held = [aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" })];
    const slotted = aTable({
      game: { round: 5, eq_mode: "slots" },
      seats: [aSeat({ nature: "good" })],
      holdings: held,
    });
    const { writes, result } = changeNature(slotted, { seatId: "seat-a", nature: "evil" });
    expect(result.nowForbidden).toEqual(["swieta-wlocznia"]);
    expect(writes.holdings).toBeUndefined();
    expect(writes.fieldCards).toBeUndefined();
    expect(writes.journal?.map((row) => row.kind)).toEqual(["nature-change"]);
  });

  /**
   * The Natura first and the cards after it, which is the order somebody
   * reading the journal needs: the line that explains the drop is above it.
   * The drop itself explains nothing — "odrzuca: X" and no more.
   */
  it("journals the change, then the cards it cost", () => {
    const held = [aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" })];
    const { writes } = changeNature(table({}, held), { seatId: "seat-a", nature: "evil" });
    expect(writes.journal?.map((row) => row.kind)).toEqual(["nature-change", "discarded"]);
    expect(writes.journal?.[1]).toMatchObject({
      seatId: "seat-a",
      payload: { cardId: "swieta-wlocznia", onField: "mroczna-polana" },
    });
  });

  /**
   * A card that turns somebody Zły when they are already Zły did what it said
   * and had no effect. The table can only learn that from the journal.
   */
  it("journals a Natura set to the one already in force", () => {
    const { writes, result } = changeNature(table({ nature: "evil" }), {
      seatId: "seat-a",
      nature: "evil",
    });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "nature-change",
      payload: { from: "evil", to: "evil", nowForbidden: [] },
    });
    expect(result.nowForbidden).toEqual([]);
  });

  it("does not spend 7.3's one change on a Natura that did not move", () => {
    // Nothing written to the seat, so `nature_changed_round` stays where it was
    // and the real change this character might still make is available.
    const { writes } = changeNature(table({ nature: "evil" }), {
      seatId: "seat-a",
      nature: "evil",
    });
    expect(writes.seats).toBeUndefined();
    // And 7.3 does not refuse it either, however many times it is asked.
    expect(() =>
      changeNature(table({ nature: "evil", nature_changed_round: 5 }), {
        seatId: "seat-a",
        nature: "evil",
      }),
    ).not.toThrow();
  });

  it("says nothing about a card the new Natura may keep", () => {
    const held = [aHolding({ id: "h-wlocznia", card_id: "swieta-wlocznia", kind: "item" })];
    const { result } = changeNature(table({ nature: "evil" }, held), {
      seatId: "seat-a",
      nature: "good",
    });
    expect(result.nowForbidden).toEqual([]);
  });

  it("refuses a seat it does not know", () => {
    expect(() => changeNature(table(), { seatId: "nobody", nature: "evil" })).toThrow(
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
      ...over,
      game: { active_seat: 0, ...(over.game ?? {}) },
      seats: over.seats ?? [aSeat({ seat_index: 0 })],
    });

  it("moves the figure and files it as a manual correction", () => {
    const { writes } = placeSeat(table(), { seatId: "seat-a", target: "osada", reason: "test", by: "korekta" });
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
      by: "korekta",
    });
    expect(writes.game).toBeUndefined();
  });

  it("restages a correction on the new Obszar owing nothing (15.1)", () => {
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
    const { writes } = placeSeat(mid, { seatId: "seat-a", target: "grod", reason: null, by: "korekta" });
    expect(writes.game?.turn_state).toEqual(
      only({
        phase: "field",
        fieldId: "grod",
        from: null,
        draw: 0,
        drawn: [],
        fought: [],
      }),
    );
  });

  /** The commonest reason to reach for this is a table stuck mid-something. */
  it("drags a turn stuck past the roll onto the new Obszar too", () => {
    const stuck = table({ game: { turn_state: { phase: "move", roll: 4, options: [] } } });
    const { writes } = placeSeat(stuck, { seatId: "seat-a", target: "grod", reason: null, by: "korekta" });
    expect(top(writes.game!.turn_state!)).toMatchObject({ phase: "field", fieldId: "grod" });
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
    const { writes } = placeSeat(other, { seatId: "seat-a", target: "osada", reason: null, by: "korekta" });
    expect(writes.game).toBeUndefined();
  });

  /**
   * The other reading of the same act, and the one every card that moves you
   * needs (13.1).
   *
   * „Postacie mogą spotykać się tylko na Obszarze, na którym zakończyły swój
   * ruch lub na Obszarze, na który zostały przeniesione wskutek spotkania.
   * Podobnie: tylko te Obszary mogą badać." So an arrival owes what the Obszar
   * prints, and `draw` and the Obszar's own offer both work when you get there
   * — which they did not, because the frame said nothing was owed.
   */
  it("arrives properly when the move is one the game made (13.1, 13.4)", () => {
    const mid = table({
      game: {
        turn_state: {
          phase: "field",
          fieldId: "mroczna-polana",
          from: null,
          draw: 0,
          drawn: [],
          fought: [],
        },
      },
    });
    // Bezdroża prints two Karty.
    const { writes } = placeSeat(mid, {
      seatId: "seat-a",
      target: "bezdroza",
      reason: "KOSZMAR",
      by: "karta",
    });
    expect(writes.game?.turn_state).toEqual(
      only({ phase: "field", fieldId: "bezdroza", from: null, draw: 2, drawn: [] }),
    );
  });

  /**
   * And the journal says which of the two it was.
   *
   * One kind served all three callers, so a Karta doing what it prints was
   * painted as an override and tagged „tryb testowy" — the journal is opened
   * to settle arguments, and this one accused somebody of cheating.
   */
  it("files a Karta's move as the game and a hand's as an override", () => {
    const mid = table({
      game: {
        turn_state: {
          phase: "field",
          fieldId: "mroczna-polana",
          from: null,
          draw: 0,
          drawn: [],
          fought: [],
        },
      },
    });
    const byCard = placeSeat(mid, {
      seatId: "seat-a",
      target: "bezdroza",
      reason: "KOSZMAR",
      by: "karta",
    });
    expect(byCard.writes.journal?.[0]).toMatchObject({
      kind: "moved-by-card",
      manual: false,
      payload: { to: "bezdroza", reason: "KOSZMAR" },
    });

    for (const by of ["konsola", "korekta"] as const) {
      const byHand = placeSeat(mid, { seatId: "seat-a", target: "bezdroza", reason: null, by });
      expect(byHand.writes.journal?.[0], by).toMatchObject({
        kind: "moved-by-hand",
        manual: true,
      });
    }
  });

  /**
   * 16.8's Karty are the arriving character's to deal with, and they count
   * against 13.4's tally — the same subtraction an ordinary move makes,
   * because it is the same function.
   */
  it("picks up what is lying on the Obszar it arrives at (16.8, 13.4)", () => {
    const mid = table({
      game: {
        turn_state: {
          phase: "field",
          fieldId: "mroczna-polana",
          from: null,
          draw: 0,
          drawn: [],
          fought: [],
        },
      },
      fieldCards: [
        { id: "fc-1", field_id: "bezdroza", card_id: "cyklop", granted: false },
      ],
    });
    const { writes } = placeSeat(mid, {
      seatId: "seat-a",
      target: "bezdroza",
      reason: "KOSZMAR",
      by: "karta",
    });
    const landed = top(writes.game!.turn_state!);
    expect(landed).toMatchObject({ phase: "field", fieldId: "bezdroza", draw: 1 });
    expect((landed as { drawn: { cardId: string }[] }).drawn.map((one) => one.cardId)).toEqual([
      "cyklop",
    ]);
    // Off the board and into the turn, or the next character would find it
    // still lying there.
    expect(writes.fieldCards?.delete).toEqual(["fc-1"]);
  });

  it("refuses an Obszar that is not on the board", () => {
    expect(() =>
      placeSeat(table(), { seatId: "seat-a", target: "step", reason: null, by: "korekta" }),
    ).toThrow(/nie ma takiego Obszaru/);
  });
});

/* --------------------------------------------------------------------------
 * Taking a new Postać (4.4).
 * ----------------------------------------------------------------------- */

/** A seat whose character has just died, which is what 4.4 is written for. */
const dead = (over: Parameters<typeof aSeat>[0] = {}) =>
  aSeat({ seat_index: 0, eliminated: true, life: 0, gold: 0, turns_lost: 2, ...over });

describe("nowa Postać po śmierci (4.4)", () => {
  it("seats the new character on its own MGR with its printed points", async () => {
    const table = aTable({ game: { round: 9 }, seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.seats?.[0].patch).toEqual({
      character_id: "zdobywca",
      field_id: "osada",
      sword_own: 4,
      magic_own: 3,
      sword_floor: 4,
      magic_floor: 3,
      nature: "chaotic",
      eliminated: false,
      life: 4,
      gold: 1,
      turns_lost: 0,
      stone_until_round: null,
      bridge_blocked_until_round: null,
      nature_changed_round: null,
    });
    expect(writes.journal?.at(-1)).toMatchObject({
      seatId: "seat-a",
      round: 9,
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
      { seatId: "seat-a", characterId: "kat", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.seats?.[0].patch).toMatchObject({ nature: null });
  });

  it("deals the Przedmioty and the purse the Karta Postaci names (3.2)", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "ksiaze", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "helm", kind: "item", face: "open" },
      { seat_id: "seat-a", card_id: "miecz", kind: "item", face: "open" },
    ]);
    expect(writes.seats?.[0].patch).toMatchObject({ gold: 5 });
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "starting-kit",
      "new-character",
    ]);
    expect(writes.journal?.[0].payload).toEqual({
      character: "ksiaze",
      items: ["helm", "miecz"],
      gold: 5,
    });
  });

  it("says nothing about equipment for a character who starts with none", async () => {
    const table = aTable({ seats: [dead()] });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "awanturnik", bySeat: "seat-a" },
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
      { seatId: "seat-a", characterId: "mag", bySeat: "seat-a" },
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
      { seatId: "seat-a", characterId: "ksiaze", bySeat: "seat-a" },
      ports(),
    );
    expect(result).toEqual({ seatId: "seat-a", spells: 0 });
  });

  /**
   * The sole player's death, which stops the table outright.
   *
   * `killSeat` passes the turn, `nextSeat` looks round a table of one
   * eliminated seat and finds nobody, and `active_seat` goes null — after
   * which every way of moving the game on is refused for want of an active
   * seat, 4.4's own new Postać included.
   */
  it("starts the table again when nobody was left to play", async () => {
    const table = aTable({
      game: { active_seat: null, turn_state: { phase: "roll" } },
      seats: [dead()],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.game).toMatchObject({ active_seat: 0, turn_state: only({ phase: "roll" }) });
  });

  it("does not take the turn from whoever is playing", async () => {
    const table = aTable({
      game: { active_seat: 1 },
      seats: [dead(), aSeat({ id: "seat-b", seat_index: 1, character_id: "kaplanka" })],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.game?.active_seat).toBeUndefined();
  });

  it("refuses to swap a Postać that is still alive", async () => {
    const table = aTable({ seats: [aSeat({ eliminated: false })] });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "mag", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow(/wciąż żyje/);
  });

  /** The dead one's card is out of the game, so it cannot be taken again. */
  it("refuses a Postać somebody is already holding, the dead one included", async () => {
    const table = aTable({
      seats: [dead(), aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("mag") })],
    });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "mag", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow(/już w grze/);
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "goblin", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow(/już w grze/);
  });

  it("refuses a character id that is not on any card", async () => {
    const table = aTable({ seats: [dead()] });
    await expect(
      takeNewCharacter(table, { seatId: "seat-a", characterId: "smok", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow(/Nieznana postać: smok/);
  });

  it("refuses a seat it does not know", async () => {
    await expect(
      takeNewCharacter(aTable({ seats: [dead()] }), { seatId: "nobody", characterId: "mag", bySeat: "nobody" }, ports()),
    ).rejects.toThrow(/Nieznane miejsce/);
  });
});

describe("dosiadka: a latecomer to a table already running", () => {
  it("is the same deal, filed under its own name", async () => {
    const table = aTable({
      game: { round: 4 },
      seats: [aSeat({ character_id: null, field_id: null, eliminated: false })],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.journal?.at(-1)).toMatchObject({
      round: 4,
      kind: "joined",
      payload: { characterId: "zdobywca" },
    });
    expect(writes.seats?.[0].patch).toMatchObject({ character_id: "zdobywca" });
  });

  /**
   * The shape a real latecomer actually has, which is why this went wrong.
   *
   * `joinGame` opens a mid-game seat **out of play** — `eliminated: true` with
   * no Karta — so it stands out of the round until its player picks. The test
   * above pins `eliminated: false`, which is a poczekalnia seat rather than a
   * latecomer's, so it never touched the branch that decides between the two
   * events. Told apart by `eliminated` alone, every arrival was filed as a 4.4
   * replacement and the journal said "gra dalej jako" about somebody who had
   * not played yet. Only a death leaves a Postać on the seat to be replaced.
   */
  it("is still a latecomer when its seat came in out of play", async () => {
    const table = aTable({
      game: { round: 4 },
      seats: [aSeat({ character_id: null, field_id: null, eliminated: true })],
    });
    const { writes } = await takeNewCharacter(
      table,
      { seatId: "seat-a", characterId: "zdobywca", bySeat: "seat-a" },
      ports(),
    );
    expect(writes.journal?.at(-1)).toMatchObject({ kind: "joined" });
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
      { seatId: "seat-a", characterId: "losowa", bySeat: "seat-a" },
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
      { seatId: "seat-a", characterId: "losowa", bySeat: "seat-a" },
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
      takeNewCharacter(table, { seatId: "seat-a", characterId: "losowa", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow(/Nie została żadna wolna Postać/);
  });
});

/* --------------------------------------------------------------------------
 * Setting up: choosing and dealing the Karty Postaci (0.1-0.4).
 * ----------------------------------------------------------------------- */

/** The poczekalnia: a table nobody has started, and a seat holding nothing. */
const waiting = (
  seats = [aSeat({ character_id: null, field_id: null })],
  users?: ReturnType<typeof aUser>[],
) => aTable({ game: { status: "lobby", round: 0 }, seats, users });

/** A seat in the poczekalnia, numbered so several can sit at one table. */
const empty = (index: number, over: Parameters<typeof aSeat>[0] = {}) =>
  aSeat({
    id: `seat-${index + 1}`,
    seat_index: index,
    character_id: null,
    field_id: null,
    ...over,
  });

/**
 * Whose Postać you may choose, which turned out to be everybody's.
 *
 * The route took a `seatId` off the request body and used it, under a comment
 * explaining the device-less case as though that were what the code said. Any
 * seated player could post another player's `seatId` and take their Postać off
 * the table — and choosing does not merely swap the card: it clears the points,
 * the MGR, the Natura and the ready flag, so what is left behind is a blank
 * seat. It needs no malice either; a stale `seatId` on a re-sent request does
 * it by accident.
 *
 * The browser has always refused to aim anywhere but your own slot. A rule the
 * client keeps and the server does not is not a rule, which is the whole of why
 * these tests are here rather than in the strip.
 */
describe("whose Karta Postaci you may choose", () => {
  const table = () =>
    aTable({
      game: { status: "lobby" },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, character_id: null }),
        aSeat({ id: "seat-b", seat_index: 1, character_id: null }),
        // The third chair has nobody behind it — somebody in the room the host
        // set up, which is what `no_device` used to mark and what the split
        // turned into the plain absence of a driver.
        aSeat({ id: "seat-local", seat_index: 2, character_id: null }),
      ],
      users: [
        aUser({ id: "usra", name: "Michał", seat_index: 0 }),
        aUser({ id: "usrb", name: "Ola", seat_index: 1, is_host: false }),
      ],
    });

  it("is your own seat", () => {
    expect(mayChooseFor(table(), "seat-a", "seat-a")).toBe(true);
  });

  it("is not anybody else's", () => {
    expect(mayChooseFor(table(), "seat-b", "seat-a")).toBe(false);
  });

  it("is a seat with no device of its own", () => {
    // The ordinary case at a table, not an edge case: one laptop in the middle
    // and somebody sitting there who is not holding anything. It is the reason
    // choosing for another seat exists at all.
    expect(mayChooseFor(table(), "seat-local", "seat-a")).toBe(true);
  });

  it("is nothing at all for a seat that is not at this table", () => {
    expect(mayChooseFor(table(), "seat-from-another-game", "seat-a")).toBe(false);
  });

  it("refuses the choice rather than quietly aiming it somewhere else", () => {
    // Not silently redirected to the caller's own seat: a request aimed at the
    // wrong seat is a bug or an attempt, and answering it with a different
    // action would hide both.
    expect(() =>
      chooseCharacter(table(), { seatId: "seat-b", characterId: "kaplanka", bySeat: "seat-a" }),
    ).toThrow("Postać wybiera się sobie");
  });

  it("lets the ordinary choice through untouched", () => {
    const { writes } = chooseCharacter(table(), {
      seatId: "seat-a",
      characterId: "kaplanka",
      bySeat: "seat-a",
    });
    expect(writes.seats?.[0].patch.character_id).toBe("kaplanka");
  });

  it("guards 4.4's second choice the same way", async () => {
    /**
     * The narrower half of the same hole. A dead seat is the only thing this
     * path will touch, so the blast radius was smaller — but somebody else's
     * new character after their death is still not yours to pick.
     */
    const dead = aTable({
      game: { status: "playing" },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, eliminated: true, character_id: null }),
      ],
    });
    await expect(
      takeNewCharacter(dead, { seatId: "seat-b", characterId: "kaplanka", bySeat: "seat-a" }, ports()),
    ).rejects.toThrow("Postać wybiera się sobie");
    await expect(
      takeNewCharacter(dead, { seatId: "seat-b", characterId: "kaplanka", bySeat: "seat-b" }, ports()),
    ).resolves.toBeTruthy();
  });
});

describe("wybór Karty Postaci (0.2-0.4)", () => {
  it("seats the chosen character on its MGR with its printed points", () => {
    const { writes } = chooseCharacter(waiting(), {
      seatId: "seat-a",
      characterId: "kaplanka",
      bySeat: "seat-a",
    });
    expect(writes.seats).toEqual([
      {
        id: "seat-a",
        patch: {
          character_id: "kaplanka",
          field_id: "uroczysko",
          sword_own: 1,
          magic_own: 5,
          sword_floor: 1,
          magic_floor: 5,
          nature: "good",
        },
      },
    ]);
  });

  /**
   * 0.3, and the reason it is a rule rather than a greyed-out button: two
   * devices can reach for the Kapłanka in the same second and only the server
   * sees both. The refusal names her, because "ta postać jest zajęta" sends
   * somebody back to a strip of 27 to work out which one they meant.
   */
  it("refuses a Karta Postaci another seat is holding, and says which one", () => {
    const table = waiting([empty(0), empty(1, { character_id: asSeatCharacter("kaplanka") })]);
    expect(() => chooseCharacter(table, { seatId: "seat-1", characterId: "kaplanka", bySeat: "seat-1" })).toThrow(
      /KAPŁANKA jest już wybrana przez kogoś innego/,
    );
  });

  it("does not count a seat's own card against it", () => {
    const table = waiting([empty(0, { character_id: asSeatCharacter("kaplanka") })]);
    expect(() =>
      chooseCharacter(table, { seatId: "seat-1", characterId: "kaplanka", bySeat: "seat-1" }),
    ).not.toThrow();
  });

  /**
   * Otherwise a player who said they were ready and then changed their mind is
   * still counted, and the host starts a game somebody was still deciding
   * about.
   *
   * Written on the *person*, which is where readiness lives: the chair takes
   * the Postać and the player takes back their word, in one change.
   */
  it("un-readies whoever changed their mind", () => {
    const table = waiting(
      [empty(0, { character_id: asSeatCharacter("mag") })],
      [aUser({ id: "usra", seat_index: 0, ready: true })],
    );
    const { writes } = chooseCharacter(table, { seatId: "seat-1", characterId: "troll", bySeat: "seat-1" });
    expect(writes.seats?.[0].patch).toMatchObject({ character_id: "troll" });
    expect(writes.users).toEqual([{ id: "usra", patch: { ready: false } }]);
  });

  it("has nobody to un-ready on a chair the host is choosing for", () => {
    // A seat with no driver is somebody in the room whose Postać the host is
    // setting up. There is no word to take back.
    const table = waiting([empty(0, { character_id: asSeatCharacter("mag") })], []);
    const { writes } = chooseCharacter(table, { seatId: "seat-1", characterId: "troll", bySeat: "seat-1" });
    expect(writes.users).toBeUndefined();
  });

  it("puts the surprise on the seat and settles nothing else about it", () => {
    const { writes } = chooseCharacter(waiting(), { seatId: "seat-a", characterId: "losowa", bySeat: "seat-a" });
    expect(writes.seats?.[0].patch).toMatchObject({ character_id: "losowa" });
  });

  /**
   * A seat changing its mind out of the Książę and into the surprise would
   * otherwise keep his 4/3 and his Gród, and keep them for good if the deal
   * never ran — a Postać wearing somebody else's numbers.
   */
  it("clears what the last Karta Postaci left behind when a seat takes the surprise", () => {
    const ksiaze = waiting([
      empty(0, {
        character_id: asSeatCharacter("ksiaze"),
        field_id: asFieldId("grod"),
        sword_own: 4,
        magic_own: 3,
        sword_floor: 4,
        magic_floor: 3,
        nature: "chaotic",
      }),
    ]);
    const { writes } = chooseCharacter(ksiaze, { seatId: "seat-1", characterId: "losowa", bySeat: "seat-1" });
    expect(writes.seats?.[0].patch).toEqual({
      character_id: "losowa",
      field_id: null,
      sword_own: 0,
      magic_own: 0,
      sword_floor: 0,
      magic_floor: 0,
      nature: null,
    });
  });

  it("refuses a character id that is not on any card", () => {
    expect(() => chooseCharacter(waiting(), { seatId: "seat-a", characterId: "smok", bySeat: "seat-a" })).toThrow(
      /Nieznana postać: smok/,
    );
  });

  it("refuses a seat it does not know", () => {
    expect(() => chooseCharacter(waiting(), { seatId: "nobody", characterId: "mag", bySeat: "nobody" })).toThrow(
      /Nieznane miejsce/,
    );
  });

  /**
   * Two Obszary answer to "Step", so no amount of slugifying it will ever
   * produce a field id. Six characters were slugified onto fields that do not
   * exist and started the game standing nowhere: Goblin, Hobgoblin, Karzeł,
   * Magog, Obbol and Olbrzym.
   *
   * The first in board order is `step-2`, which is the one printed *Step I* —
   * the numerals run the way a player walks the ring and the ids do not, so
   * Hobgoblin starts on the Step somebody would point at.
   */
  it("resolves an MGR two Obszary answer to onto the first of them in board order", () => {
    const { writes } = chooseCharacter(waiting(), { seatId: "seat-a", characterId: "hobgoblin", bySeat: "seat-a" });
    expect(writes.seats?.[0].patch).toMatchObject({ field_id: "step-2" });
  });

  it("puts all 27 Karty Postaci on an Obszar the board actually has", () => {
    for (const character of CHARACTERS) {
      const { writes } = chooseCharacter(waiting(), {
        seatId: "seat-a",
        characterId: character.id,
        bySeat: "seat-a",
      });
      expect(FIELDS.has(writes.seats![0].patch.field_id!)).toBe(true);
    }
  });

  /**
   * There is no such Karta Postaci, which is the point: the guard is there for
   * a data error, so the test has to make one. Refusing the pick is the
   * behaviour worth having — a seated-nowhere figure has no dot on the map, no
   * directions to move in and a turn dead on arrival.
   */
  it("refuses a Karta Postaci whose MGR is not an Obszar on the board", () => {
    const kat = CHARACTERS.find((c) => c.id === "kat")!;
    const printed = kat.start;
    kat.start = "Wyspa Skarbów";
    try {
      expect(() => chooseCharacter(waiting(), { seatId: "seat-a", characterId: "kat", bySeat: "seat-a" })).toThrow(
        /Obszar, którego nie ma na planszy: Wyspa Skarbów/,
      );
    } finally {
      kat.start = printed;
    }
  });
});

/* --------------------------------------------------------------------------
 * The deal (0.1), and the surprise it settles at the start of the game.
 * ----------------------------------------------------------------------- */

describe("rozdanie Kart Postaci (0.1)", () => {
  /** Enough throws for six seats: `pickBelow` spends two on any pool over six. */
  const ones = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  /** Every 1 reads as digit 0, so each pick takes whatever is left on top. */
  const offTheTop = () => ports({ random: scriptedRandom(ones) });

  const dealt = (writes: { seats?: { id: string; patch: { character_id?: unknown } }[] }) =>
    Object.fromEntries((writes.seats ?? []).map((s) => [s.id, s.patch.character_id]));

  it("deals one card to every seat that has not chosen, in one changeset", async () => {
    const { writes } = await dealCharacters(
      waiting([empty(0), empty(1)]),
      { to: "unchosen" },
      offTheTop(),
    );
    expect(writes.seats).toHaveLength(2);
    expect(dealt(writes)).toEqual({
      "seat-1": CHARACTERS[0].id,
      "seat-2": CHARACTERS[1].id,
    });
  });

  it("deals the whole Karta Postaci, not just its name", async () => {
    const { writes } = await dealCharacters(waiting([empty(0)]), { to: "unchosen" }, offTheTop());
    expect(writes.seats?.[0].patch).toMatchObject({
      character_id: "awanturnik",
      field_id: "karczma",
      sword_own: 3,
      magic_own: 3,
      sword_floor: 3,
      magic_floor: 3,
      nature: "chaotic",
    });
  });

  /**
   * One figure per card (0.3). The pool is what nobody is holding, and each
   * card leaves it as it is dealt — so the same throw twice cannot hand the
   * Awanturnik to two people.
   */
  it("never deals a Karta Postaci somebody is already holding", async () => {
    const table = waiting([
      empty(0),
      empty(1, { character_id: asSeatCharacter("awanturnik") }),
      empty(2),
    ]);
    const { writes } = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    const given = Object.values(dealt(writes));
    expect(given).not.toContain("awanturnik");
    expect(new Set(given).size).toBe(2);
  });

  /**
   * The sentinel is not a card, so a seat holding it is not holding anything —
   * but it has chosen, and the poczekalnia's deal is for people who have not.
   */
  it("leaves a seat that asked to be surprised waiting for the surprise", async () => {
    const table = waiting([empty(0, { character_id: asSeatCharacter("losowa") }), empty(1)]);
    const { writes } = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    expect(writes.seats?.map((s) => s.id)).toEqual(["seat-2"]);
  });

  /**
   * It used to skip a seat whose player had walked away, and there is no such
   * seat to skip any more. A chair nobody is driving is either one the host set
   * up for somebody in the room — which `mayChooseFor` lets them choose for, so
   * the deal has to fill it too — or one the sweep is about to take away, and
   * `no_device` was the flag that told those two apart.
   */
  it("deals to a chair nobody is driving, the same as any other", async () => {
    const table = waiting([empty(0), empty(1)], [aUser({ id: "usra", seat_index: 0 })]);
    const { writes } = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    expect(writes.seats?.map((s) => s.id)).toEqual(["seat-1", "seat-2"]);
  });

  /**
   * The old deal called `chooseCharacter`, which un-readies, and then had to
   * put the flag back. Being dealt the card you asked to be surprised by is not
   * changing your mind, and un-readying here would make the start button refuse
   * the very table that just pressed it.
   */
  it("leaves readiness exactly where it found it", async () => {
    const table = waiting([empty(0)], [aUser({ id: "usra", seat_index: 0, ready: true })]);
    const { writes } = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    expect(writes.users).toBeUndefined();
  });

  it("writes nothing at all when there is nobody to deal to", async () => {
    const table = waiting([empty(0, { character_id: asSeatCharacter("mag") })]);
    const { writes } = await dealCharacters(table, { to: "unchosen" }, ports());
    expect(writes).toEqual({});
  });

  /**
   * `change()` replays the same throws on a retried commit (see `replayable`),
   * so a deal that came out differently the second time would hand somebody a
   * different character for no reason they could see.
   */
  it("deals the same cards for the same dice", async () => {
    const table = waiting([empty(0), empty(1), empty(2)]);
    const once = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    const twice = await dealCharacters(table, { to: "unchosen" }, offTheTop());
    expect(twice.writes).toEqual(once.writes);
  });

  it("reads the dice, not the order of the cards", async () => {
    const table = waiting([empty(0)]);
    // 1,3 is 2 in base six, and the third card in the pool.
    const { writes } = await dealCharacters(
      table,
      { to: "unchosen" },
      ports({ random: scriptedRandom([1, 3]) }),
    );
    expect(writes.seats?.[0].patch.character_id).toBe(CHARACTERS[2].id);
  });
});

describe("rozstrzygnięcie losowań na starcie", () => {
  const ones = [1, 1, 1, 1, 1, 1];

  /**
   * The difference from the poczekalnia's deal is deliberate: a seat that never
   * picked anything has not agreed to play, and dealing it a character at the
   * moment somebody presses start would put a stranger in the game.
   */
  it("fills the seats holding the surprise and nobody else", async () => {
    const table = aTable({
      game: { status: "lobby", round: 0 },
      seats: [
        empty(0, { character_id: asSeatCharacter("losowa") }),
        empty(1),
        empty(2, { character_id: asSeatCharacter("mag") }),
      ],
    });
    const { writes } = await dealCharacters(
      table,
      { to: "surprises" },
      ports({ random: scriptedRandom(ones) }),
    );
    expect(writes.seats?.map((s) => s.id)).toEqual(["seat-1"]);
    // And not the Mag, who is on the table already.
    expect(writes.seats?.[0].patch.character_id).not.toBe("mag");
  });

  it("gives two seats that both asked for a surprise two different Postacie", async () => {
    const table = aTable({
      game: { status: "lobby", round: 0 },
      seats: [
        empty(0, { character_id: asSeatCharacter("losowa") }),
        empty(1, { character_id: asSeatCharacter("losowa") }),
      ],
    });
    const { writes } = await dealCharacters(
      table,
      { to: "surprises" },
      ports({ random: scriptedRandom(ones) }),
    );
    const given = writes.seats?.map((s) => s.patch.character_id);
    expect(given).toEqual([CHARACTERS[0].id, CHARACTERS[1].id]);
  });
});
