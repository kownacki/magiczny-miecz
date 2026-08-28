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

  it("keeps everyone still held", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], ["cyklop", "nobbin"], false))).toEqual([
      "cyklop",
      "nobbin",
    ]);
  });

  it("marks the ones whose Karty have left", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], ["nobbin"], false))).toEqual([
      "nobbin",
      "cyklop*",
    ]);
  });

  /**
   * The multiset, which is the whole reason this is not a `filter`/`includes`:
   * two Nobbiny beaten and one handed in leaves one of each, not two held.
   */
  it("spends one entry per holding, not one per name", () => {
    expect(names(shelfFor(["nobbin", "nobbin"], ["nobbin"], false))).toEqual([
      "nobbin",
      "nobbin*",
    ]);
  });

  it("calls none of three gone when all three are held", () => {
    const shelf = shelfFor(["nobbin", "nobbin", "nobbin"], ["nobbin", "nobbin", "nobbin"], false);
    expect(shelf.filter((one) => one.gone)).toEqual([]);
  });

  /** Sorted last, whatever order they were beaten in. */
  it("puts the departed after the living, each half in its own order", () => {
    expect(names(shelfFor(["a", "b", "c", "d"], ["b", "d"], false))).toEqual([
      "b",
      "d",
      "a*",
      "c*",
    ]);
  });

  /**
   * A table whose fights were won before the shelf was written in this mode.
   * The Karta is in the Plecak and on nobody's list, and dropping it would
   * empty a row the player can see.
   */
  it("keeps a holding that never reached the shelf", () => {
    expect(names(shelfFor([], ["cyklop"], false))).toEqual(["cyklop"]);
    expect(names(shelfFor(["nobbin"], ["nobbin", "cyklop"], false))).toEqual([
      "nobbin",
      "cyklop",
    ]);
  });

  /**
   * „Punkty" has no trophy holding to subtract, so the difference would call
   * the whole shelf gone. It is a memorial there and stays whole.
   */
  it("calls nobody gone in punkty, where there is nothing to subtract", () => {
    expect(names(shelfFor(["cyklop", "nobbin"], [], true))).toEqual(["cyklop", "nobbin"]);
  });

  it("is empty for somebody who has beaten nobody", () => {
    expect(shelfFor([], [], false)).toEqual([]);
  });
});
