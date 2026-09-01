import { describe as suite, expect, it } from "vitest";
import { COLUMNS_MAX, DENOMINATIONS, pileColumns, stackOverlap, tokensFor } from "./tokens";

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

/**
 * A pile that has outgrown its rail.
 *
 * The same sum for two quite different pictures — a stack of coins that overlap
 * and are all alike, and a column of żetony that sit apart and whose four
 * denominations are half the reading — which is exactly why it was written
 * twice before it was written once. What it protects against is a rail filled
 * to the ceiling looking identical to a rail that merely happens to be full:
 * fifteen żetony of four read as sixty whether the seat has sixty or nine
 * hundred, and only the numeral underneath knew the difference.
 */
suite("dividing a pile into columns", () => {
  /** The gold's numbers: ten coins to a stack, three stacks. */
  const gold = (points: number) => pileColumns(points, 10);
  /** The żetony's: five to a column, the same three columns. */
  const zetony = (count: number) => pileColumns(count, 5);

  it("draws nothing for nothing", () => {
    // A character at zero Życie has had its last token taken off the table
    // (4.4), and the empty space where its żetony were is what the table shows.
    expect(zetony(0)).toEqual({ columns: 0, drawn: 0, cut: false });
  });

  it("opens a second column only once the first is full", () => {
    /**
     * Each column finished before the next is started, which is the whole point
     * of counting this way: four full stacks and a short one is forty-something
     * at a glance, where four stacks of eleven and a straggler is a heap that
     * happens to be in columns.
     */
    expect(zetony(5)).toMatchObject({ columns: 1 });
    expect(zetony(6)).toMatchObject({ columns: 2 });
    expect(gold(10)).toMatchObject({ columns: 1 });
    expect(gold(11)).toMatchObject({ columns: 2 });
  });

  it("draws every item while they fit", () => {
    expect(gold(30)).toEqual({ columns: 3, drawn: 30, cut: false });
    expect(zetony(15)).toEqual({ columns: 3, drawn: 15, cut: false });
  });

  it("gives up the last square the moment one item too many arrives", () => {
    // Thirty-one coins, and the thirty-first is what says the picture has
    // stopped counting.
    expect(gold(31)).toEqual({ columns: 3, drawn: 29, cut: true });
    expect(zetony(16)).toEqual({ columns: 3, drawn: 14, cut: true });
  });

  it("never draws more than the ceiling, however rich the seat", () => {
    expect(gold(900)).toEqual({ columns: 3, drawn: 29, cut: true });
  });

  it("leaves exactly one square for the mark", () => {
    // The rail renders `drawn` tokens plus the mark, and that has to come to
    // the same full rail either way — a cut pile visibly shorter than a full
    // one would read as poorer rather than as richer.
    for (const points of [31, 40, 100, 900]) {
      expect(gold(points).drawn + 1).toBe(COLUMNS_MAX * 10);
    }
  });

  it("counts a fraction of a point as nothing extra", () => {
    // Nothing in this game deals in halves, but the value arrives off a column
    // and a pile drawn from a fraction would be a pile nobody could explain.
    expect(gold(10.9)).toEqual(gold(10));
  });

  it("draws nothing for a number below zero", () => {
    // 1.3 and 2.3 forbid it and the server enforces it, so this is only about
    // never asking `Array.from` for a negative length.
    expect(zetony(-4)).toEqual({ columns: 0, drawn: 0, cut: false });
  });
});

suite("fitting a stack of coins into its box", () => {
  /** The rail's gold: ten 16px coins in the half-card they are given. */
  const rail = () => stackOverlap(91, 16, 10);
  /** An Obszar's gold: five 39px coins down one Karta tile's picture. */
  const obszar = () => stackOverlap(75, 39, 5);

  it("makes a full stack exactly as tall as the room it has", () => {
    // The top coin whole, the rest a sliver each. This is the promise the sum
    // exists to keep: ten coins are one rail, ten coins on an Obszar are one
    // Karta tile.
    expect(16 + 9 * rail()).toBeLessThanOrEqual(91);
    expect(39 + 4 * obszar()).toBe(75);
  });

  it("answers each caller in its own numbers", () => {
    expect(rail()).toBe(8);
    expect(obszar()).toBe(9);
  });

  it("never lets a stack outgrow its box by a pixel", () => {
    // Floored rather than rounded: a stack a pixel too tall pushes whatever is
    // under it, and on the rail that is the numeral the pile is read by.
    for (const height of [40, 41, 42, 43, 44]) {
      expect(16 + 9 * stackOverlap(height, 16, 10)).toBeLessThanOrEqual(height);
    }
  });

  it("keeps a sliver showing even in a box with no room for one", () => {
    // Coins at zero overlap are one coin, and a stack of ten drawn as one coin
    // is a picture that lies about the count beside it. A pile too big for its
    // box is `pileColumns`' problem, not this one.
    expect(stackOverlap(10, 16, 10)).toBe(1);
  });

  it("gives a stack of one the whole token, since nothing sits under it", () => {
    expect(stackOverlap(75, 39, 1)).toBe(39);
  });
});
