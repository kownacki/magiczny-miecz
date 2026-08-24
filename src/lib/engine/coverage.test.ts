import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { ABILITIES } from "./abilities";
import { SCRIPTS } from "./cardScript";
import { coverageOf, manualNote } from "./coverage";

const KNOWN = new Set([
  ...(events as EventCard[]).map((c) => c.id),
  ...(items as Item[]).map((i) => i.id),
]);

describe("what the app claims about itself", () => {
  it("only annotates cards that exist", () => {
    for (const card of KNOWN) {
      expect(["pelne", "czesciowe", "brak"]).toContain(coverageOf(card));
    }
  });

  it("never attaches a manual note to a card it does not handle at all", () => {
    // A note says "the app does this much, and you do the rest". On a card the
    // app does nothing for, that is a lie in the more dangerous direction.
    for (const card of KNOWN) {
      if (coverageOf(card) === "brak") {
        expect(manualNote(card), card).toBeNull();
      }
    }
  });

  it("gives every partially-handled card something to act on", () => {
    for (const card of KNOWN) {
      if (coverageOf(card) !== "czesciowe") continue;
      expect(manualNote(card)?.length ?? 0, card).toBeGreaterThan(0);
    }
  });

  it("calls a card fully handled only when nothing was left to the players", () => {
    for (const card of KNOWN) {
      const encoded = card in SCRIPTS || card in ABILITIES;
      expect(coverageOf(card) === "brak", card).toBe(!encoded);
      if (coverageOf(card) === "pelne") {
        expect(encoded, card).toBe(true);
        expect(manualNote(card), card).toBeNull();
      }
    }
  });

  it("reports an unencoded card as unhandled rather than staying quiet", () => {
    // Wampir is one of the cards deliberately left alone; if it ever becomes
    // encoded this test should be updated rather than deleted.
    expect(coverageOf("wampir")).toBe("brak");
    expect(coverageOf("jednorozec")).toBe("pelne");
    expect(coverageOf("excalibur")).toBe("czesciowe");
  });
});
