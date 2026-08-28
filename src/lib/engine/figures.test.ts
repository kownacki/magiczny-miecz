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

  it("puts the bazowe figure in parentheses when something is always on", () => {
    expect(figuresText(6, 8, 8)).toBe("8 (6)");
  });

  /** No parentheses: nothing has been added, so bazowe is the parametr. */
  it("marks the fight figure when only a weapon lifts it", () => {
    expect(figuresText(6, 6, 9)).toBe("6, 9⚔");
  });

  /** 1.5's Troll, which is the example the whole thing is read off. */
  it("says all three when all three differ", () => {
    expect(figuresText(6, 8, 11)).toBe("8, 11⚔ (6)");
  });

  /**
   * The Rycerz replaces the fight figure rather than adding to it, so it can
   * be the lowest of the three. Nothing here may assume they descend.
   */
  it("does not assume the numbers go up", () => {
    expect(figuresText(5, 5, 3)).toBe("5, 3⚔");
    expect(figuresText(5, 6, 3)).toBe("6, 3⚔ (5)");
  });

  /** The comma only between the two bare numbers; the parenthesis separates itself. */
  it("separates only where two numbers would touch", () => {
    expect(figuresText(6, 8, 8)).not.toContain(",");
    expect(figuresText(6, 8, 11)).toContain("8, 11");
  });

  it("hands the parts back for a surface that draws rather than prints", () => {
    expect(figuresOf(6, 8, 11)).toEqual({ parametr: 8, walka: 11, own: 6, bare: false });
    expect(figuresOf(6, 6, 9)).toEqual({ parametr: 6, walka: 9, own: null, bare: false });
    expect(figuresOf(6, 8, 8)).toEqual({ parametr: 8, walka: null, own: 6, bare: false });
  });
});
