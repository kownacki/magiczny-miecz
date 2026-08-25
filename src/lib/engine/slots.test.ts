import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { EMPTY_IN_BASE_GAME, SLOTS, SLOT_OF, slotCapacity, slotOf } from "./slots";

/** Every Przedmiot in the box, by id, from both the event deck and the shop. */
const ITEM_IDS = new Set([
  ...(events as EventCard[]).filter((c) => c.cardClass === "przedmiot").map((c) => c.id),
  ...(items as Item[]).map((i) => i.id),
]);

describe("slotted equipment", () => {
  it("only assigns places to cards that exist", () => {
    // A typo in the map would otherwise sit there doing nothing until somebody
    // wondered why their Excalibur would not go in a hand.
    const unknown = Object.keys(SLOT_OF).filter((id) => !ITEM_IDS.has(id));
    expect(unknown).toEqual([]);
  });

  it("has two hands and one of everything else", () => {
    expect(slotCapacity("dlon")).toBe(2);
    for (const slot of new Set(SLOTS)) {
      if (slot === "dlon") continue;
      expect(slotCapacity(slot)).toBe(1);
    }
  });

  it("leaves the pack for things that are carried rather than worn", () => {
    // The variant must not make half the deck inert: anything with no place on
    // the body keeps working from the pack.
    for (const id of ["latarnia", "kij-i-sznur", "lodz", "eliksir-sily", "diament-krolow"]) {
      expect(ITEM_IDS.has(id)).toBe(true);
      expect(slotOf(id)).toBeNull();
    }
  });

  it("wears the four things the box actually has clothing for", () => {
    expect(slotOf("helm")).toBe("glowa");
    expect(slotOf("zbroja")).toBe("tulow");
    expect(slotOf("rekawice")).toBe("rekawice");
    expect(slotOf("pierscien-mocy")).toBe("pierscien");
  });

  it("knows which places the base game can never fill", () => {
    // Documented rather than implied: this is the audit that says the belt and
    // the boots have no card, and it fails the day an expansion adds one.
    for (const slot of EMPTY_IN_BASE_GAME) {
      const wearable = Object.entries(SLOT_OF).filter(([, place]) => place === slot);
      expect(wearable).toEqual([]);
    }
    const filled = new Set(Object.values(SLOT_OF));
    for (const slot of new Set(SLOTS)) {
      if (EMPTY_IN_BASE_GAME.includes(slot)) continue;
      expect(filled.has(slot)).toBe(true);
    }
  });

  it("puts every weapon and shield in a hand", () => {
    for (const id of [
      "miecz",
      "sztylet",
      "magiczny-miecz",
      "arondight",
      "excalibur",
      "miecz-chaosu",
      "swieta-wlocznia",
      "topor-swiatla-i-ciemnosci",
      "tarcza",
      "tarcza-tolimana",
      "tarcza-boga-tolimana",
    ]) {
      expect(slotOf(id)).toBe("dlon");
    }
  });

  it("puts everything that carries things in the mount or bag place", () => {
    // These are the cards rule 5.4 names as transport, plus the two sakwy.
    for (const id of ["kon", "mul", "zaprzeg", "wierzchowiec", "bojowy-rumak"]) {
      expect(slotOf(id)).toBe("wierzchowiec");
    }
    for (const id of ["magiczna-sakwa", "tajemna-sakwa"]) {
      expect(slotOf(id)).toBe("sakwa");
    }
  });
});
