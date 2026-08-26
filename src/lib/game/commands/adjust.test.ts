import { describe, expect, it } from "vitest";
import { aSeat, aTable } from "../fixture";
import { CEILING, adjustSeat } from "./adjust";

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

/* ---------------------------------------------------------------------------
 * The floor, the ceiling, and the one way past the floor.
 * ------------------------------------------------------------------------ */

describe("what a change is allowed to reach", () => {
  const floored = () => table({ magia_own: 3, magia_floor: 3, miecz_own: 5, miecz_floor: 2 });

  it("reports what moved, which is not always what was asked for", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magia",
      delta: -1,
      reason: null,
    });
    // The number nothing was reading. Both surfaces that talk about a change —
    // the console's reply and the card's notice — used to say the delta, and so
    // reported a change the floor had swallowed as though it had happened.
    expect(result).toEqual({ moved: 0, to: 3 });
  });

  it("takes only as much as there is above the floor", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "miecz",
      delta: -9,
      reason: null,
    });
    expect(result).toEqual({ moved: -3, to: 2 });
  });

  /**
   * `force` lifts 1.3 and 2.3, which is the whole of what test mode is for: a
   * character weaker than the one printed on its card is otherwise unreachable,
   * because the floor *is* the printed value and nothing in the box lowers it.
   */
  it("goes below the floor when forced, and says so in the journal", () => {
    const { writes, result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magia",
      delta: -2,
      reason: "tryb testowy",
      force: true,
    });
    expect(result).toEqual({ moved: -2, to: 1 });
    expect(writes.journal?.[0]).toMatchObject({ payload: { forced: true, from: 3, to: 1 } });
  });

  it("stops at nothing even when forced, because below zero is not weaker", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magia",
      delta: -50,
      reason: null,
      force: true,
    });
    expect(result).toEqual({ moved: -3, to: 0 });
  });

  it("leaves an ordinary change unmarked, so `forced` means something", () => {
    const { writes } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "zloto",
      delta: 1,
      reason: null,
    });
    expect(writes.journal?.[0].payload).not.toHaveProperty("forced");
  });

  /**
   * Two orders of magnitude above anything in the box, so it can only ever
   * catch a typo — or a test reaching for a number to see what the interface
   * does with it. `force` lifts a rule; it does not lift arithmetic.
   */
  it("holds every number under the ceiling, forced or not", () => {
    for (const force of [false, true]) {
      const { result } = adjustSeat(table({ zloto: 5 }), {
        seatId: "seat-a",
        stat: "zloto",
        delta: 50_000,
        reason: null,
        force,
      });
      expect(result).toEqual({ moved: CEILING - 5, to: CEILING });
    }
  });
});
