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
    expect(kindForCard({ cardClass: "item" })).toBe("item");
  });

  it("files a friend as a companion", () => {
    expect(kindForCard({ cardClass: "friend" })).toBe("friend");
  });

  it("files a beaten enemy as a trophy, not equipment", () => {
    // Otherwise beating a Cyklop would hand its Miecz 6 to the winner.
    expect(kindForCard({ cardClass: "foe" })).toBe("trophy");
  });

  it("keeps nothing for cards that are simply resolved", () => {
    expect(kindForCard({ cardClass: "encounter" })).toBeNull();
    expect(kindForCard({ cardClass: "place" })).toBeNull();
    expect(kindForCard({ cardClass: "stranger" })).toBeNull();
  });
});

describe("bonuses from a hand (1.5, 2.5)", () => {
  it("adds an item's printed bonus", () => {
    expect(bonusFromHoldings([held("excalibur", "item")], "klasyczny", "parametr")).toEqual({ miecz: 1, magia: 0 });
  });

  it("adds a friend's", () => {
    expect(bonusFromHoldings([held("rycerz", "friend")], "klasyczny", "parametr")).toEqual({ miecz: 3, magia: 3 });
  });

  it("gives a trophy nothing, even though its card prints a Miecz", () => {
    expect(bonusFromHoldings([held("cyklop", "trophy")], "klasyczny", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("gives a spell nothing", () => {
    expect(bonusFromHoldings([held("cokolwiek", "spell", "hidden")], "klasyczny", "parametr")).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("treats an untranscribed card as inert rather than failing", () => {
    expect(bonusFromHoldings([held("nie-ma-takiej", "item")], "klasyczny", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("sums a whole hand", () => {
    expect(
      bonusFromHoldings([held("excalibur", "item"), held("rycerz", "friend")], "klasyczny", "parametr"),
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
  // Excalibur rather than the plain Miecz: the variant is about *where* a card
  // is, and a card that only counts in a fight would answer 0 in both places
  // and make the test agree with itself for the wrong reason.
  const blade = { cardId: "excalibur", kind: "item", face: "open" } as const;
  const graal = { cardId: "swiety-graal", kind: "item", face: "open" } as const;

  it("counts everything in klasyczny play, worn or not", () => {
    // The rulebook has one kind of possession: a Miecz in the pack is a Miecz.
    expect(bonusFromHoldings([{ ...blade, slot: null }], "klasyczny", "parametr").miecz).toBe(1);
    expect(bonusFromHoldings([{ ...blade, slot: "reka-glowna" }], "klasyczny", "parametr").miecz).toBe(1);
  });

  it("counts a wearable card in slotowy only where it is worn", () => {
    expect(bonusFromHoldings([{ ...blade, slot: null }], "slotowy", "parametr").miecz).toBe(0);
    expect(bonusFromHoldings([{ ...blade, slot: "reka-glowna" }], "slotowy", "parametr").miecz).toBe(1);
  });

  it("still counts a card with nowhere to be worn", () => {
    // The Graal has no place on the body and works from the pack; otherwise a
    // quarter of the deck would fall silent the moment the variant went on.
    expect(bonusFromHoldings([{ ...graal, slot: null }], "slotowy", "parametr").magia).toBe(1);
  });
});

describe("a card you spend is not a card you carry", () => {
  it("gives nothing for an unopened Eliksir Siły", () => {
    // The 2 printed on it is what drinking it is worth, for one turn. Read as a
    // standing bonus it made carrying the bottle a permanent +2 that vanished
    // the moment it was finally drunk — the opposite of the card.
    expect(bonusFromHoldings([held("eliksir-sily", "item")], "klasyczny", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("still reads the corner on a card you keep", () => {
    expect(bonusFromHoldings([held("srebrna-strzala", "item")], "klasyczny", "parametr").miecz).toBe(1);
  });
});

describe("the two figures a character has (1.5)", () => {
  const hand = [held("miecz", "item"), held("krzyzowiec", "friend"), held("srebrna-strzala", "item")];

  it("leaves a fight-only card out of the parameter", () => {
    // 1.5's worked example: the Troll's "parametr Miecza" counts the Strzała
    // and not the Miecz card or the Krzyżowiec, both of which say "podczas
    // walki" and neither of which is lending anything while he stands still.
    expect(bonusFromHoldings(hand, "klasyczny", "parametr").miecz).toBe(1);
  });

  it("counts it in a fight", () => {
    expect(bonusFromHoldings(hand, "klasyczny", "walka").miecz).toBe(4);
  });

  it("makes no difference to Magia, which has no fight-only card in the box", () => {
    const magic = [held("pierscien-mocy", "item"), held("chochlik", "friend")];
    expect(bonusFromHoldings(magic, "klasyczny", "parametr").magia).toBe(
      bonusFromHoldings(magic, "klasyczny", "walka").magia,
    );
  });

  it("counts a card nobody has encoded towards both, as it always did", () => {
    // A printed corner number says how much and never when, so the two figures
    // agree until somebody writes the ability down.
    const printed = [held("excalibur", "item")];
    expect(bonusFromHoldings(printed, "klasyczny", "parametr")).toEqual(
      bonusFromHoldings(printed, "klasyczny", "walka"),
    );
  });
});
