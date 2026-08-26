import { describe, expect, it } from "vitest";
import characters from "./characters.json";
import events from "./events.json";
import items from "./items.json";
import spells from "./spells.json";
import type { Character, EventCard, Item, Spell } from "./types";

/**
 * Two identities, which this data has always had without saying so.
 *
 * `id` is the card as a rule: MIECZ is one card however many of it the box
 * prints. `source` — the sheet it was cut from and its position on that sheet —
 * is the *printing*: one physical piece of card. The numbers say it plainly.
 * The 165 Karty Zdarzeń are 138 distinct cards, the 30 Wyposażenie are 12, and
 * the 30 Zaklęcia are 27; the rest are second and third copies, which is what
 * 21.2 counts when it asks how many are in play.
 *
 * That is the same split every trading-card game arrived at — the card as a
 * rules object, and the printing it came out of — and it is why an id must
 * never be unique here and a coordinate always must.
 *
 * `set` is the third thing, and the reason to write it down before the five
 * expansions are transcribed: a card's home deck cannot be derived from
 * anything else. A discarded card returns to its own pile and 21.2 counts its
 * own printings — both silently right with one box, both wrong with two.
 */
const DECKS = {
  events: events as EventCard[],
  items: items as Item[],
  spells: spells as Spell[],
  characters: characters as Character[],
};

const EVERYTHING = Object.values(DECKS).flat();

describe("every card says which box it came from", () => {
  for (const [deck, cards] of Object.entries(DECKS)) {
    it(`gives every ${deck} card a set`, () => {
      expect(cards.filter((card) => card.set !== "base").map((card) => card.id)).toEqual([]);
    });
  }
});

describe("every printing has a square of its own", () => {
  /**
   * Across all four decks at once, because two of the sheets are shared.
   *
   * `wyposazenie-zaklecia` is one sheet with the last of the Wyposażenie on it
   * and the first of the Zaklęcia, so its numbering runs through both files.
   * Checking each file on its own would have this sheet starting at 11 in one
   * and being full of holes in the other.
   */
  const bySheet = new Map<string, { index: number; id: string }[]>();
  for (const card of EVERYTHING) {
    const at = `${card.set}/${card.source.sheet}`;
    bySheet.set(at, [...(bySheet.get(at) ?? []), { index: card.source.index, id: card.id }]);
  }

  it("cuts no two cards from the same square", () => {
    const clashes: string[] = [];
    for (const [sheet, cut] of bySheet) {
      const seen = new Map<number, string>();
      for (const { index, id } of cut) {
        const already = seen.get(index);
        if (already) clashes.push(`${sheet}#${index}: ${already} and ${id}`);
        else seen.set(index, id);
      }
    }
    // A repeat is a mis-indexed transcription: two cards pointing at one
    // picture, which nothing else in the app could ever notice.
    expect(clashes).toEqual([]);
  });

  it("numbers each sheet from one, without gaps", () => {
    // The sheets are complete impressions and the slicer takes every square, so
    // a gap is a card that was cut and then lost on the way into the data.
    for (const [sheet, cut] of bySheet) {
      const indices = cut.map((one) => one.index).sort((a, b) => a - b);
      expect(indices, sheet).toEqual(indices.map((_, n) => n + 1));
    }
  });
});

describe("what is and is not unique", () => {
  it("prints some cards more than once, which is not a mistake", () => {
    const cards = new Set(events.map((card) => card.id));
    // The numbers themselves, so that a change to either is a change to this
    // line rather than a silent one.
    expect(events.length).toBe(165);
    expect(cards.size).toBe(138);
  });

  it("gives every character exactly one card, unlike every other deck", () => {
    const cards = new Set(characters.map((one) => one.id));
    expect(cards.size).toBe(characters.length);
  });

  it("never repeats an id across two different sets", () => {
    // Vacuous with one box, and the assertion that will fail first on the day a
    // second one is transcribed — which is the point of writing it now.
    const seen = new Map<string, string>();
    for (const card of EVERYTHING) {
      const was = seen.get(card.id);
      if (was && was !== card.set) throw new Error(`${card.id} is in ${was} and ${card.set}`);
      seen.set(card.id, card.set);
    }
    expect(seen.size).toBeGreaterThan(100);
  });
});
