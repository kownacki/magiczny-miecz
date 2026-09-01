import { describe, expect, it } from "vitest";
import { afterVisit, drawsFromPool, poolRemains, startingPool } from "./pools";

/** The three the box gives a pool, and one of each currency. */
const WELLS = ["drzewo-zycia", "jezioro-magiczne", "zaklete-zrodlo"];

describe("startingPool (16.7)", () => {
  it("lays out four points at each of the three wells", () => {
    for (const cardId of WELLS) expect(startingPool(cardId)).toBe(4);
  });

  it("lays out nothing at a Miejsce that simply stays", () => {
    // "Labirynt pozostanie tu do końca rozgrywki" — no points beside it.
    expect(startingPool("labirynt")).toBeNull();
    expect(startingPool("targowisko")).toBeNull();
  });

  it("lays out nothing for a card of any other class, or none at all", () => {
    expect(startingPool("wilk")).toBeNull();
    expect(startingPool("cudotworca")).toBeNull();
    expect(startingPool("nie-ma-takiej-karty")).toBeNull();
  });
});

describe("drawsFromPool", () => {
  it("is the three wells and nothing else", () => {
    for (const cardId of WELLS) expect(drawsFromPool(cardId)).toBe(true);
    expect(drawsFromPool("labirynt")).toBe(false);
    expect(drawsFromPool("miecz")).toBe(false);
  });
});

describe("afterVisit", () => {
  it("takes one point per visit and dries on the fourth", () => {
    expect(afterVisit("drzewo-zycia", 4)).toEqual({ left: 3, dry: false });
    expect(afterVisit("drzewo-zycia", 3)).toEqual({ left: 2, dry: false });
    expect(afterVisit("drzewo-zycia", 2)).toEqual({ left: 1, dry: false });
    // "Po wykorzystaniu 4 punktów, Drzewo usycha" — on this visit, not the next.
    expect(afterVisit("drzewo-zycia", 1)).toEqual({ left: 0, dry: true });
  });

  /**
   * A row written before the column existed reads as full.
   *
   * The two ways to read a null are "nobody has drunk yet" and "there is
   * nothing left", and only the first cannot take something away from a player
   * because of a migration.
   */
  it("reads a missing pool as a full one", () => {
    expect(afterVisit("jezioro-magiczne", null)).toEqual({ left: 3, dry: false });
  });

  it("clamps rather than going below empty", () => {
    expect(afterVisit("zaklete-zrodlo", 0)).toEqual({ left: 0, dry: true });
  });

  it("answers null for a card that has no pool to draw from", () => {
    expect(afterVisit("labirynt", null)).toBeNull();
    expect(afterVisit("wilk", 3)).toBeNull();
  });
});

describe("poolRemains", () => {
  it("is true while the well has points and false when it does not", () => {
    expect(poolRemains("drzewo-zycia", 1)).toBe(true);
    expect(poolRemains("drzewo-zycia", 0)).toBe(false);
    expect(poolRemains("drzewo-zycia", null)).toBe(true);
  });

  it("is true for anything with no pool, which is every other card", () => {
    expect(poolRemains("labirynt", null)).toBe(true);
    expect(poolRemains("wilk", 0)).toBe(true);
  });
});

/* ==========================================================================
 * The round trip, which is the whole reason the count is on the turn card.
 * ======================================================================= */

describe("a well surviving a visit (16.7)", () => {
  /**
   * Every Karta on an Obszar is lifted off it when somebody stops there
   * (`liftFieldCards`) and written back at the end of the turn
   * (`leaveCardsBehind`). So a Drzewo Życia is off the board for the length of
   * a turn, and a count kept only in `field_cards` would be four again every
   * time anybody walked past.
   *
   * This walks the arithmetic the two of them carry between them, which is the
   * part `afterVisit` owns.
   */
  it("runs down one visitor at a time and dries on the fourth", () => {
    let pool: number | null = startingPool("drzewo-zycia");
    const drinks: number[] = [];
    let dry = false;
    for (let visitor = 0; visitor < 4; visitor += 1) {
      const left = afterVisit("drzewo-zycia", pool)!;
      drinks.push(left.left);
      pool = left.left;
      dry = left.dry;
    }
    expect(drinks).toEqual([3, 2, 1, 0]);
    expect(dry).toBe(true);
  });

  /** A visitor who declines takes nothing: the caller never asks. */
  it("is untouched by somebody who walks past without drinking", () => {
    const pool = startingPool("zaklete-zrodlo");
    expect(pool).toBe(4);
    expect(poolRemains("zaklete-zrodlo", pool)).toBe(true);
  });
});
