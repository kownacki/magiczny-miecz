import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OBSZAR_WIDTH, SHELF_WIDTH } from "./cardImages";

/**
 * The drawer's width is one measurement and it is written down twice.
 *
 * `SHELF_WIDTH` is the source — it carries the arithmetic and the reason the
 * scrollbar's term cannot itself be a measurement — but three of the four
 * places that need it are Tailwind classes, which take a literal. So it also
 * lives in `globals.css` as `--shelf-w`, and the two agreeing is what makes the
 * board column's floor the same size as the drawer laid over it.
 *
 * A floor that has drifted from the thing standing on it is worse than no
 * floor: the drawer spills across the column holding the Postać, and it does so
 * only below a particular window width, which is the kind of thing nobody sees
 * until somebody plays on a laptop.
 */
const declared = (name: string): number | null => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const found = new RegExp(`--${name}:\\s*(\\d+)px`).exec(css);
  return found ? Number(found[1]) : null;
};

describe("the drawer widths", () => {
  it("declares --shelf-w as SHELF_WIDTH", () => {
    expect(declared("shelf-w"), "globals.css should declare --shelf-w").not.toBeNull();
    expect(declared("shelf-w")).toBe(SHELF_WIDTH);
  });

  /**
   * The Obszar is the narrow one, and it is written down twice for the same
   * reason: the class that applies it takes a literal.
   */
  it("declares --obszar-w as OBSZAR_WIDTH", () => {
    expect(declared("obszar-w"), "globals.css should declare --obszar-w").not.toBeNull();
    expect(declared("obszar-w")).toBe(OBSZAR_WIDTH);
  });

  /**
   * And the floor really is a floor. The board column is held at `--shelf-w`
   * so no drawer laid over it can eat the column holding your Postać — which
   * only works while every drawer is that wide *or narrower*.
   */
  it("keeps every drawer inside the board column's floor", () => {
    expect(OBSZAR_WIDTH).toBeLessThanOrEqual(SHELF_WIDTH);
  });
});
