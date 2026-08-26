import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import events from "./events.json";
import spells from "./spells.json";
import items from "./items.json";
import characters from "./characters.json";
import markers from "./markers.json";
import standees from "./character-standees.json";

/**
 * What the box holds, checked against what the manual says it holds.
 *
 * The counts are printed on the rulebook's first page — "KARTY ZDARZEŃ (165
 * sztuk)", "KARTY ZAKLĘĆ (30 sztuk)" and so on — and the slicer cut exactly
 * those numbers out of the scans. Two counts arrived at independently, one from
 * the print run and one from `extract-assets.mjs`, and this is where they are
 * made to agree out loud.
 *
 * It is not a transcription test. A card can be in here with its text still
 * unread; what this catches is a card that is not in here at all — a slice the
 * cutter missed, a sheet that stopped being mirrored, a merge that dropped a
 * row. Those are the failures that are otherwise invisible, because nothing
 * downstream knows how many of anything there should be.
 */
describe("what the box holds (CO NALEŻY ZABRAĆ NA WYPRAWĘ)", () => {
  it("has all 165 Karty Zdarzeń", () => {
    expect(events.length).toBe(165);
    // Fewer distinct cards than cards: the box prints four "1 SZTUKA ZŁOTA",
    // two "UPIÓR", four "MAGICZNY MIECZ". Which is why a deck holds slice refs
    // and not ids — see `deck.ts`.
    expect(new Set(events.map((card) => card.id)).size).toBe(138);
  });

  it("has all 30 Karty Zaklęć", () => {
    expect(spells.length).toBe(30);
    expect(new Set(spells.map((card) => card.id)).size).toBe(27);
  });

  it("has all 30 Kart Wyposażenia, Magicznych Mieczy and Tarcz Tolimana", () => {
    expect(items.length).toBe(30);
    expect(new Set(items.map((card) => card.id)).size).toBe(12);
  });

  it("has all 27 Karty Postaci, in both of their forms", () => {
    // "występują w zestawie w dwóch formach": the big card with the
    // Charakterystyka, and the small one that stands on the board.
    expect(characters.length).toBe(27);
    expect(Object.keys(standees).length).toBe(27);
  });

  it("has the 4 Zamieniony w Kamień and the 4 Karty Zmiany Natury", () => {
    expect(markers.stone.length).toBe(4);
    expect(markers.natureChange.length).toBe(4);
  });

  it("has a żeton exported for every denomination the box prints", () => {
    // The manual gives no number for these — "należy podzielić według kolorów"
    // and nothing more — so what is checkable is the set of denominations:
    // Miecz, Magia and Życie in 1 to 4, and the Sztuka Złota. Read off the
    // exported files, so a token that stops being cut fails here rather than
    // going missing from a seat card.
    const printed = [
      ...["miecz", "magia", "zycie"].flatMap((stat) => [1, 2, 3, 4].map((n) => `${stat}-${n}`)),
      "zloto",
    ];
    const cut = readdirSync("public/tokens")
      .filter((file) => file.endsWith(".png"))
      .map((file) => file.replace(/\.png$/, ""));
    expect([...cut].sort()).toEqual([...printed].sort());
  });
});
