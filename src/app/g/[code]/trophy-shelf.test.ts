import { describe, expect, it } from "vitest";
import { shelfFor } from "./trophy-shelf";

/**
 * The shelf, which is `trophy_beaten` minus the hand.
 *
 * The engine writes the shelf on every win in both modes and never shrinks it;
 * the holdings are what is still in hand. Everything below is one of the three
 * ways docs/TROFEA.md says this subtraction can be got wrong.
 */
describe("who is still in hand", () => {
  const names = (shelf: ReturnType<typeof shelfFor>) =>
    shelf.map((one) => `${one.cardId}${one.gone ? "*" : ""}`);

  /** Newest first: the shelf grows at one end and that end is what you read. */
  it("keeps everyone still held, latest first", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], ["cyklop", "nobbin"]))).toEqual([
      "nobbin",
      "cyklop",
    ]);
  });

  it("marks the ones whose Karty have left", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], ["nobbin"]))).toEqual(["nobbin", "cyklop*"]);
  });

  /**
   * The multiset, which is the whole reason this is not a `filter`/`includes`:
   * two Nobbiny beaten and one handed in leaves one of each, not two held.
   */
  it("spends one entry per holding, not one per name", () => {
    expect(names(shelfFor(["nobbin", "nobbin"], ["nobbin"]))).toEqual([
      "nobbin",
      "nobbin*",
    ]);
  });

  it("calls none of three gone when all three are held", () => {
    const shelf = shelfFor(["nobbin", "nobbin", "nobbin"], ["nobbin", "nobbin", "nobbin"]);
    expect(shelf.filter((one) => one.gone)).toEqual([]);
  });

  /**
   * The whole arrangement in one case: spent pushed to the end, and both halves
   * running latest to oldest so they read the same direction.
   */
  it("puts the spent last, each half latest first", () => {
    expect(names(shelfFor(["a", "b", "c", "d"], ["b", "d"]))).toEqual([
      "d",
      "b",
      "c*",
      "a*",
    ]);
  });

  /**
   * A table whose fights were won before the shelf was written in this mode.
   * The Karta is in the Plecak and on nobody's list, and dropping it would
   * empty a row the player can see.
   */
  it("keeps a holding that never reached the shelf, as the oldest thing there", () => {
    expect(names(shelfFor([], ["cyklop"]))).toEqual(["cyklop"]);
    // NOBBIN has a date and CYKLOP predates the shelf, so CYKLOP sorts behind.
    expect(names(shelfFor(["nobbin"], ["nobbin", "cyklop"]))).toEqual(["nobbin", "cyklop"]);
  });

  /**
   * The same answer in both variants, which is the point of there being one.
   *
   * This used to assert the opposite — „Punkty" held no trophies, so the
   * subtraction was refused there and the whole shelf came back whole. That was
   * a wrong reading of the variant: it hoards like the printed rule and differs
   * only in having sent the Karty back at the kill. A seat that has beaten two
   * and holds neither has spent both, whichever mode the table is playing.
   */
  it("calls them all gone when a seat holds none of them", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], []))).toEqual(["nobbin*", "cyklop*"]);
  });

  it("is empty for somebody who has beaten nobody", () => {
    expect(shelfFor([], [])).toEqual([]);
  });
});
