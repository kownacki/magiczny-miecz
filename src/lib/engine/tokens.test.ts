import { describe as suite, expect, it } from "vitest";
import { DENOMINATIONS, tokensFor } from "./tokens";

suite("making change in żetony", () => {
  it("uses one token where one will do", () => {
    expect(tokensFor(1)).toEqual([1]);
    expect(tokensFor(3)).toEqual([3]);
    expect(tokensFor(4)).toEqual([4]);
  });

  it("makes bigger numbers out of fours and a remainder", () => {
    expect(tokensFor(5)).toEqual([4, 1]);
    expect(tokensFor(6)).toEqual([4, 2]);
    expect(tokensFor(7)).toEqual([4, 3]);
    expect(tokensFor(8)).toEqual([4, 4]);
    expect(tokensFor(11)).toEqual([4, 4, 3]);
  });

  it("shows nothing for nothing — a dead character has no tokens left", () => {
    expect(tokensFor(0)).toEqual([]);
  });

  it("never invents a token the box does not print", () => {
    for (let points = 0; points <= 40; points++) {
      for (const token of tokensFor(points)) {
        expect(DENOMINATIONS).toContain(token);
      }
    }
  });

  it("always adds up to what it was given", () => {
    for (let points = 0; points <= 40; points++) {
      const sum = tokensFor(points).reduce((total, token) => total + token, 0);
      expect(sum).toBe(points);
    }
  });

  it("uses as few tokens as the box allows", () => {
    // Greedy is optimal for this set, and this is the check on that claim: no
    // arrangement of 1, 2, 3 and 4 beats taking the largest first.
    for (let points = 0; points <= 40; points++) {
      expect(tokensFor(points).length).toBe(Math.ceil(points / 4));
    }
  });

  it("refuses to be confused by a number that is not one", () => {
    expect(tokensFor(-3)).toEqual([]);
    expect(tokensFor(2.7)).toEqual([2]);
  });
});
