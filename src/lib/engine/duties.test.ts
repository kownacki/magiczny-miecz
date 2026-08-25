import { describe, expect, it } from "vitest";
import { dutiesBeforeEnding, mayEndTurn, whyCannotEnd } from "./duties";

describe("duties before ending a turn", () => {
  it("owes the Bestia fight while standing in the Zamek", () => {
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(duties.map((duty) => duty.kind)).toEqual(["bestia"]);
    expect(mayEndTurn({ fieldId: "zamek-bestii", done: [] })).toBe(false);
  });

  it("owes nothing once the fight has happened", () => {
    // Compulsory, not repeatable: 14.7 is satisfied by fighting, whatever the
    // result. A loss costs two Życia and puts the character off the Most, and
    // that still counts as having fought.
    expect(mayEndTurn({ fieldId: "zamek-bestii", done: ["bestia"] })).toBe(true);
  });

  it("owes nothing anywhere else on the Most", () => {
    for (const field of ["cerber", "monstrum", "demon-zaglady", "pulapka"] as const) {
      expect(mayEndTurn({ fieldId: field, done: [] })).toBe(true);
    }
  });

  it("owes nothing on an ordinary field, or before a move", () => {
    expect(mayEndTurn({ fieldId: "karczma", done: [] })).toBe(true);
    expect(mayEndTurn({ fieldId: null, done: [] })).toBe(true);
  });

  it("does not fire the moment the figure lands", () => {
    // The whole point: the duty blocks the END of the turn, so a player is free
    // to put a Tarcza on and rearrange what they carry first. Nothing here
    // demands the fight happen before anything else.
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(duties).toHaveLength(1);
    expect(duties[0].label).toContain("Bestią");
  });
});

describe("saying why", () => {
  it("names what is owed and the rule that owes it", () => {
    const duties = dutiesBeforeEnding({ fieldId: "zamek-bestii", done: [] });
    expect(whyCannotEnd(duties)).toBe("Najpierw: Stocz walkę z Bestią (14.7).");
  });

  it("says nothing when nothing is owed", () => {
    expect(whyCannotEnd([])).toBeNull();
  });
});
