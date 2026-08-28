import { describe, expect, it } from "vitest";
import { figuresOf, figuresText } from "./figures";

/**
 * The notation, in the four shapes it has and the fifth that breaks the
 * obvious assumption about it.
 */
describe("saying all three figures", () => {
  it("says one number when nothing lends anything", () => {
    expect(figuresText(6, 6, 6)).toBe("6");
    expect(figuresOf(6, 6, 6).bare).toBe(true);
  });

  it("adds the parametr when something is always on", () => {
    expect(figuresText(6, 8, 8)).toBe("8 (6)");
  });

  it("marks the fight figure when only a weapon lifts it", () => {
    expect(figuresText(6, 6, 9)).toBe("9⚔ (6)");
  });

  /** 1.5's Troll, which is the example the whole thing is read off. */
  it("says all three when all three differ", () => {
    expect(figuresText(6, 8, 11)).toBe("11⚔ 8 (6)");
  });

  /**
   * The Rycerz replaces the fight figure rather than adding to it, so it can
   * be the lowest of the three. Nothing here may assume they descend.
   */
  it("does not assume the numbers go down", () => {
    expect(figuresText(5, 5, 3)).toBe("3⚔ (5)");
    expect(figuresText(5, 6, 3)).toBe("3⚔ 6 (5)");
  });

  it("hands the parts back for a surface that draws rather than prints", () => {
    expect(figuresOf(6, 8, 11)).toEqual({ own: 6, parametr: 8, walka: 11, bare: false });
    expect(figuresOf(6, 6, 9)).toEqual({ own: 6, parametr: null, walka: 9, bare: false });
    expect(figuresOf(6, 8, 8)).toEqual({ own: 6, parametr: 8, walka: null, bare: false });
  });
});
