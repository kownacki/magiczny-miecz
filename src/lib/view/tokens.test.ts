import { describe as suite, expect, it } from "vitest";
import {
  COLUMNS_MAX,
  DENOMINATIONS,
  clampCoins,
  coinOverlap,
  pileColumns,
  stackOverlap,
  tokensFor,
} from "./tokens";

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

  /**
   * A pile with nowhere it has to end.
   *
   * The rail beside a Karta Postaci is a fixed strip and stops at three columns
   * with the last coin standing down to say so. Gold lying on an Obszar is
   * inside a panel that scrolls, and there the mark is worse than the columns
   * it saves: it reads "more than thirty" where the coins themselves would have
   * said a hundred and four. So no ceiling is a real answer this has to give.
   */
  it("draws every item when there is no ceiling", () => {
    expect(pileColumns(104, 5, Infinity)).toEqual({ columns: 21, drawn: 104, cut: false });
    expect(pileColumns(1, 5, Infinity)).toEqual({ columns: 1, drawn: 1, cut: false });
    expect(pileColumns(0, 5, Infinity)).toEqual({ columns: 0, drawn: 0, cut: false });
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

suite("how far the coins in a stack overlap", () => {
  /** The rail's gold beside a Karta Postaci, and an Obszar's. */
  const rail = () => coinOverlap(16);
  const obszar = () => coinOverlap(39);

  it("shows half of every coin, whatever size it is drawn at", () => {
    expect(rail()).toBe(8);
    expect(obszar()).toBe(20);
  });

  /**
   * The figure is the rail's own, so nothing about the Karta Postaci moved when
   * the rule stopped being "fit the box" and became "half a coin".
   *
   * `(91 - 16) / 9` floors to 8, which is exactly half of 16. That coincidence
   * is what made half the right proportion to take everywhere else.
   */
  it("leaves the rail drawn exactly as it was", () => {
    expect(Math.floor((91 - 16) / 9)).toBe(rail());
  });

  /**
   * The room the rail has, kept as an assertion rather than as the formula.
   *
   * A stack a pixel too tall pushes what is under it, and on the rail that is
   * the numeral the pile is read by. Fitting to the box guaranteed this and
   * cost the picture — the overlap became a function of how many coins there
   * happened to be, so 39px coins five deep showed nine pixels each. So the
   * proportion draws the pile and this holds it to the room.
   */
  it("keeps a full stack of ten inside the half-card it stands in", () => {
    expect(16 + 9 * rail()).toBeLessThanOrEqual(91);
  });

  it("never closes a stack up into a single coin", () => {
    // Rounded to at least one: a stack of ten drawn as one coin is a picture
    // that lies about the count beside it.
    expect(coinOverlap(1)).toBe(1);
    expect(coinOverlap(0)).toBe(1);
  });
});

suite("fitting a stack to a shape it has been given", () => {
  /** Gold on an Obszar: fifteen coins as three columns of five, one Karta tile. */
  const obszar = () => stackOverlap(75, 23, 5);

  it("makes a full stack exactly as tall as the box", () => {
    expect(23 + 4 * obszar()).toBe(75);
  });

  /**
   * The check that keeps this from being the mistake it was when it stood
   * alone: a fitted stack must be no tighter than a proportional one.
   *
   * Dividing the room by the coins makes the overlap a function of how many
   * there are, which is how 39px coins five deep came to show nine pixels each
   * and draw as ruled lines. At 23 in 75 it answers 13 where half is 12 — the
   * looser of the two — so the tile is a shape being filled rather than a
   * clamp being applied.
   */
  it("is no tighter than half the coin, or the box is too small for the pile", () => {
    expect(obszar()).toBeGreaterThanOrEqual(coinOverlap(23));
  });

  it("gives a stack of one the whole token, since nothing sits under it", () => {
    expect(stackOverlap(75, 23, 1)).toBe(23);
  });

  it("keeps a sliver showing even where there is no room for one", () => {
    expect(stackOverlap(10, 23, 5)).toBe(1);
  });
});

suite("what may be typed into the take-gold field (12.1)", () => {
  it("takes a plain number through unchanged", () => {
    expect(clampCoins("3", 6)).toBe("3");
    expect(clampCoins("6", 6)).toBe("6");
  });

  /** Asking for more than is there plainly means all of it. */
  it("clamps down to what is lying there", () => {
    expect(clampCoins("99", 6)).toBe("6");
    expect(clampCoins("7", 6)).toBe("6");
  });

  /** One is the smallest take there is; nothing below it means anything. */
  it("clamps up from zero and from below it", () => {
    expect(clampCoins("0", 6)).toBe("1");
    expect(clampCoins("-4", 6)).toBe("1");
  });

  it("floors a fraction, there being no half coins", () => {
    expect(clampCoins("2.7", 6)).toBe("2");
    expect(clampCoins("0.5", 6)).toBe("1");
    expect(clampCoins("9.9", 6)).toBe("6");
  });

  /**
   * Empty stays empty, or the field could not be cleared to type into: a
   * control that types "1" back at you the moment you backspace is a control
   * you cannot correct.
   */
  it("lets the field be emptied", () => {
    expect(clampCoins("", 6)).toBe("");
    expect(clampCoins("   ", 6)).toBe("");
  });

  it("answers empty to anything that is not a number", () => {
    // "-" and "e" are both half-typed numbers a number input will hand over.
    for (const said of ["abc", "-", "e", "--2", "1e", "NaN"]) {
      expect(clampCoins(said, 6), said).toBe("");
    }
  });

  /**
   * A pile that is not there cannot be taken from, and the control is not shown
   * — but a clamp that answered "0" would put a number in the box that no take
   * accepts, and the server refuses anything below one.
   */
  it("never answers a number the command would refuse", () => {
    for (const lying of [0, 1, 6, 104]) {
      for (const said of ["-9", "0", "1", "5", "1000", "2.5"]) {
        const out = clampCoins(said, lying);
        if (out === "") continue;
        expect(Number(out), `${said} of ${lying}`).toBeGreaterThanOrEqual(1);
        expect(Number(out), `${said} of ${lying}`).toBeLessThanOrEqual(Math.max(1, lying));
        expect(Number.isInteger(Number(out)), `${said} of ${lying}`).toBe(true);
      }
    }
  });
});
