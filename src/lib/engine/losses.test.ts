import { describe, expect, it } from "vitest";
import { chooseLosses, describeLoss, goldLost, type Losable } from "./losses";

const pack: Losable[] = [
  { id: "i1", cardId: "miecz", kind: "item" },
  { id: "i2", cardId: "tarcza", kind: "item" },
  { id: "f1", cardId: "pasterz", kind: "friend" },
  { id: "t1", cardId: "upior", kind: "trophy" },
  { id: "s1", cardId: "fatum", kind: "spell" },
];

describe("what a loss reaches for", () => {
  it("never takes a trophy when a Przedmiot is asked for", () => {
    // 1.4 makes a beaten Wróg worth points of Miecz, not a thing in the pack —
    // however alike the two look in the holdings table.
    const taken = chooseLosses(pack, { co: "przedmiot", wybor: "losowo" }, () => 99);
    expect(taken).not.toContain("t1");
    expect(["i1", "i2"]).toContain(taken![0]);
  });

  it("takes every item when the card says all of them", () => {
    expect(chooseLosses(pack, { co: "wszystkie-przedmioty" })).toEqual(["i1", "i2"]);
  });

  it("takes friends and spells from their own kinds", () => {
    expect(chooseLosses(pack, { co: "przyjaciel", wybor: "losowo" })).toEqual(["f1"]);
    expect(chooseLosses(pack, { co: "zaklecie", wybor: "losowo" })).toEqual(["s1"]);
  });

  it("takes nothing when there is nothing of that kind", () => {
    const empty = [{ id: "t1", cardId: "upior", kind: "trophy" as const }];
    expect(chooseLosses(empty, { co: "przedmiot", wybor: "losowo" })).toEqual([]);
  });

  it("asks the holder when the card does not say otherwise", () => {
    // 5.6 leaves the choice of what to give up to the player, and a card that
    // is silent inherits that rather than deciding for them.
    expect(chooseLosses(pack, { co: "przedmiot" })).toBeNull();
    expect(chooseLosses(pack, { co: "przedmiot", wybor: "ty" })).toBeNull();
  });

  it("takes as many as asked, and never the same one twice", () => {
    const taken = chooseLosses(pack, { co: "przedmiot", count: 2, wybor: "losowo" }, () => 0);
    expect(taken).toEqual(["i1", "i2"]);
  });

  it("cannot take more than is there", () => {
    const taken = chooseLosses(pack, { co: "przedmiot", count: 9, wybor: "losowo" }, () => 0);
    expect(taken).toHaveLength(2);
  });

  it("survives a chooser that hands back nonsense", () => {
    // A bad port should cost a predictable card, not throw in the middle of
    // resolving one.
    for (const bad of [-5, 1.7, 1e9, Number.NaN]) {
      const taken = chooseLosses(pack, { co: "przedmiot", wybor: "losowo" }, () => bad);
      expect(taken).toHaveLength(1);
      expect(["i1", "i2"]).toContain(taken![0]);
    }
  });
});

describe("gold", () => {
  it("takes all of it when no amount is named", () => {
    // "Tracisz całe złoto" is the common phrasing and carries no count.
    expect(goldLost({ co: "gold" }, 7)).toBe(7);
  });

  it("takes the named amount, never more than is there", () => {
    expect(goldLost({ co: "gold", count: 2 }, 7)).toBe(2);
    expect(goldLost({ co: "gold", count: 9 }, 3)).toBe(3);
  });

  it("takes no gold for a loss that is not about gold", () => {
    expect(goldLost({ co: "przedmiot" }, 7)).toBe(0);
  });

  it("is not a holding, so it takes no cards", () => {
    expect(chooseLosses(pack, { co: "gold" })).toEqual([]);
  });
});

describe("saying what went", () => {
  it("names the kind, the count and whether it was chance", () => {
    expect(describeLoss({ co: "przedmiot" })).toBe("Przedmiot");
    expect(describeLoss({ co: "przedmiot", count: 2, wybor: "losowo" })).toBe(
      "2 Przedmiot (losowo)",
    );
    expect(describeLoss({ co: "wszystkie-przedmioty" })).toBe("wszystkie Przedmioty");
  });
});

describe("a whole hand at once (Przesilenie, Władca Czarów)", () => {
  const hand = [
    { id: "a", cardId: "fatum", kind: "spell" as const },
    { id: "b", cardId: "golem", kind: "spell" as const },
    { id: "c", cardId: "miecz", kind: "item" as const },
  ];

  it("takes every Zaklęcie and asks nobody which", () => {
    // "wszystkie Karty Zaklęć, znajdujące się w posiadaniu Postaci" — not a
    // count, so it never comes back null wanting the holder to choose.
    expect(chooseLosses(hand, { co: "wszystkie-zaklecia" })).toEqual(["a", "b"]);
  });

  it("leaves everything that is not a Zaklęcie", () => {
    expect(chooseLosses(hand, { co: "wszystkie-zaklecia" })).not.toContain("c");
  });

  it("is quiet about a hand that was already empty", () => {
    expect(chooseLosses([hand[2]], { co: "wszystkie-zaklecia" })).toEqual([]);
  });

  it("still asks which, when the card takes only one", () => {
    // The distinction that made this necessary: the Przesilenie used to be
    // written as this, and cost a Czarodziej one of his three.
    expect(chooseLosses(hand, { co: "zaklecie" })).toBeNull();
  });
});
