import { describe, expect, it } from "vitest";
import { tileFor } from "./table";

/**
 * The one door a Karta goes through to become something drawable.
 *
 * There is a test here because the alternative failed in the field: the
 * conjured mark went missing on an Obszar, and the cause was not the mark, the
 * modal or the tile — it was that `field-modal` could not call `tileFor` (its
 * signature wanted a whole `Held`) and assembled the object by hand, dropping
 * the flag on the way. Three surfaces had to be fixed for one symptom.
 *
 * So what this pins is the contract rather than a pixel: whatever a caller
 * knows about a card, `tileFor` is what turns it into a tile, and anything a
 * tile learns next is added once here.
 */
describe("tileFor", () => {
  it("names a Karta and carries its printed text", () => {
    expect(tileFor({ cardId: "cyklop" })).toMatchObject({
      cardId: "cyklop",
      name: "CYKLOP",
    });
    expect(tileFor({ cardId: "cyklop" }).text).toBeTruthy();
  });

  /** The flag the whole refactor is about. */
  it("carries the conjured mark, and says nothing when there is none", () => {
    expect(tileFor({ cardId: "targowisko", granted: true }).granted).toBe(true);
    expect(tileFor({ cardId: "targowisko" }).granted).toBeUndefined();
  });

  /**
   * Takes the least it needs, so a card lying on an Obszar fits.
   *
   * A field row is `{ id, fieldId, cardId, granted }` and holds no `kind` —
   * requiring one is exactly what shut `field-modal` out. And `kindLabel` is
   * absent without it, which is right: „Przedmiot" describes a thing in
   * somebody's pack, and a Karta on the board is not in one.
   */
  it("labels a kind when there is one, and not when there is not", () => {
    expect(tileFor({ cardId: "helm", kind: "item" }).kindLabel).toBe("Przedmiot");
    expect(tileFor({ cardId: "helm" }).kindLabel).toBeUndefined();
  });
});
