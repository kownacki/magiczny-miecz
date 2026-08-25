import { describe, expect, it } from "vitest";
import { PRINTED_STOCK, fromTheShop, stockLeft } from "./stock";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

describe("the Wyposażenie pile (21.2)", () => {
  it("counts what the sheet actually prints", () => {
    // Four Magiczne Miecze and four Tarcze Tolimana, and exactly one Latarnia
    // — which is why the Latarnia is a race and the Miecz is not.
    expect(PRINTED_STOCK["magiczny-miecz"]).toBe(4);
    expect(PRINTED_STOCK["tarcza-tolimana"]).toBe(4);
    expect(PRINTED_STOCK["latarnia"]).toBe(1);
    expect(PRINTED_STOCK["lodz"]).toBe(1);
  });

  it("knows what is not on the pile at all", () => {
    // Excalibur is found, never bought: it has no equipment card behind it.
    expect(fromTheShop("magiczny-miecz")).toBe(true);
    expect(fromTheShop("excalibur")).toBe(false);
    expect(stockLeft("excalibur", 99)).toBe(Infinity);
  });

  it("runs out, and comes back when a copy leaves play", () => {
    expect(stockLeft("magiczny-miecz", 0)).toBe(4);
    expect(stockLeft("magiczny-miecz", 3)).toBe(1);
    expect(stockLeft("magiczny-miecz", 4)).toBe(0);
    // 21.2 again: a bought card returns to the pile rather than the discard, so
    // the fourth Miecz being dropped makes it buyable again.
    expect(stockLeft("magiczny-miecz", 3)).toBe(1);
  });

  it("never goes negative, however many turn up", () => {
    // 16.6 should stop this happening, but a table correcting itself by hand
    // can put a fifth one in play and the number must stay sane.
    expect(stockLeft("latarnia", 5)).toBe(0);
  });
});

describe("the stock and the deck are different piles", () => {
  it("shares almost every card with the event deck", () => {
    // The fact that makes the distinction load-bearing rather than pedantic:
    // eleven of the twelve Wyposażenie cards are *also* printed on the Karty
    // Zdarzeń. A Hełm leaving a hand is therefore two different cards
    // depending on which pile you think it came from, and putting it on the
    // wrong one hands the deck a thirteenth Hełm.
    // Widened on purpose: the question is whether a *stock* id appears in the
    // deck, and a stock id is not an EventId — which is the whole point.
    const inTheDeck = new Set<string>((events as EventCard[]).map((card) => card.id));
    const shared = Object.keys(PRINTED_STOCK).filter((id) => inTheDeck.has(id));
    expect(shared.length).toBe(11);
    expect(shared).toContain("helm");
    expect(shared).toContain("magiczny-miecz");
    // The one that exists only on the sheet — which is why `takeCard` has to
    // look in both places to let anybody pick up the card the Zamek requires.
    expect(inTheDeck.has("tarcza-tolimana")).toBe(false);
  });

  it("gives a card back by arithmetic, not by a pile", () => {
    // 21.2's "umieszcza się je powtórnie w stosie Kart zakupów", expressed as
    // a count: the moment a Latarnia stops being in play it is back on the
    // shelf, with nothing having had to put it there.
    expect(stockLeft("latarnia", 1)).toBe(0);
    expect(stockLeft("latarnia", 0)).toBe(1);
  });
});
