import { describe, expect, it } from "vitest";
import {
  BASE_CARRY_LIMIT,
  adjustOwn,
  carryLimit,
  excessSpells,
  heal,
  gainLife,
  mayHold,
  spellAllowance,
  spellCapacity,
  totalsFor,
} from "./derive";
import { abilitiesOf } from "./abilities";
import {
  beastCombatKind,
  beastStrength,
  combinedEnemyTotal,
  compareCombat,
  spoilsFor,
} from "./combat";
import { resolutionOrder } from "./state";
import { scriptedRandom } from "./ports";
import type { Item } from "@/data/types";
import type { Holding, Seat } from "./state";
import type { CardId } from "@/data/ids";

const seat = (over: Partial<Seat> = {}): Seat => ({
  id: "s1",
  index: 0,
  name: "Zaurak",
  characterId: "krasnolud",
  fieldId: "karczma",
  swordOwn: 3,
  magicOwn: 2,
  swordFloor: 3,
  magicFloor: 2,
  life: 4,
  gold: 1,
  nature: "good",
  turnsLost: 0,
  stoneUntilRound: null,
  eliminated: false,
  holdings: [],
  ...over,
});

/**
 * An Item-shaped fixture.
 *
 * Takes a `CardId` rather than an `ItemId` because half of these are Karty
 * Zdarzeń — Święty Graal and the Srebrna Strzała were never on the Wyposażenie
 * sheet — and 16.6 is exactly the rule that lets a drawn card be held like a
 * bought one. The cast is the fixture admitting it is a fixture.
 */
const item = (id: CardId, over: Partial<Item> = {}): Item => ({
  id: id as Item["id"],
  set: "base",
  name: id.toUpperCase(),
  source: { sheet: "test", index: 1 },
  text: "",
  ...over,
});

const held = (cardId: string, kind: Holding["kind"] = "item"): Holding => ({
  cardId,
  kind,
  face: "open",
});

describe("spell capacity (2.6)", () => {
  it("follows the printed table", () => {
    expect([1, 2, 3, 4, 5, 6].map(spellCapacity)).toEqual([0, 1, 2, 2, 3, 3]);
  });

  it("caps at three however high Magia climbs", () => {
    expect(spellCapacity(7)).toBe(3);
    expect(spellCapacity(20)).toBe(3);
  });

  it("gives nothing at zero", () => {
    expect(spellCapacity(0)).toBe(0);
  });
});

describe("totals (1.5, 2.5)", () => {
  const items = new Map([
    ["srebrna-strzala", item("srebrna-strzala", { miecz: 1, magia: 1, magical: true })],
    ["miecz", item("miecz", { miecz: 1 })],
  ]);

  it("adds item bonuses to own points without storing them", () => {
    const s = seat({ holdings: [held("srebrna-strzala"), held("miecz")] });
    const totals = totalsFor(s, items);
    expect(totals.miecz).toBe(5); // 3 own + 1 + 1
    expect(totals.magia).toBe(3); // 2 own + 1
    expect(s.swordOwn).toBe(3); // untouched
  });

  it("ignores trophies, which are kept to trade for Miecz later (1.4)", () => {
    const s = seat({ holdings: [held("miecz", "trophy")] });
    expect(totalsFor(s, items).miecz).toBe(3);
  });

  it("suspends magical items on Zaczarowane Wzgórza but keeps ordinary ones", () => {
    const s = seat({ holdings: [held("srebrna-strzala"), held("miecz")] });
    const totals = totalsFor(s, items, { suppressMagicalItems: true });
    expect(totals.miecz).toBe(4); // the magical Srebrna Strzała stops counting
    expect(totals.magia).toBe(2);
  });

  it("recomputes spell capacity from the total, not from own Magia", () => {
    const ring = new Map([["pierscien-mocy", item("pierscien-mocy", { magia: 3 })]]);
    const s = seat({ magicOwn: 2, holdings: [held("pierscien-mocy")] });
    expect(totalsFor(s, ring).spellCapacity).toBe(spellCapacity(5));
  });
});

describe("the Różdżka Zaklęć (2.6)", () => {
  const none = [] as const;
  const wand = abilitiesOf("rozdzka-zaklec");

  it("changes nothing for a hand that has no wand", () => {
    expect(spellAllowance(3, 2, none)).toBe(spellCapacity(3));
    expect(spellAllowance(1, 0, none)).toBe(0);
  });

  it("is a floor under the table, not an addition to it", () => {
    // "conajmniej 1 Zaklęcie więcej, niż liczba Zaklęć, z jaką rozpoczął grę".
    // A Mag on Magia 5 starts with two and already reaches the table's ceiling
    // of three, so the wand is worth nothing to him — read as "+1" it would
    // have handed him a fourth, off a table whose highest row says three.
    expect(spellAllowance(5, 2, wand)).toBe(3);
    expect(spellAllowance(6, 2, wand)).toBe(3);
  });

  it("is measured from the hand dealt at setup", () => {
    // Czarodziej: two at setup, Magia 4 — the table allows two, the wand a
    // third. This is the case the card was printed for.
    expect(spellCapacity(4)).toBe(2);
    expect(spellAllowance(4, 2, wand)).toBe(3);
  });

  it("is worth most at the bottom of the table", () => {
    // Barbarzyńca: Magia 1, nothing at setup. No spells at all by 2.6, and one
    // with the wand — which is the difference between a hand and no hand.
    expect(spellCapacity(1)).toBe(0);
    expect(spellAllowance(1, 0, wand)).toBe(1);
  });

  it("reaches the same answer through a seat's holdings", () => {
    const s = seat({ magicOwn: 4, holdings: [held("rozdzka-zaklec")] });
    expect(totalsFor(s, new Map()).spellCapacity).toBe(2); // no setup hand given
    expect(totalsFor(s, new Map(), { startingSpells: 2 }).spellCapacity).toBe(3);
  });
});

describe("own points floor (1.3, 2.3)", () => {
  it("cannot be pushed below the starting value", () => {
    const s = seat({ swordOwn: 4, swordFloor: 3 });
    expect(adjustOwn(s, "sword", -5).swordOwn).toBe(3);
  });

  it("still allows gains", () => {
    expect(adjustOwn(seat(), "sword", 2).swordOwn).toBe(5);
  });
});

describe("life (4.2, 4.6, 4.7)", () => {
  it("heals only back to the starting four", () => {
    expect(heal(seat({ life: 1 }), 10).life).toBe(4);
  });

  it("lets gains from encounters exceed four", () => {
    expect(gainLife(seat({ life: 4 }), 2).life).toBe(6);
  });

  it("does not claw back a total already above the ceiling", () => {
    expect(heal(seat({ life: 6 }), 1).life).toBe(6);
  });
});

describe("carrying limit (5.4)", () => {
  it("is four without transport", () => {
    expect(carryLimit([held("miecz"), held("helm")])).toBe(BASE_CARRY_LIMIT);
  });

  it("is raised by exactly what the transport card says it carries", () => {
    // "Koń może nieść 8 twoich Przedmiotów", "Muł będzie ... niósł twoje 4".
    // Not unlimited: reading 5.4's "unless the character has transport" as
    // unlimited gave away far more than any of these cards offer.
    expect(carryLimit([held("kon")])).toBe(BASE_CARRY_LIMIT + 8);
    expect(carryLimit([held("mul")])).toBe(BASE_CARRY_LIMIT + 4);
  });

  it("is raised by Tragarz even though he is a Friend, not an item", () => {
    expect(carryLimit([held("tragarz", "friend")])).toBe(BASE_CARRY_LIMIT + 4);
  });

  it("adds up when a character has more than one", () => {
    expect(carryLimit([held("kon"), held("tragarz", "friend")])).toBe(
      BASE_CARRY_LIMIT + 12,
    );
  });

  it("is unlimited only for the Zaprzęg, which is the only card that says so", () => {
    expect(carryLimit([held("zaprzeg")])).toBe(Infinity);
  });

  it("is not lifted by a transport card held only as a trophy", () => {
    expect(carryLimit([held("kon", "trophy")])).toBe(BASE_CARRY_LIMIT);
  });
});

describe("nature gating (5.3)", () => {
  const grail = item("swiety-graal", { forbiddenTo: ["evil", "chaotic"] });

  it("keeps a forbidden item away from the wrong nature", () => {
    expect(mayHold(grail, "evil")).toBe(false);
  });

  it("allows the permitted nature", () => {
    expect(mayHold(grail, "good")).toBe(true);
  });

  it("allows anything unrestricted", () => {
    expect(mayHold(item("miecz"), "evil")).toBe(true);
  });
});

describe("excess spells (9.4)", () => {
  it("reports how many must be discarded", () => {
    const s = seat({
      magicOwn: 2,
      holdings: [held("a", "spell"), held("b", "spell"), held("c", "spell")],
    });
    // Magia 2 allows one spell; three are held.
    expect(excessSpells(s, totalsFor(s, new Map()))).toBe(2);
  });

  it("is zero when within the limit", () => {
    const s = seat({ magicOwn: 5, holdings: [held("a", "spell")] });
    expect(excessSpells(s, totalsFor(s, new Map()))).toBe(0);
  });
});

describe("combat (17.4, 17.10, 18.2)", () => {
  const side = (label: string, total: number, roll: number) => ({ label, total, roll });

  it("gives it to the higher sum", () => {
    const r = compareCombat(side("A", 5, 3), side("B", 4, 2), "ordinary");
    expect(r).toMatchObject({ outcome: "wygrana", winner: "A", loser: "B" });
  });

  it("treats an equal sum as a draw where nobody loses anything", () => {
    const r = compareCombat(side("A", 5, 2), side("B", 4, 3), "ordinary");
    expect(r).toEqual({ outcome: "remis", kind: "ordinary" });
  });

  it("compares sums, not raw totals — a big roll beats a bigger sword", () => {
    const r = compareCombat(side("A", 3, 6), side("B", 6, 2), "ordinary"); // 9 vs 8
    expect(r).toMatchObject({ outcome: "wygrana", winner: "A" });
  });

  it("sums several attackers into one opponent (17.5)", () => {
    expect(combinedEnemyTotal([{ total: 3 }, { total: 4 }, { total: 2 }])).toBe(9);
  });

  it("makes the lost life unpreventable in magical combat only", () => {
    expect(spoilsFor("ordinary").preventable).toBe(true);
    expect(spoilsFor("magical").preventable).toBe(false);
  });
});

describe("the Beast (14.7)", () => {
  it("scales from 10 to 15 across the die", () => {
    expect([1, 2, 3, 4, 5, 6].map(beastStrength)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("fights ordinarily on 1-3 and magically on 4-6", () => {
    expect([1, 2, 3].map(beastCombatKind)).toEqual(["ordinary", "ordinary", "ordinary"]);
    expect([4, 5, 6].map(beastCombatKind)).toEqual(["magical", "magical", "magical"]);
  });
});

describe("card resolution order (15.2, 16.4)", () => {
  it("resolves by ascending class numeral", () => {
    const drawn = [
      { cardId: "gold", cardClass: "item" as const },
      { cardId: "niedzwiedz", cardClass: "foe" as const },
      { cardId: "sciezka", cardClass: "encounter" as const },
    ];
    expect(resolutionOrder(drawn).map((c) => c.cardId)).toEqual([
      "sciezka",
      "niedzwiedz",
      "gold",
    ]);
  });

  it("keeps draw order within one class", () => {
    const drawn = [
      { cardId: "a", cardClass: "foe" as const },
      { cardId: "b", cardClass: "foe" as const },
    ];
    expect(resolutionOrder(drawn).map((c) => c.cardId)).toEqual(["a", "b"]);
  });
});

describe("scripted randomness", () => {
  it("refuses an unexpected extra roll rather than inventing one", async () => {
    const random = scriptedRandom([4]);
    await random.rollD6("first");
    await expect(random.rollD6("second")).rejects.toThrow(/exhausted/);
  });
});

describe("the Beast in full (14.7, 22)", () => {
  it("scales strength from the die, 10 through 15", () => {
    expect([1, 6].map(beastStrength)).toEqual([10, 15]);
  });

  it("is beatable by a strong enough character", () => {
    // Miecz 12 plus a 6 beats a Beast of 10 plus a 1.
    const r = compareCombat(
      { label: "Postać", total: 12, roll: 6 },
      { label: "Bestia", total: beastStrength(1), roll: 1 },
      "ordinary",
    );
    expect(r).toMatchObject({ outcome: "wygrana" });
  });

  it("is unbeatable by a starting character, which is the point of the game", () => {
    // Barbarzyńca opens on Miecz 5, the highest in the box. Against the weakest
    // Beast (10) rolling its worst, a maximum roll still only draws: 5+6 = 11
    // against 10+1 = 11. A fresh character literally cannot win, which is why
    // the game is a journey to get stronger first.
    const best = compareCombat(
      { label: "Postać", total: 5, roll: 6 },
      { label: "Bestia", total: beastStrength(1), roll: 1 },
      "ordinary",
    );
    expect(best.outcome).toBe("remis");
    const typical = compareCombat(
      { label: "Postać", total: 5, roll: 3 },
      { label: "Bestia", total: beastStrength(3), roll: 3 },
      "ordinary",
    );
    expect(typical.outcome).toBe("przegrana");
  });
});
