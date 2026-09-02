import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHELF_WIDTH } from "./cardImages";

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
describe("--shelf-w", () => {
  it("matches SHELF_WIDTH", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const declared = /--shelf-w:\s*(\d+)px/.exec(css);
    expect(declared, "globals.css should declare --shelf-w").not.toBeNull();
    expect(Number(declared![1])).toBe(SHELF_WIDTH);
  });
});
