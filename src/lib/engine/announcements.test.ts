import { describe, expect, it } from "vitest";
import { announce, type Watched } from "./announcements";

const calm: Watched = { turnsLost: 0, stoneUntilRound: null, eliminated: false };

describe("what a player is interrupted for", () => {
  it("says nothing when nothing has changed", () => {
    expect(announce(calm, calm)).toBeNull();
  });

  it("says nothing on the first reading", () => {
    // A device that has just opened the table has no "before" to compare with,
    // and announcing from a standing start would replay a death on every
    // reload.
    expect(announce(null, { ...calm, eliminated: true })).toBeNull();
  });

  it("announces a lost turn, and quotes the rule that ends it (16.1)", () => {
    const said = announce(calm, { ...calm, turnsLost: 1 });
    expect(said?.kind).toBe("turn-lost");
    expect(said?.body).toContain("16.1");
  });

  it("counts how many were lost at once", () => {
    expect(announce(calm, { ...calm, turnsLost: 2 })?.title).toBe("Tracisz 2 tury");
  });

  it("says nothing when a lost turn is spent rather than gained", () => {
    // finishTurn counts one down per pass; being skipped is not news twice.
    expect(announce({ ...calm, turnsLost: 2 }, { ...calm, turnsLost: 1 })).toBeNull();
  });

  it("announces Kamień, which from outside looks the same as being skipped", () => {
    const said = announce(calm, { ...calm, stoneUntilRound: 9 });
    expect(said?.kind).toBe("stone");
    expect(said?.body).toContain("20.5");
  });

  it("does not announce Kamień again while it lasts", () => {
    const stone = { ...calm, stoneUntilRound: 9 };
    expect(announce(stone, stone)).toBeNull();
  });

  it("puts death above everything else it could say", () => {
    // A dead character is not also losing a turn in any sense worth saying.
    const said = announce(calm, { turnsLost: 3, stoneUntilRound: 9, eliminated: true });
    expect(said?.kind).toBe("death");
  });

  it("does not announce a death twice", () => {
    const dead = { ...calm, eliminated: true };
    expect(announce(dead, dead)).toBeNull();
  });
});
