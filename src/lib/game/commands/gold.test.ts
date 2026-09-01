import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable } from "../fixture";
import { only } from "@/lib/engine/stack";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { killSeat } from "./life";
import { turnToStone } from "./stone";
import { takeFieldGold } from "./holdings";

const HERE = asFieldId("mroczna-polana")!;

/** Standing on the Obszar, move finished, nothing owed — 12.1's own window. */
const arrived = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: HERE,
  from: null,
  draw: 0,
  drawn: [],
  ...over,
});

const table = (over: Parameters<typeof aTable>[0] = {}) =>
  aTable({
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 3 })],
    game: { active_seat: 0, turn_state: only(arrived()) },
    ...over,
  });

/**
 * 4.4 lists what stays and forgets the purse — Przedmioty and Przyjaciele on
 * the Obszar, Magia and Miecz żetony back to the spare pile, Zaklęcia to the
 * used one, and gold in none of the three.
 *
 * It is Talisman's 4:3 adapted (5.5 and 6.4 are 5:4 and 6:4 word for word), and
 * 4:3 reads "all the Character's Objects, Magic Objects, Followers **and Gold
 * Counters** are placed on the Space". 20.2 settles it from the other side:
 * three turns of stone leaves your gold on the square, and death should not be
 * gentler on a purse.
 */
describe("death leaves the purse where the character fell (4.4)", () => {
  it("puts the gold on the Obszar and takes it off the seat", () => {
    const before = table();
    const after = apply(before, killSeat(before, "seat-a"));
    expect(after.fieldGold.map((row) => [row.field_id, row.gold])).toEqual([[HERE, 3]]);
    expect(after.seats[0].gold).toBe(0);
  });

  it("leaves nothing behind for a character who died broke", () => {
    const broke = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 0 })],
    });
    expect(apply(broke, killSeat(broke, "seat-a")).fieldGold).toEqual([]);
  });

  /** It is gold now, not Karty. See `dropGold` and db/schema.sql. */
  it("does not mint Karty the deck never gave up", () => {
    const before = table();
    const after = apply(before, killSeat(before, "seat-a"));
    expect(after.fieldCards.filter((row) => row.card_id.includes("zlota"))).toEqual([]);
  });
});

/** 20.2: "Karty Przedmiotów i złota należy pozostawić na Obszarze". */
describe("stone leaves the purse too (20.2)", () => {
  it("puts the gold down as gold and the Przedmioty down as Karty", () => {
    const before = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 2 })],
      holdings: [aHolding({ id: "h1", seat_id: "seat-a", card_id: "helm", kind: "item" })],
    });
    const after = apply(before, turnToStone(before, { seatId: "seat-a" }));
    expect(after.fieldGold.map((row) => row.gold)).toEqual([2]);
    expect(after.fieldCards.map((row) => row.card_id)).toEqual(["helm"]);
    expect(after.seats[0].gold).toBe(0);
  });
});

/**
 * "zabrać leżące złoto" carries no number, and Talisman's 12:1 — the sentence
 * this is adapted from — says "**any** Gold Counters […] may be taken". So the
 * amount is the player's.
 */
describe("taking gold off an Obszar (12.1)", () => {
  const withGold = (gold: number, over: Parameters<typeof aTable>[0] = {}) =>
    table({ fieldGold: [{ id: "fg1", field_id: HERE, gold }], ...over });

  it("takes the amount asked for and leaves the rest", () => {
    const before = withGold(5);
    const { result, writes } = takeFieldGold(before, { seatId: "seat-a", gold: 2 });
    expect(result.took).toBe(2);
    const after = apply(before, writes);
    expect(after.fieldGold[0].gold).toBe(3);
    expect(after.seats[0].gold).toBe(5);
  });

  /** No purse at all rather than an empty one — see `takeGold`. */
  it("clears the row when the last coin goes", () => {
    const before = withGold(2);
    expect(apply(before, takeFieldGold(before, { seatId: "seat-a", gold: 2 }).writes).fieldGold)
      .toEqual([]);
  });

  it("refuses more than is lying there", () => {
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 3 })).toThrow(/tylko 2/);
  });

  it("refuses nothing, and refuses a fraction of a coin", () => {
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 0 })).toThrow(/Podaj/);
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 0.5 })).toThrow(/Podaj/);
  });

  it("refuses where there is none", () => {
    expect(() => takeFieldGold(table(), { seatId: "seat-a", gold: 1 })).toThrow(/Nie ma tu złota/);
  });

  /** 12.1a — the same guard the Karty are under. */
  it("refuses while a Wróg is standing here", () => {
    const guarded = withGold(3, {
      fieldCards: [{ id: "fc1", field_id: HERE, card_id: "wilk", granted: false, pool: null }],
    });
    expect(() => takeFieldGold(guarded, { seatId: "seat-a", gold: 1 })).toThrow(/12\.1a/);
  });

  /** 12.1b — and the same one about a square that still owes Karty. */
  it("refuses while the Obszar still owes Karty", () => {
    const owing = table({
      fieldGold: [{ id: "fg1", field_id: HERE, gold: 3 }],
      game: { active_seat: 0, turn_state: only(arrived({ draw: 1 })) },
    });
    expect(() => takeFieldGold(owing, { seatId: "seat-a", gold: 1 })).toThrow(/12\.1b/);
  });

  /** 3.5: "Sztuki Złota nie są wliczane do limitu Przedmiotów". */
  it("is not stopped by a full Plecak (3.5, 5.4)", () => {
    const full = withGold(3, {
      holdings: ["miecz", "helm", "tarcza", "zbroja"].map((cardId, at) =>
        aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
      ),
    });
    expect(takeFieldGold(full, { seatId: "seat-a", gold: 3 }).result.took).toBe(3);
  });
});
