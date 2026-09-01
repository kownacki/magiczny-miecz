import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable } from "../fixture";
import { only } from "@/lib/engine/stack";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { killSeat } from "./life";
import { turnToStone } from "./stone";
import { clearField, placeGold, takeFieldGold } from "./holdings";
import { RULE_FOR } from "@/lib/engine/journalRules";

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

/* ==========================================================================
 * The console's two doors: coins conjured onto a square, and a square swept.
 * ======================================================================= */

describe("what the journal says about gold changing hands", () => {
  /**
   * Its own kind, and not `taken`.
   *
   * It rode on `taken` — the Przedmiot line — whose sentence names a Karta, so
   * a purse filled off an Obszar was written down as „zdobywa: kartę": a card
   * that was never there, on a turn where none was picked up. The rule went
   * wrong with it, because `RULE_FOR` keys off the kind: 16.6 is the Przedmiot
   * lying on the Obszar, and 12.1 is the sentence that names the gold.
   */
  it("files a purse filled off an Obszar under 12.1, not 16.6", () => {
    const before = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 0 })],
      fieldGold: [{ id: "fg-1", field_id: HERE, gold: 6 }],
    });
    const { writes } = takeFieldGold(before, { seatId: "seat-a", gold: 2 });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "gold-taken",
      payload: { gold: 2, fieldId: HERE },
    });
    expect(RULE_FOR["gold-taken"]).toBe("12.1");
  });
});

describe("placing gold by fiat", () => {
  it("lays it on the Obszar the Postać stands on", () => {
    const before = table();
    const { writes, result } = placeGold(before, { seatId: "seat-a", gold: 5, target: null });
    expect(result).toEqual({ fieldId: HERE, gold: 5 });
    expect(apply(before, writes).fieldGold.map((row) => row.gold)).toEqual([5]);
  });

  it("lays it on a named Obszar instead, without moving anybody", () => {
    const before = table();
    const there = asFieldId("karczma")!;
    const after = apply(before, placeGold(before, { seatId: "seat-a", gold: 2, target: there }).writes);
    expect(after.fieldGold.map((row) => [row.field_id, row.gold])).toEqual([[there, 2]]);
    expect(after.seats[0].field_id).toBe(HERE);
  });

  /**
   * Coins add up where Karty pile up. `dropGold` patches the row rather than
   * inserting a second, which is the same reason `merge` resolves a column as
   * later-wins: two rows for one square would be a total nobody adds.
   */
  it("adds to what is already lying there", () => {
    const before = apply(table(), placeGold(table(), { seatId: "seat-a", gold: 4, target: null }).writes);
    const after = apply(before, placeGold(before, { seatId: "seat-a", gold: 3, target: null }).writes);
    expect(after.fieldGold.map((row) => row.gold)).toEqual([7]);
  });

  /** Money out of nowhere is still money — 3.1's bank hands out what it is asked for. */
  it("takes nothing off anybody's purse", () => {
    const before = table();
    expect(apply(before, placeGold(before, { seatId: "seat-a", gold: 9, target: null }).writes).seats[0].gold)
      .toBe(3);
  });

  it("refuses an amount that is not a number of coins", () => {
    const before = table();
    for (const gold of [0, -2]) {
      expect(() => placeGold(before, { seatId: "seat-a", gold, target: null })).toThrow("Ile Sztuk Złota?");
    }
  });

  /**
   * The journal says a person did it, and `manual` is what marks it as the
   * console rather than the game. `test-gold-field` and not `test-card-field`:
   * the reader who follows the line has to find coins on that square, not a
   * Karta that is not there.
   */
  it("writes it down as the override it is", () => {
    const { writes } = placeGold(table(), { seatId: "seat-a", gold: 5, target: null });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "test-gold-field",
      manual: true,
      payload: { gold: 5, fieldId: HERE },
    });
  });
});

describe("sweeping an Obszar takes the gold with the Karty", () => {
  const dressed = () => {
    const before = table();
    return apply(before, placeGold(before, { seatId: "seat-a", gold: 6, target: null }).writes);
  };

  it("leaves no coins behind, and says how many went", () => {
    const before = dressed();
    const { writes, result } = clearField(before, { seatId: "seat-a", fieldId: HERE });
    expect(result.gold).toBe(6);
    expect(apply(before, writes).fieldGold).toEqual([]);
  });

  /**
   * `clear` with a name takes the one thing named. Money has no name to type,
   * so a named sweep cannot be asking for it — and taking it anyway would be
   * the command doing something nobody typed.
   */
  it("leaves it alone when a single Karta is named", () => {
    const before = apply(dressed(), {
      fieldCards: { insert: [{ field_id: HERE, card_id: "targowisko", granted: true }] },
    });
    const { writes, result } = clearField(before, {
      seatId: "seat-a",
      fieldId: HERE,
      cardId: "targowisko",
    });
    expect(result.gold).toBe(0);
    expect(apply(before, writes).fieldGold.map((row) => row.gold)).toEqual([6]);
  });

  /** A square holding nothing but coins is not an empty square. */
  it("sweeps a square whose only contents are gold", () => {
    const before = dressed();
    expect(() => clearField(before, { seatId: "seat-a", fieldId: HERE })).not.toThrow();
    expect(clearField(before, { seatId: "seat-a", fieldId: HERE }).result.cards).toEqual([]);
  });

  it("still refuses a square with nothing on it at all", () => {
    expect(() => clearField(table(), { seatId: "seat-a", fieldId: HERE })).toThrow(
      "Na tym Obszarze nic nie leży.",
    );
  });
});
