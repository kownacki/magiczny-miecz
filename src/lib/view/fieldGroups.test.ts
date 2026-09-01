import { describe, expect, it } from "vitest";
import { classOnField, fieldGroups, numeralOf } from "./fieldGroups";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

const byName = (name: string) =>
  (events as EventCard[]).find((card) => card.name === name)!.id;

const lying = (...cardIds: string[]) => cardIds.map((cardId, at) => ({ id: `r${at}`, cardId }));
const shape = (cards: { cardId: string }[]) =>
  fieldGroups(cards).map((group) => [group.title, group.cards.map((c) => c.cardId)] as const);

describe("classOnField", () => {
  it("reads both decks a field can hold", () => {
    expect(classOnField(byName("WILK"))).toBe("foe");
    expect(classOnField(byName("DEMON"))).toBe("demon");
    // Wyposażenie has no numeral and is a Przedmiot wherever a rule names one.
    expect(classOnField("miecz")).toBe("item");
  });

  it("answers null for an id neither deck knows", () => {
    expect(classOnField("nie-ma-takiej-karty")).toBeNull();
  });
});

describe("fieldGroups", () => {
  it("drops every empty group", () => {
    expect(shape(lying(byName("WILK")))).toEqual([["Wrogowie", [byName("WILK")]]]);
  });

  it("orders the groups for a reader, loot above the residents", () => {
    const cards = lying(
      byName("TARGOWISKO"),
      byName("CUDOTWÓRCA"),
      byName("2 SZTUKI ZŁOTA"),
      byName("WILK"),
    );
    expect(shape(cards)).toEqual([
      ["Wrogowie", [byName("WILK")]],
      ["Przedmioty i Przyjaciele", [byName("2 SZTUKI ZŁOTA")]],
      ["Nieznajomi i Miejsca", [byName("CUDOTWÓRCA"), byName("TARGOWISKO")]],
    ]);
  });

  /**
   * The Bestia above the Demon, which is the printed numeral and 15.2's order
   * both. Before the Demon had a class of its own these tied and came out in
   * whichever order they had landed.
   */
  it("puts II above III inside Wrogowie, whichever arrived first", () => {
    const wilk = byName("WILK");
    const demon = byName("DEMON");
    expect(shape(lying(demon, wilk))).toEqual([["Wrogowie", [wilk, demon]]]);
    expect(shape(lying(wilk, demon))).toEqual([["Wrogowie", [wilk, demon]]]);
  });

  /**
   * 12.1 takes "Przedmioty lub Przyjaciół" without asking which deck, so a
   * Wyposażenie Miecz and an event-deck Przedmiot interleave by when they
   * arrived; only the Przyjaciel is held back.
   */
  it("mixes Wyposażenie with Przedmioty by arrival and puts Przyjaciele last", () => {
    const gold = byName("2 SZTUKI ZŁOTA");
    const rycerz = byName("RYCERZ");
    expect(shape(lying(rycerz, "miecz", gold, "helm"))).toEqual([
      ["Przedmioty i Przyjaciele", ["miecz", gold, "helm", rycerz]],
    ]);
  });

  it("keeps arrival order between two copies of one card", () => {
    const rows = [
      { id: "first", cardId: "miecz" },
      { id: "second", cardId: "miecz" },
    ];
    expect(fieldGroups(rows)[0].cards.map((c) => c.id)).toEqual(["first", "second"]);
  });

  /**
   * A base-game table will never draw this group — all twenty Spotkania are
   * put away when they resolve — but Gród's SPISEK ("Połóż tę Kartę przy
   * Wrotach") and Magia's STRAŻNIK ("połóż Strażnika na polu") are class I
   * cards that sit on an Obszar, so the shelf has to exist and has to come
   * first when it is not empty.
   */
  it("shows Spotkania first when something ever puts one on a field", () => {
    const mgla = byName("MGŁA");
    expect(shape(lying(byName("WILK"), mgla))).toEqual([
      ["Spotkania", [mgla]],
      ["Wrogowie", [byName("WILK")]],
    ]);
  });

  it("shows an unrecognised id rather than losing it", () => {
    expect(shape(lying("kto-to-jest", byName("WILK")))).toEqual([
      ["Wrogowie", [byName("WILK")]],
      ["Pozostałe", ["kto-to-jest"]],
    ]);
  });

  it("does not mutate what it was handed", () => {
    const cards = lying(byName("DEMON"), byName("WILK"));
    const before = cards.map((c) => c.cardId);
    fieldGroups(cards);
    expect(cards.map((c) => c.cardId)).toEqual(before);
  });
});

describe("numeralOf", () => {
  it("gives the Roman numeral the card prints", () => {
    expect(numeralOf(byName("WILK"))).toBe("II");
    expect(numeralOf(byName("DEMON"))).toBe("III");
    expect(numeralOf(byName("CUDOTWÓRCA"))).toBe("IV");
    expect(numeralOf(byName("RYCERZ"))).toBe("V");
    expect(numeralOf(byName("TARGOWISKO"))).toBe("VI");
    expect(numeralOf(byName("MGŁA"))).toBe("I");
  });

  it("gives none for Wyposażenie, which prints none", () => {
    expect(numeralOf("miecz")).toBeNull();
    expect(numeralOf("nie-ma-takiej-karty")).toBeNull();
  });
});
