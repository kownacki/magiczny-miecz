import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { SLOTS, SLOT_LABEL, SLOT_OF, fitsIn, isWearable, slotsFor } from "./slots";

/** Every Przedmiot in the box, by id, from both the event deck and the shop. */
const ITEM_IDS = new Set([
  ...(events as EventCard[]).filter((c) => c.cardClass === "przedmiot").map((c) => c.id),
  ...(items as Item[]).map((i) => i.id),
]);

describe("slotted equipment", () => {
  it("only assigns places to cards that exist", () => {
    // A typo in the map would otherwise sit there doing nothing until somebody
    // wondered why their Excalibur would not go in a hand.
    expect(Object.keys(SLOT_OF).filter((id) => !ITEM_IDS.has(id))).toEqual([]);
  });

  it("gives every place at least one card and a label", () => {
    // The belt and the boots were dropped because the box has nothing for
    // them; this is what stops another one being added on a hunch.
    const filled = new Set(Object.values(SLOT_OF).flat());
    for (const slot of SLOTS) {
      expect(SLOT_LABEL[slot]).toBeTruthy();
      expect(filled.has(slot)).toBe(true);
    }
  });

  it("wears the four things the box has exactly one card for", () => {
    expect(slotsFor("helm")).toEqual(["glowa"]);
    expect(slotsFor("zbroja")).toEqual(["tulow"]);
    expect(slotsFor("rekawice")).toEqual(["rekawice"]);
    expect(slotsFor("pierscien-mocy")).toEqual(["pierscien"]);
  });

  it("takes a weapon in the main hand and a shield in the off one, and neither in the other", () => {
    // A weapon in each hand is a character ability nobody in this box has, so
    // until somebody does, a sword goes where a sword goes.
    for (const weapon of ["miecz", "excalibur", "swieta-wlocznia", "rozdzka-zaklec"]) {
      expect(fitsIn(weapon, "reka-glowna")).toBe(true);
      expect(fitsIn(weapon, "reka-pomocnicza")).toBe(false);
    }
    for (const shield of ["tarcza", "tarcza-tolimana", "tarcza-boga-tolimana"]) {
      expect(fitsIn(shield, "reka-glowna")).toBe(false);
      expect(fitsIn(shield, "reka-pomocnicza")).toBe(true);
    }
  });

  it("leaves the relics and the crystals in the pack, where they work", () => {
    // Their effect is having them about you, not wearing them anywhere in
    // particular — and the box has no place that would mean.
    for (const id of [
      "swiety-graal",
      "relikwiarz",
      "krysztal-magow",
      "krysztal-losu",
      "zwierciadlo-zniszczenia",
      "srebrna-strzala",
      "latarnia",
    ]) {
      expect(ITEM_IDS.has(id)).toBe(true);
      expect(isWearable(id)).toBe(false);
    }
  });

  it("has nothing that takes both hands", () => {
    // Checked against the art: the Włócznia and the Topór are the only
    // candidates by weapon type and both are drawn in one gauntleted hand.
    for (const id of Object.keys(SLOT_OF)) {
      expect(slotsFor(id).length).toBe(1);
    }
  });

  it("leaves the pack for things that are carried rather than worn", () => {
    // The variant must not make half the deck inert: anything with no place on
    // the body keeps working from the pack.
    for (const id of [
      "kij-i-sznur",
      "lodz",
      "eliksir-sily",
      "diament-krolow",
      "gliniana-tabliczka",
      "magiczny-manuskrypt",
      "tajemnicza-szkatula",
      "czarodziejska-kosc",
      "jablko-natchnienia",
      "owoc-jarzebiny-wiedzy",
    ]) {
      expect(ITEM_IDS.has(id)).toBe(true);
      expect(isWearable(id)).toBe(false);
    }
  });

  it("puts everything that carries things in the mount or bag place", () => {
    // The cards rule 5.4 names as transport, plus the two sakwy.
    for (const id of ["kon", "mul", "zaprzeg", "wierzchowiec", "bojowy-rumak"]) {
      expect(slotsFor(id)).toEqual(["wierzchowiec"]);
    }
    for (const id of ["magiczna-sakwa", "tajemna-sakwa"]) {
      expect(slotsFor(id)).toEqual(["sakwa"]);
    }
  });

  it("accounts for every Przedmiot in the box, one way or the other", () => {
    // Not an assertion about the split, just that nothing is unconsidered: a
    // newly transcribed card shows up here as a number that moved.
    const worn = [...ITEM_IDS].filter(isWearable);
    expect(ITEM_IDS.size).toBe(45);
    expect(worn).toHaveLength(26);
    expect(ITEM_IDS.size - worn.length).toBe(19);
  });
});
