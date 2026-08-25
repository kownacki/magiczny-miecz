import { describe, expect, it } from "vitest";
import { bonusFromHoldings, kindForCard, visibleTo } from "./holdings";
import type { Holding } from "./state";

const held = (cardId: string, kind: Holding["kind"], face: Holding["face"] = "open"): Holding => ({
  cardId,
  kind,
  face,
});

describe("which pile a card joins (16.6, 1.4)", () => {
  it("files an item as equipment", () => {
    expect(kindForCard({ cardClass: "przedmiot" })).toBe("item");
  });

  it("files a friend as a companion", () => {
    expect(kindForCard({ cardClass: "przyjaciel" })).toBe("friend");
  });

  it("files a beaten enemy as a trophy, not equipment", () => {
    // Otherwise beating a Cyklop would hand its Miecz 6 to the winner.
    expect(kindForCard({ cardClass: "wrog" })).toBe("trophy");
  });

  it("keeps nothing for cards that are simply resolved", () => {
    expect(kindForCard({ cardClass: "spotkanie" })).toBeNull();
    expect(kindForCard({ cardClass: "miejsce" })).toBeNull();
    expect(kindForCard({ cardClass: "nieznajomy" })).toBeNull();
  });
});

describe("bonuses from a hand (1.5, 2.5)", () => {
  it("adds an item's printed bonus", () => {
    expect(bonusFromHoldings([held("excalibur", "item")])).toEqual({ miecz: 1, magia: 0 });
  });

  it("adds a friend's", () => {
    expect(bonusFromHoldings([held("rycerz", "friend")])).toEqual({ miecz: 3, magia: 3 });
  });

  it("gives a trophy nothing, even though its card prints a Miecz", () => {
    expect(bonusFromHoldings([held("cyklop", "trophy")])).toEqual({ miecz: 0, magia: 0 });
  });

  it("gives a spell nothing", () => {
    expect(bonusFromHoldings([held("cokolwiek", "spell", "hidden")])).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("treats an untranscribed card as inert rather than failing", () => {
    expect(bonusFromHoldings([held("nie-ma-takiej", "item")])).toEqual({ miecz: 0, magia: 0 });
  });

  it("sums a whole hand", () => {
    expect(
      bonusFromHoldings([held("excalibur", "item"), held("rycerz", "friend")]),
    ).toEqual({ miecz: 4, magia: 3 });
  });
});

describe("concealment (9.3, 5.2, 6.2)", () => {
  const hand = [held("excalibur", "item"), held("zaklecie", "spell", "hidden")];

  it("hides another player's spells but counts them", () => {
    const seen = visibleTo(hand, { own: false, mode: "simulation" });
    expect(seen.cards.map((c) => c.cardId)).toEqual(["excalibur"]);
    expect(seen.hiddenCount).toBe(1);
  });

  it("shows a seat its own hand in full", () => {
    expect(visibleTo(hand, { own: true, mode: "simulation" }).cards).toHaveLength(2);
  });

  it("hides nothing in companion mode, where the cards are in real hands", () => {
    const seen = visibleTo(hand, { own: false, mode: "companion" });
    expect(seen.cards).toHaveLength(2);
    expect(seen.hiddenCount).toBe(0);
  });
});

describe("what counts, in each equipment variant", () => {
  const miecz = { cardId: "miecz", kind: "item", face: "open" } as const;
  const graal = { cardId: "swiety-graal", kind: "item", face: "open" } as const;

  it("counts everything in klasyczny play, worn or not", () => {
    // The rulebook has one kind of possession: a Miecz in the pack is a Miecz.
    expect(bonusFromHoldings([{ ...miecz, slot: null }]).miecz).toBe(1);
    expect(bonusFromHoldings([{ ...miecz, slot: "reka-glowna" }]).miecz).toBe(1);
  });

  it("counts a wearable card in slotowy only where it is worn", () => {
    expect(bonusFromHoldings([{ ...miecz, slot: null }], "slotowy").miecz).toBe(0);
    expect(bonusFromHoldings([{ ...miecz, slot: "reka-glowna" }], "slotowy").miecz).toBe(1);
  });

  it("still counts a card with nowhere to be worn", () => {
    // The Graal has no place on the body and works from the pack; otherwise a
    // quarter of the deck would fall silent the moment the variant went on.
    expect(bonusFromHoldings([{ ...graal, slot: null }], "slotowy").magia).toBe(1);
  });
});

describe("a card you spend is not a card you carry", () => {
  it("gives nothing for an unopened Eliksir Siły", () => {
    // The 2 printed on it is what drinking it is worth, for one turn. Read as a
    // standing bonus it made carrying the bottle a permanent +2 that vanished
    // the moment it was finally drunk — the opposite of the card.
    expect(bonusFromHoldings([held("eliksir-sily", "item")])).toEqual({ miecz: 0, magia: 0 });
  });

  it("still reads the corner on a card you keep", () => {
    expect(bonusFromHoldings([held("miecz", "item")]).miecz).toBe(1);
  });
});
