import { describe, expect, it } from "vitest";
import { bonusOf, combatValueOf } from "./cards";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

const EVENTS = events as EventCard[];
const byName = (name: string) => EVENTS.find((c) => c.name === name)!;

describe("combat values (16.2, 16.3)", () => {
  it("reads an ordinary enemy's Miecz", () => {
    expect(combatValueOf(byName("CYKLOP"))).toEqual({ kind: "ordinary", total: 6 });
  });

  it("refuses to fight an item that merely grants a bonus", () => {
    // Pierścień Mocy grants +2 Magii; the app used to offer it as a Magia-2 foe.
    expect(combatValueOf(byName("PIERŚCIEŃ MOCY"))).toBeNull();
    expect(combatValueOf(byName("EXCALIBUR"))).toBeNull();
  });

  it("refuses to fight a friend", () => {
    expect(combatValueOf(byName("RYCERZ"))).toBeNull();
    expect(combatValueOf(byName("PASTERZ"))).toBeNull();
  });

  it("offers a fight for every Wróg that prints a value, and no one else", () => {
    for (const card of EVENTS) {
      const value = combatValueOf(card);
      if (value) expect(card.cardClass).toBe("foe");
    }
  });
});

describe("bonuses (1.5, 2.5)", () => {
  it("reads an item's bonus", () => {
    expect(bonusOf(byName("PIERŚCIEŃ MOCY"))).toEqual({ miecz: 0, magia: 2 });
    expect(bonusOf(byName("EXCALIBUR"))).toEqual({ miecz: 1, magia: 0 });
  });

  it("reads a friend's bonus", () => {
    expect(bonusOf(byName("RYCERZ"))).toEqual({ miecz: 3, magia: 3 });
  });

  it("gives an enemy no bonus — its card is a trophy, not equipment (1.4)", () => {
    expect(bonusOf(byName("CYKLOP"))).toBeNull();
  });

  it("gives nothing for a card with no numbers", () => {
    expect(bonusOf(byName("ZARAZA"))).toBeNull();
  });

  it("never treats the same card as both a foe and a bonus", () => {
    for (const card of EVENTS) {
      expect(Boolean(combatValueOf(card)) && Boolean(bonusOf(card))).toBe(false);
    }
  });
});
