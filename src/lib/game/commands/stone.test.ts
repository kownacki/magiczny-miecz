import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aSeat, aTable } from "../fixture";
import { isStone, refuseAgainstStone, turnToStone, STONE_TURNS } from "./stone";
import { spendLife } from "./life";
import { attackSeat } from "./fight";

/**
 * 20.3 and 20.5, which are two rows of the coverage table and one idea:
 * **stone is not a legal target.**
 *
 * "Postaci Zamienionej w Kamień nie można odebrać punktu Życia. Na taką Postać
 * nie można rzucać Zaklęć." (20.5) And 20.3's "nie może ich używać" of Miecz
 * and Magia is the same rule seen from inside — the only moment a statue would
 * use either is defending an attack, which is one of the things forbidden.
 */
const table = (over: { stoneUntil?: number | null; turn?: number } = {}) =>
  aTable({
    game: { turn: over.turn ?? 1, active_seat: 0, turn_state: { phase: "field" } },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: "mokradla-1" }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        field_id: "mokradla-1",
        life: 4,
        stone_until_turn: over.stoneUntil === undefined ? 4 : over.stoneUntil,
      }),
    ],
  });

describe("a Postać Zamieniona w Kamień", () => {
  it("is stone until the turn it becomes flesh again (20.1)", () => {
    expect(isStone(table({ stoneUntil: 4, turn: 1 }), "seat-b")).toBe(true);
    expect(isStone(table({ stoneUntil: 4, turn: 3 }), "seat-b")).toBe(true);
    // 20.1's three turns are up: `stone_until_turn` is the turn it ends.
    expect(isStone(table({ stoneUntil: 4, turn: 4 }), "seat-b")).toBe(false);
    expect(isStone(table({ stoneUntil: null }), "seat-b")).toBe(false);
  });

  /** The one door every loss comes through — a fight, a Karta, an Obszar. */
  it("cannot be made to lose a point of Życie (20.5)", () => {
    const at = table();
    const { writes, result } = spendLife(at, "seat-b", 1);
    expect(writes).toEqual({});
    expect(result).toBe(4);
    expect(apply(at, writes).seats.find((one) => one.id === "seat-b")?.life).toBe(4);
  });

  it("loses it again once it is flesh (20.1)", () => {
    const at = table({ turn: 4 });
    expect(spendLife(at, "seat-b", 1).result).toBe(3);
  });

  /** Even a blow that would kill: it is not a lesser loss, it is no loss. */
  it("is not killed by a blow it cannot take", () => {
    const at = apply(table(), { seats: [{ id: "seat-b", patch: { life: 1 } }] });
    const { writes } = spendLife(at, "seat-b", 1);
    expect(writes).toEqual({});
    expect(apply(at, writes).seats.find((one) => one.id === "seat-b")?.eliminated).toBe(false);
  });

  it("cannot be attacked (17.6, 20.5)", () => {
    expect(() => attackSeat(table(), { targetSeatId: "seat-b" })).toThrow(/20\.5/);
  });

  it("can be attacked again once it is flesh", () => {
    expect(() => attackSeat(table({ turn: 4 }), { targetSeatId: "seat-b" })).not.toThrow();
  });

  it("cannot be cast at (20.5)", () => {
    expect(() => refuseAgainstStone(table(), "seat-b", "spell")).toThrow(/Zaklęć/);
    expect(() => refuseAgainstStone(table({ turn: 4 }), "seat-b", "spell")).not.toThrow();
  });

  /** 20.5 is explicit that the Zaklęcia stay, unlike everything else (20.2). */
  it("keeps its Zaklęcia through the change", () => {
    const at = aTable({
      game: { turn: 1 },
      seats: [aSeat({ id: "seat-b", field_id: "mokradla-1" })],
      holdings: [
        { id: "s1", seat_id: "seat-b", card_id: "golem", kind: "spell", face: "hidden" },
      ] as never,
    });
    const after = apply(at, turnToStone(at, { seatId: "seat-b" }));
    expect(after.holdings.map((one) => one.kind)).toEqual(["spell"]);
    expect(after.seats[0].stone_until_turn).toBe(1 + STONE_TURNS);
  });
});
