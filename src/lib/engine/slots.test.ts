import { describe, expect, it } from "vitest";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { EventCard, Item } from "@/data/types";
import { SLOTS, SLOT_LABEL, SLOT_OF, fitsIn, isWearable, slotsFor } from "./slots";

/** Every Przedmiot in the box, by id, from both the event deck and the shop. */
const ITEM_IDS = new Set<string>([
  ...(events as EventCard[]).filter((c) => c.cardClass === "item").map((c) => c.id),
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
    expect(slotsFor("helm")).toEqual(["head"]);
    expect(slotsFor("zbroja")).toEqual(["body"]);
    expect(slotsFor("rekawice")).toEqual(["gloves"]);
    expect(slotsFor("pierscien-mocy")).toEqual(["ring"]);
  });

  it("takes a weapon in the main hand and a shield in the off one, and neither in the other", () => {
    // A weapon in each hand is a character ability nobody in this box has, so
    // until somebody does, a sword goes where a sword goes.
    for (const weapon of ["miecz", "excalibur", "swieta-wlocznia", "rozdzka-zaklec"]) {
      expect(fitsIn(weapon, "main-hand")).toBe(true);
      expect(fitsIn(weapon, "off-hand")).toBe(false);
    }
    expect(fitsIn("tarcza", "main-hand")).toBe(false);
    expect(fitsIn("tarcza", "off-hand")).toBe(true);
  });

  it("gives the two you only have to find places of their own", () => {
    // Neither adds anything to a fight: one lets you onto the Most and the
    // other into the Zamek (p3). Leaving them in the hands meant the price of
    // going for the win was fighting the rest of the game unarmed.
    expect(fitsIn("magiczny-miecz", "magiczny-miecz")).toBe(true);
    expect(fitsIn("magiczny-miecz", "main-hand")).toBe(false);
    for (const shield of ["tarcza-tolimana", "tarcza-boga-tolimana"]) {
      expect(fitsIn(shield, "tarcza-tolimana")).toBe(true);
      expect(fitsIn(shield, "off-hand")).toBe(false);
    }
    // And an ordinary Tarcza cannot squat in the relic's place.
    expect(fitsIn("tarcza", "tarcza-tolimana")).toBe(false);
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
      expect(slotsFor(id)).toEqual(["mount"]);
    }
    for (const id of ["magiczna-sakwa", "tajemna-sakwa"]) {
      expect(slotsFor(id)).toEqual(["pouch"]);
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

describe("every Przedmiot in the box, one at a time", () => {
  /**
   * The whole table, asserted card by card rather than by sampling.
   *
   * The point is the *pairing*: a card that may be worn fits its own place and
   * no other, and a card that may not fits nowhere at all. Dragging and the
   * "załóż" button both ask exactly this question, so a card that answered it
   * wrongly would be draggable into a place it has no business being.
   */
  const ALL = [...ITEM_IDS].sort();

  it.each(ALL)("%s fits exactly the places it is meant to", (id) => {
    const mine = slotsFor(id);
    for (const slot of SLOTS) {
      expect(fitsIn(id, slot)).toBe(mine.includes(slot));
    }
    // Wearable or not, never both and never neither.
    expect(isWearable(id)).toBe(mine.length > 0);
  });

  it("splits the box the way the variant says", () => {
    const worn = ALL.filter(isWearable);
    const carried = ALL.filter((id) => !isWearable(id));
    expect(worn).toHaveLength(26);
    expect(carried).toEqual([
      "1-sztuka-zlota",
      "2-sztuki-zlota",
      "czarodziejska-kosc",
      "diament-krolow",
      "eliksir-sily",
      "gliniana-tabliczka",
      "jablko-natchnienia",
      "kij-i-sznur",
      "krysztal-losu",
      "krysztal-magow",
      "latarnia",
      "lodz",
      "magiczny-manuskrypt",
      "owoc-jarzebiny-wiedzy",
      "relikwiarz",
      "srebrna-strzala",
      "swiety-graal",
      "tajemnicza-szkatula",
      "zwierciadlo-zniszczenia",
    ]);
  });
});
