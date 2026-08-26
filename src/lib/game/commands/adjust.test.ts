import { describe, expect, it } from "vitest";
import { aSeat, aTable } from "../fixture";
import { adjustSeat } from "./adjust";

const table = (over: Parameters<typeof aSeat>[0] = {}) =>
  aTable({
    game: { active_seat: 0 },
    seats: [aSeat({ id: "seat-a", seat_index: 0, ...over }), aSeat({ id: "seat-b", seat_index: 1 })],
  });

const correct = (over: Parameters<typeof aSeat>[0], stat: Parameters<typeof adjustSeat>[1]["stat"], delta: number) =>
  adjustSeat(table(over), { seatId: "seat-a", stat, delta, reason: "test" });

describe("the manual override", () => {
  it("moves the number and files it as a korekta", () => {
    const { writes } = correct({ zloto: 3 }, "zloto", 2);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { zloto: 5 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "korekta",
      manual: true,
      payload: { stat: "zloto", delta: 2, from: 3, to: 5, reason: "test" },
    });
  });

  it("lets a card file it as the card's own doing instead", () => {
    const { writes } = adjustSeat(table({ zloto: 1 }), {
      seatId: "seat-a",
      stat: "zloto",
      delta: 1,
      reason: null,
      record: { kind: "punkty", manual: false },
    });
    expect(writes.journal?.[0]).toMatchObject({ kind: "punkty", manual: false });
  });

  /** 1.3 and 2.3: own points never fall below what the character started with. */
  it("will not push Miecz below its floor", () => {
    const { writes } = correct({ miecz_own: 3, miecz_floor: 2 }, "miecz", -5);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { miecz_own: 2 } }]);
  });

  it("will not push Magia below its floor", () => {
    const { writes } = correct({ magia_own: 4, magia_floor: 1 }, "magia", -10);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { magia_own: 1 } }]);
  });

  it("floors Życie and Złoto at zero, which have no starting value to keep", () => {
    expect(correct({ zloto: 2 }, "zloto", -9).writes.seats).toEqual([
      { id: "seat-a", patch: { zloto: 0 } },
    ]);
    expect(correct({ turns_lost: 1 }, "tury", -4).writes.seats).toEqual([
      { id: "seat-a", patch: { turns_lost: 0 } },
    ]);
  });

  /**
   * A typo used to update a column called `undefined`, which PostgREST accepts
   * as an empty patch — so a bad correction returned ok and changed nothing.
   */
  it("refuses a stat it does not know", () => {
    expect(() =>
      adjustSeat(table(), {
        seatId: "seat-a",
        stat: "sila" as never,
        delta: 1,
        reason: null,
      }),
    ).toThrow(/Nie ma takiej wartości/);
  });

  it("refuses a seat it does not know", () => {
    expect(() =>
      adjustSeat(table(), { seatId: "nobody", stat: "zloto", delta: 1, reason: null }),
    ).toThrow(/Nieznane miejsce/);
  });
});

describe("correcting somebody down to nothing", () => {
  it("kills them, exactly as losing the last point in a fight does (4.4)", () => {
    const { writes } = correct({ zycie: 2 }, "zycie", -2);
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "korekta",
      "smierc",
      "koniec-tury",
    ]);
    expect(writes.seats).toContainEqual({ id: "seat-a", patch: { eliminated: true } });
  });

  it("does not kill somebody already out", () => {
    const { writes } = correct({ zycie: 0, eliminated: true }, "zycie", -1);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["korekta"]);
  });

  it("does not kill anybody on the way down to a number above zero", () => {
    const { writes } = correct({ zycie: 4 }, "zycie", -1);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["korekta"]);
  });
});
