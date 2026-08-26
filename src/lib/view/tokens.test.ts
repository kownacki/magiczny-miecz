import { describe as suite, expect, it } from "vitest";
import { DENOMINATIONS, tokensFor } from "./tokens";

suite("making change in żetony", () => {
  it("is all ones while ones fit a column", () => {
    // Five to a column, so five points is five tokens. A single żeton with a
    // 3 printed on it is a number in disguise; three ones are a little pile.
    expect(tokensFor(1)).toEqual([1]);
    expect(tokensFor(3)).toEqual([1, 1, 1]);
    expect(tokensFor(5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("tops the ones up rather than adding a sixth token", () => {
    expect(tokensFor(6)).toEqual([2, 1, 1, 1, 1]);
    expect(tokensFor(7)).toEqual([3, 1, 1, 1, 1]);
    expect(tokensFor(8)).toEqual([4, 1, 1, 1, 1]);
    expect(tokensFor(9)).toEqual([4, 2, 1, 1, 1]);
  });

  it("stays one column deep for as long as a column can hold it", () => {
    for (let points = 1; points <= 20; points++) {
      expect(tokensFor(points).length, `${points}`).toBeLessThanOrEqual(5);
    }
    expect(tokensFor(20)).toEqual([4, 4, 4, 4, 4]);
  });

  it("goes back to the fewest tokens once no column can hold it", () => {
    // Past twenty the point of the exercise is gone, and the fewest tokens is
    // what somebody that rich actually has in front of them.
    expect(tokensFor(21)).toEqual([4, 4, 4, 4, 4, 1]);
    for (let points = 21; points <= 60; points++) {
      expect(tokensFor(points).length, `${points}`).toBe(Math.ceil(points / 4));
    }
  });

  it("shows nothing for nothing — a dead character has no tokens left", () => {
    expect(tokensFor(0)).toEqual([]);
  });

  it("never invents a token the box does not print", () => {
    // There is no 5 and no 10 in the box: 1, 2, 3 and 4, ten of each.
    for (let points = 0; points <= 60; points++) {
      for (const token of tokensFor(points)) {
        expect(DENOMINATIONS).toContain(token);
      }
    }
  });

  it("always adds up to what it was given", () => {
    for (let points = 0; points <= 60; points++) {
      const sum = tokensFor(points).reduce((total, token) => total + token, 0);
      expect(sum, `${points}`).toBe(points);
    }
  });

  it("puts the biggest first, so a pile reads down from its top", () => {
    for (let points = 0; points <= 60; points++) {
      const tokens = tokensFor(points);
      expect([...tokens].sort((a, b) => b - a), `${points}`).toEqual(tokens);
    }
  });

  it("refuses to be confused by a number that is not one", () => {
    expect(tokensFor(-3)).toEqual([]);
    expect(tokensFor(2.7)).toEqual([1, 1]);
  });
});
