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
    const { writes } = correct({ gold: 3 }, "gold", 2);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 5 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "override",
      manual: true,
      payload: { stat: "gold", delta: 2, from: 3, to: 5, reason: "test" },
    });
  });

  it("lets a card file it as the card's own doing instead", () => {
    const { writes } = adjustSeat(table({ gold: 1 }), {
      seatId: "seat-a",
      stat: "gold",
      delta: 1,
      reason: null,
      record: { kind: "points", manual: false },
    });
    expect(writes.journal?.[0]).toMatchObject({ kind: "points", manual: false });
  });

  /** 1.3 and 2.3: own points never fall below what the character started with. */
  it("will not push Miecz below its floor", () => {
    const { writes } = correct({ sword_own: 3, sword_floor: 2 }, "sword", -5);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { sword_own: 2 } }]);
  });

  it("will not push Magia below its floor", () => {
    const { writes } = correct({ magic_own: 4, magic_floor: 1 }, "magic", -10);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { magic_own: 1 } }]);
  });

  it("floors Życie and Złoto at zero, which have no starting value to keep", () => {
    expect(correct({ gold: 2 }, "gold", -9).writes.seats).toEqual([
      { id: "seat-a", patch: { gold: 0 } },
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
      adjustSeat(table(), { seatId: "nobody", stat: "gold", delta: 1, reason: null }),
    ).toThrow(/Nieznane miejsce/);
  });
});

describe("correcting somebody down to nothing", () => {
  it("kills them, exactly as losing the last point in a fight does (4.4)", () => {
    const { writes } = correct({ life: 2 }, "life", -2);
    expect(writes.journal?.map((line) => line.kind)).toEqual([
      "override",
      "death",
      "turn-end",
    ]);
    expect(writes.seats).toContainEqual({
      id: "seat-a",
      // 1.4: the score goes with the Karty, and so does the shelf that
      // remembers who paid for it. See docs/TROFEA.md.
      patch: { eliminated: true, trophy_points: 0, trophy_beaten: [] },
    });
  });

  it("does not kill somebody already out", () => {
    const { writes } = correct({ life: 0, eliminated: true }, "life", -1);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["override"]);
  });

  it("does not kill anybody on the way down to a number above zero", () => {
    const { writes } = correct({ life: 4 }, "life", -1);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["override"]);
  });
});

/* ---------------------------------------------------------------------------
 * The floor, the ceiling, and the one way past the floor.
 * ------------------------------------------------------------------------ */

describe("what a change is allowed to reach", () => {
  const floored = () => table({ magic_own: 3, magic_floor: 3, sword_own: 5, sword_floor: 2 });

  it("reports what moved, which is not always what was asked for", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magic",
      delta: -1,
      reason: null,
    });
    // The number nothing was reading. Both surfaces that talk about a change —
    // the console's reply and the card's notice — used to say the delta, and so
    // reported a change the floor had swallowed as though it had happened.
    expect(result).toEqual({ moved: 0, to: 3, floor: 3 });
  });

  it("takes only as much as there is above the floor", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "sword",
      delta: -9,
      reason: null,
    });
    expect(result).toEqual({ moved: -3, to: 2, floor: 2 });
  });

  /**
   * `force` lifts 1.3 and 2.3, which is the whole of what test mode is for: a
   * character weaker than the one printed on its card is otherwise unreachable,
   * because the floor *is* the printed value and nothing in the box lowers it.
   */
  it("goes below the floor when forced, and says so in the journal", () => {
    const { writes, result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magic",
      delta: -2,
      reason: "tryb testowy",
      force: true,
    });
    expect(result).toEqual({ moved: -2, to: 1, floor: 3 });
    expect(writes.journal?.[0]).toMatchObject({ payload: { forced: true, from: 3, to: 1 } });
  });

  it("stops at nothing even when forced, because below zero is not weaker", () => {
    const { result } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "magic",
      delta: -50,
      reason: null,
      force: true,
    });
    expect(result).toEqual({ moved: -3, to: 0, floor: 3 });
  });

  it("leaves an ordinary change unmarked, so `forced` means something", () => {
    const { writes } = adjustSeat(floored(), {
      seatId: "seat-a",
      stat: "gold",
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
      const { result } = adjustSeat(table({ gold: 5 }), {
        seatId: "seat-a",
        stat: "gold",
        delta: 50_000,
        reason: null,
        force,
      });
      expect(result).toEqual({ moved: CEILING - 5, to: CEILING, floor: 0 });
    }
  });
});

/* ---------------------------------------------------------------------------
 * A number that is already below its floor.
 * ------------------------------------------------------------------------ */

/**
 * A bound stops movement in one direction; it does not move the value.
 *
 * "Magia nie spada poniżej 3" is a rule about going down, not a claim that the
 * number is at least 3 — and the two only come apart once something has put it
 * below, which only `force` can. Clamping to the range dragged it back up: at
 * 1, an ordinary +1 landed on 3, which is a floor behaving as a ceiling and
 * two points nobody asked for.
 */
describe("a parameter already below its floor", () => {
  const under = () => table({ magic_own: 1, magic_floor: 3 });
  const move = (delta: number, force = false) =>
    adjustSeat(under(), { seatId: "seat-a", stat: "magic", delta, reason: null, force }).result;

  it("climbs by exactly what was asked, without being hauled up to the floor", () => {
    expect(move(1)).toEqual({ moved: 1, to: 2, floor: 3 });
  });

  it("latches again the moment it arrives, and behaves as it always did", () => {
    expect(move(2)).toEqual({ moved: 2, to: 3, floor: 3 });
    const back = adjustSeat(table({ magic_own: 3, magic_floor: 3 }), {
      seatId: "seat-a",
      stat: "magic",
      delta: -1,
      reason: null,
    });
    expect(back.result).toEqual({ moved: 0, to: 3, floor: 3 });
  });

  it("may pass the floor on the way up in one go", () => {
    expect(move(5)).toEqual({ moved: 5, to: 6, floor: 3 });
  });

  it("will not sink further without being forced", () => {
    expect(move(-1)).toEqual({ moved: 0, to: 1, floor: 3 });
  });

  it("sinks when forced, and stops at nothing", () => {
    expect(move(-1, true)).toEqual({ moved: -1, to: 0, floor: 3 });
    expect(move(-9, true)).toEqual({ moved: -1, to: 0, floor: 3 });
  });
});
