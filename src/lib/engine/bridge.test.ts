import { describe, expect, it } from "vitest";
import {
  BRIDGE_GUARDIAN,
  BRIDGE_ORDEAL,
  BRIDGE_SIDE,
  cerberLoss,
  deathGameOutcome,
  guardianStrength,
  keptAfterFall,
  trapOutcome,
} from "./bridge";
import { FIELDS } from "./board";

describe("Pułapka i Magiczna Pułapka (14.5)", () => {
  it("misses when the dice do not beat the stat", () => {
    // 3+3+3 = 9, less a Miecz of 9, is nothing: the trap is avoided and the
    // character has not moved.
    expect(trapOutcome([3, 3, 3], 9, "miecz")).toEqual({ fell: false, result: 0 });
  });

  it("counts a stat bigger than the dice as a clean miss, not a negative", () => {
    // The printed table has no row below 0, and a character with a huge Miecz
    // has simply walked through.
    expect(trapOutcome([1, 1, 1], 20, "miecz")).toEqual({ fell: false, result: 0 });
  });

  it("drops you down the Miecz side by the printed table", () => {
    const at = (total: number) => trapOutcome([total, 0, 0], 0, "miecz");
    expect(at(1)).toMatchObject({ fell: true, fieldId: "wejscie-na-most-a" });
    expect(at(2)).toMatchObject({ fieldId: "ruiny-twierdzy" });
    expect(at(3)).toMatchObject({ fieldId: "ruiny-twierdzy" });
    expect(at(4)).toMatchObject({ fieldId: "twierdza-strzegaca-drog" });
    expect(at(5)).toMatchObject({ fieldId: "twierdza-strzegaca-drog" });
    expect(at(6)).toMatchObject({ fieldId: "osada" });
    expect(trapOutcome([6, 6, 6], 0, "miecz")).toMatchObject({ fieldId: "osada", result: 18 });
  });

  it("drops you down the Magia side by the printed table", () => {
    const at = (total: number) => trapOutcome([total, 0, 0], 0, "magia");
    expect(at(2)).toMatchObject({ fieldId: "wymarle-miasto" });
    expect(at(3)).toMatchObject({ fieldId: "wymarle-miasto" });
    expect(at(4)).toMatchObject({ fieldId: "swiatynia-bogini-nemed" });
    expect(at(5)).toMatchObject({ fieldId: "swiatynia-bogini-nemed" });
    expect(at(6)).toMatchObject({ fieldId: "karczma" });
  });

  it("puts a 1 on the Magia side at the entrance, mirroring the other trap", () => {
    // The printed Magiczna Pułapka table skips 1 entirely. This is the one
    // invented number on the bridge, and it is invented to match its mirror.
    expect(trapOutcome([1, 0, 0], 0, "magia")).toMatchObject({
      fell: true,
      fieldId: "wejscie-na-most-b",
    });
  });

  it("lands on fields the board actually has", () => {
    for (const side of ["miecz", "magia"] as const) {
      for (let total = 1; total <= 19; total++) {
        const outcome = trapOutcome([total, 0, 0], 0, side);
        if (outcome.fell) expect(FIELDS.has(outcome.fieldId)).toBe(true);
      }
    }
  });

  it("keeps only what rolls a 1 or a 2", () => {
    const carried = ["miecz", "tarcza", "kon", "latarnia"];
    expect(keptAfterFall(carried, [1, 2, 3, 6])).toEqual({
      kept: ["miecz", "tarcza"],
      lost: ["kon", "latarnia"],
    });
  });

  it("loses anything it has no die for", () => {
    // A missing roll is not a free pass: the caller must supply one per card.
    expect(keptAfterFall(["miecz", "tarcza"], [1])).toEqual({
      kept: ["miecz"],
      lost: ["tarcza"],
    });
  });
});

describe("Gra ze Śmiercią", () => {
  it("walks on when you beat Death", () => {
    expect(deathGameOutcome([6, 5], [3, 2])).toBe("dalej");
  });

  it("treats a draw as neither a win nor a loss", () => {
    // The same distinction 17.10 makes about combat: a draw costs nothing.
    expect(deathGameOutcome([4, 3], [3, 4])).toBe("znowu");
  });

  it("costs a life when Death wins", () => {
    expect(deathGameOutcome([1, 1], [6, 6])).toBe("strata");
  });
});

describe("Cerber", () => {
  it("takes one, two or three by the printed pairs", () => {
    expect([1, 2, 3, 4, 5, 6].map(cerberLoss)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("Demon Zagłady i Monstrum (14.6)", () => {
  it("takes its strength from two dice", () => {
    expect(guardianStrength([1, 1])).toBe(2);
    expect(guardianStrength([6, 6])).toBe(12);
  });

  it("fights the Demon with Magia and the Monstrum with Miecz", () => {
    expect(BRIDGE_GUARDIAN["demon-zaglady"].kind).toBe("magiczna");
    expect(BRIDGE_GUARDIAN["monstrum"].kind).toBe("zwykla");
  });
});

describe("the bridge itself", () => {
  it("puts every field on a side, and only fields the board has", () => {
    for (const [fieldId, side] of Object.entries(BRIDGE_SIDE)) {
      expect(FIELDS.get(fieldId)?.region).toBe("most");
      expect(["miecz", "magia"]).toContain(side);
    }
  });

  it("knows which fields stop a character", () => {
    // The Zamek is not among them: it is not an ordeal to be got past but the
    // end of the game (14.7).
    expect(BRIDGE_ORDEAL.has("zamek-bestii")).toBe(false);
    expect([...BRIDGE_ORDEAL].every((id) => FIELDS.get(id)?.region === "most")).toBe(true);
    expect(BRIDGE_ORDEAL.size).toBe(6);
  });
});
