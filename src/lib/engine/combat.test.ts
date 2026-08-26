import { describe, expect, it } from "vitest";
import { attackAsOne, combinedEnemyTotal, compareCombat } from "./combat";

describe("several creatures as one opponent (17.5)", () => {
  it("sums the Miecze of creatures that fight the same way", () => {
    expect(attackAsOne([
      { kind: "ordinary", total: 3 },
      { kind: "ordinary", total: 4 },
    ])).toEqual({ kind: "ordinary", total: 7 });
  });

  /** 17.4 and 18.2 read different numbers off the character, so these are two fights. */
  it("refuses to put an ordinary and a magical Wróg in one fight", () => {
    expect(attackAsOne([
      { kind: "ordinary", total: 3 },
      { kind: "magical", total: 4 },
    ])).toBeNull();
  });

  it("is nothing at all for nobody", () => {
    expect(attackAsOne([])).toBeNull();
  });

  it("is the creature itself when there is only one", () => {
    expect(attackAsOne([{ kind: "magical", total: 5 }])).toEqual({
      kind: "magical",
      total: 5,
    });
  });

  it("agrees with the sum the fight is actually rolled against", () => {
    const foes = [
      { kind: "ordinary" as const, total: 2 },
      { kind: "ordinary" as const, total: 6 },
    ];
    expect(attackAsOne(foes)?.total).toBe(combinedEnemyTotal(foes));
  });
});

describe("comparing a fight (17.4)", () => {
  it("is the higher of total plus die", () => {
    expect(
      compareCombat(
        { label: "Postać", total: 4, roll: 5 },
        { label: "Wróg", total: 6, roll: 2 },
        "ordinary",
      ),
    ).toMatchObject({ outcome: "wygrana", winner: "Postać", loser: "Wróg" });
  });

  it("is a draw when they land on the same number", () => {
    expect(
      compareCombat(
        { label: "Postać", total: 4, roll: 4 },
        { label: "Wróg", total: 6, roll: 2 },
        "ordinary",
      ),
    ).toMatchObject({ outcome: "remis" });
  });
});
