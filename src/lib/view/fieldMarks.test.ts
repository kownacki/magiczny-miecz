import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { marksFor } from "./fieldMarks";

const at = (id: string, lying: { cardId: string }[] = []) =>
  marksFor(asFieldId(id)!, lying);

/**
 * A mark is a claim about a square made to somebody who has not been there.
 *
 * It is read while deciding where to move, which is the one moment nobody can
 * check it — so what each one means has to be pinned rather than left to
 * whichever predicate happens to fire.
 */
describe("marksFor", () => {
  it("marks a merchant, and a die beside him", () => {
    // Płatnerz and Medyk take gold; the Czarownica is a table.
    expect(at("osada")).toEqual(["sakwa", "kostka"]);
    // Lichwiarz buys, Wróżbita rolls.
    expect(at("grod")).toEqual(["sakwa", "kostka"]);
  });

  it("marks free healing as a boon and not as a trade", () => {
    // The Pustelnik charges a Sztuka Złota a wound, and the Egzorcyzm — the
    // only cure for the Zły Duch anywhere — asks nothing.
    expect(at("pustelnia")).toEqual(["sakwa", "gwiazda"]);
  });

  it("marks a wish as a boon, though it may be a coin", () => {
    // `touchesGold` says yes to the Magiczne Wrota and `tradesForGold` says no:
    // a wish is not a merchant. See `fieldScript.test.ts`.
    expect(at("magiczne-wrota")).toEqual(["gwiazda"]);
  });

  it("marks a die you cannot refuse", () => {
    // The Karczma is `obowiazkowe`, so it earns no sakwa though it can take a
    // coin — but a table nobody may walk past is exactly what wants a warning.
    expect(at("karczma")).toEqual(["kostka"]);
  });

  it("marks both ends of a crossing, and the roll on the defended one", () => {
    // 11.3: the Trzęsawiska are two dice against Magia going up, and free
    // coming back down — so only Uroczysko carries the die.
    expect(at("uroczysko")).toContain("przeprawa");
    expect(at("uroczysko")).toContain("kostka");
    expect(at("las-blednych-ogni")).toEqual(["przeprawa"]);
  });

  it("marks the ferry, which is a toll rather than an offer", () => {
    expect(at("przeprawa-1")).toEqual(["przeprawa"]);
  });

  it("takes marks from a Karta that settled here", () => {
    // 21.1 makes no distinction between a shop printed on the board and one
    // that walked in, so neither does the map.
    expect(at("bezdroza")).toEqual([]);
    expect(at("bezdroza", [{ cardId: "targowisko" }])).toEqual(["sakwa"]);
    expect(at("bezdroza", [{ cardId: "cudotworca" }])).toEqual(["gwiazda"]);
  });

  it("ignores a Karta that will not still be here", () => {
    // A Spotkanie is spent by the first person to read it, so a mark claiming
    // it would be a promise about a square that is already broken.
    expect(at("bezdroza", [{ cardId: "wilk" }])).toEqual([]);
  });

  it("keeps one order however many a square earns", () => {
    const many = at("uroczysko", [{ cardId: "targowisko" }]);
    expect(many).toEqual(["sakwa", "przeprawa", "kostka"]);
  });
});
