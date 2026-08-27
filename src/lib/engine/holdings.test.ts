import { describe, expect, it } from "vitest";
import { bonusFromHoldings, forbiddenTo, inEffect, kindForCard, visibleTo } from "./holdings";
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
    expect(bonusFromHoldings([held("excalibur", "item")], "classic", "parametr")).toEqual({ miecz: 1, magia: 0 });
  });

  it("adds a friend's", () => {
    // The Pasterz says it in as many words: "doda ci 1 punkt Miecza i 1 punkt Magii".
    expect(bonusFromHoldings([held("pasterz", "friend")], "classic", "parametr")).toEqual({ miecz: 1, magia: 1 });
  });

  /**
   * The Rycerz used to be this test, lending +3/+3 for being held. He prints 3
   * and 3 because *he* has them — "będzie walczył zamiast ciebie" — and reading
   * a corner number as a loan made him a permanent statue buff instead of a
   * champion. Same for the Poszukiwacz Przygód and the 3 he raids with.
   */
  it("lends nothing for a friend who fights on his own account", () => {
    for (const who of ["rycerz", "poszukiwacz-przygod"]) {
      expect(bonusFromHoldings([held(who, "friend")], "classic", "parametr")).toEqual({ miecz: 0, magia: 0 });
      expect(bonusFromHoldings([held(who, "friend")], "classic", "walka")).toEqual({ miecz: 0, magia: 0 });
    }
  });

  it("gives a trophy nothing, even though its card prints a Miecz", () => {
    expect(bonusFromHoldings([held("cyklop", "trophy")], "classic", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("gives a spell nothing", () => {
    expect(bonusFromHoldings([held("cokolwiek", "spell", "hidden")], "classic", "parametr")).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("treats an untranscribed card as inert rather than failing", () => {
    expect(bonusFromHoldings([held("nie-ma-takiej", "item")], "classic", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("sums a whole hand", () => {
    expect(
      bonusFromHoldings([held("excalibur", "item"), held("pasterz", "friend")], "classic", "parametr"),
    ).toEqual({ miecz: 2, magia: 1 });
  });
});

/* --------------------------------------------------------------------------
 * 5.3, after the Natura has moved under the card.
 * ----------------------------------------------------------------------- */

describe("a card its holder may not hold", () => {
  const chaos = held("miecz-chaosu", "item");

  /**
   * The Miecz Chaosu is one of the three cards 5.3 keeps from a Natura: Zła and
   * Chaotyczna may carry it, Dobra may not. 7.2 is what makes this a state
   * rather than a one-time check — a character turns Dobra with the sword
   * already on their arm — and the app's answer is that it stops working, not
   * that it is taken away. See `inEffect`: 7.4 says such a card must be
   * dropped, and dropping it is a move its owner makes.
   */
  it("lends nothing to a Natura that may not hold it", () => {
    expect(bonusFromHoldings([chaos], "classic", "walka", null, "evil")).toEqual({
      miecz: 2,
      magia: 0,
    });
    expect(bonusFromHoldings([chaos], "classic", "walka", null, "good")).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("is still held — it is inert, not gone", () => {
    // Which is the difference that matters: a pack with no room in it would
    // make dropping the card impossible if the app had already taken it off.
    expect(forbiddenTo("miecz-chaosu", "good")).toBe(true);
    expect(forbiddenTo("miecz-chaosu", "evil")).toBe(false);
    expect(forbiddenTo("miecz", "good")).toBe(false);
  });

  it("counts for a caller that does not know the Natura", () => {
    // Every caller before this one passed no Natura, and the honest answer to
    // "may this character hold it" without knowing who they are is yes.
    expect(inEffect([chaos], "classic")).toHaveLength(1);
    expect(inEffect([chaos], "classic", null)).toHaveLength(1);
    expect(inEffect([chaos], "classic", "good")).toHaveLength(0);
  });

  it("is inert in the slotted variant too, worn or not", () => {
    const worn = { ...chaos, slot: "main-hand" };
    expect(inEffect([worn], "slots", "evil")).toHaveLength(1);
    expect(inEffect([worn], "slots", "good")).toHaveLength(0);
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
    expect(bonusFromHoldings([{ ...blade, slot: null }], "classic", "parametr").miecz).toBe(1);
    expect(bonusFromHoldings([{ ...blade, slot: "main-hand" }], "classic", "parametr").miecz).toBe(1);
  });

  it("counts a wearable card in slotowy only where it is worn", () => {
    expect(bonusFromHoldings([{ ...blade, slot: null }], "slots", "parametr").miecz).toBe(0);
    expect(bonusFromHoldings([{ ...blade, slot: "main-hand" }], "slots", "parametr").miecz).toBe(1);
  });

  it("still counts a card with nowhere to be worn", () => {
    // The Graal has no place on the body and works from the pack; otherwise a
    // quarter of the deck would fall silent the moment the variant went on.
    expect(bonusFromHoldings([{ ...graal, slot: null }], "slots", "parametr").magia).toBe(1);
  });
});

describe("a card you spend is not a card you carry", () => {
  it("gives nothing for an unopened Eliksir Siły", () => {
    // The 2 printed on it is what drinking it is worth, for one turn. Read as a
    // standing bonus it made carrying the bottle a permanent +2 that vanished
    // the moment it was finally drunk — the opposite of the card.
    expect(bonusFromHoldings([held("eliksir-sily", "item")], "classic", "parametr")).toEqual({ miecz: 0, magia: 0 });
  });

  it("still reads the corner on a card you keep", () => {
    expect(bonusFromHoldings([held("srebrna-strzala", "item")], "classic", "parametr").miecz).toBe(1);
  });
});

describe("the two figures a character has (1.5)", () => {
  const hand = [held("miecz", "item"), held("krzyzowiec", "friend"), held("srebrna-strzala", "item")];

  it("leaves a fight-only card out of the parameter", () => {
    // 1.5's worked example: the Troll's "parametr Miecza" counts the Strzała
    // and not the Miecz card or the Krzyżowiec, both of which say "podczas
    // walki" and neither of which is lending anything while he stands still.
    expect(bonusFromHoldings(hand, "classic", "parametr").miecz).toBe(1);
  });

  it("counts it in a fight", () => {
    expect(bonusFromHoldings(hand, "classic", "walka").miecz).toBe(4);
  });

  it("makes no difference to Magia, which has no fight-only card in the box", () => {
    const magic = [held("pierscien-mocy", "item"), held("chochlik", "friend")];
    expect(bonusFromHoldings(magic, "classic", "parametr").magia).toBe(
      bonusFromHoldings(magic, "classic", "walka").magia,
    );
  });

  it("counts a card nobody has encoded towards both, as it always did", () => {
    // A printed corner number says how much and never when, so the two figures
    // agree until somebody writes the ability down.
    const printed = [held("excalibur", "item")];
    expect(bonusFromHoldings(printed, "classic", "parametr")).toEqual(
      bonusFromHoldings(printed, "classic", "walka"),
    );
  });
});
