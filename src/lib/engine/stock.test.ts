import { describe, expect, it } from "vitest";
import { PRINTED_STOCK, fromTheShop, stockLeft } from "./stock";

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
