import { describe, expect, it } from "vitest";
import {
  BASE_CARRY_LIMIT,
  adjustOwn,
  carryLimit,
  excessSpells,
  heal,
  gainLife,
  mayHold,
  spellCapacity,
  totalsFor,
} from "./derive";
import {
  beastCombatKind,
  beastStrength,
  combinedEnemyTotal,
  compareCombat,
  resolveCombat,
  spoilsFor,
} from "./combat";
import { resolutionOrder } from "./state";
import { scriptedRandom } from "./ports";
import type { Item } from "@/data/types";
import type { Holding, Seat } from "./state";

const seat = (over: Partial<Seat> = {}): Seat => ({
  id: "s1",
  index: 0,
  name: "Zaurak",
  characterId: "krasnolud",
  fieldId: "karczma",
  mieczOwn: 3,
  magiaOwn: 2,
  mieczFloor: 3,
  magiaFloor: 2,
  zycie: 4,
  zloto: 1,
  nature: "dobra",
  turnsLost: 0,
  stoneUntilTurn: null,
  eliminated: false,
  holdings: [],
  ...over,
});

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
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
    expect(s.mieczOwn).toBe(3); // untouched
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
    const ring = new Map([["pierscien", item("pierscien", { magia: 3 })]]);
    const s = seat({ magiaOwn: 2, holdings: [held("pierscien")] });
    expect(totalsFor(s, ring).spellCapacity).toBe(spellCapacity(5));
  });
});

describe("own points floor (1.3, 2.3)", () => {
  it("cannot be pushed below the starting value", () => {
    const s = seat({ mieczOwn: 4, mieczFloor: 3 });
    expect(adjustOwn(s, "miecz", -5).mieczOwn).toBe(3);
  });

  it("still allows gains", () => {
    expect(adjustOwn(seat(), "miecz", 2).mieczOwn).toBe(5);
  });
});

describe("life (4.2, 4.6, 4.7)", () => {
  it("heals only back to the starting four", () => {
    expect(heal(seat({ zycie: 1 }), 10).zycie).toBe(4);
  });

  it("lets gains from encounters exceed four", () => {
    expect(gainLife(seat({ zycie: 4 }), 2).zycie).toBe(6);
  });

  it("does not claw back a total already above the ceiling", () => {
    expect(heal(seat({ zycie: 6 }), 1).zycie).toBe(6);
  });
});

describe("carrying limit (5.4)", () => {
  it("is four without transport", () => {
    expect(carryLimit([held("miecz"), held("helm")])).toBe(BASE_CARRY_LIMIT);
  });

  it("is lifted by a horse", () => {
    expect(carryLimit([held("kon")])).toBe(Infinity);
  });

  it("is lifted by Tragarz even though he is a Friend, not an item", () => {
    expect(carryLimit([held("tragarz", "friend")])).toBe(Infinity);
  });

  it("is not lifted by a transport card held only as a trophy", () => {
    expect(carryLimit([held("kon", "trophy")])).toBe(BASE_CARRY_LIMIT);
  });
});

describe("nature gating (5.3)", () => {
  const grail = item("swiety-graal", { forbiddenTo: ["zla", "chaotyczna"] });

  it("keeps a forbidden item away from the wrong nature", () => {
    expect(mayHold(grail, "zla")).toBe(false);
  });

  it("allows the permitted nature", () => {
    expect(mayHold(grail, "dobra")).toBe(true);
  });

  it("allows anything unrestricted", () => {
    expect(mayHold(item("miecz"), "zla")).toBe(true);
  });
});

describe("excess spells (9.4)", () => {
  it("reports how many must be discarded", () => {
    const s = seat({
      magiaOwn: 2,
      holdings: [held("a", "spell"), held("b", "spell"), held("c", "spell")],
    });
    // Magia 2 allows one spell; three are held.
    expect(excessSpells(s, totalsFor(s, new Map()))).toBe(2);
  });

  it("is zero when within the limit", () => {
    const s = seat({ magiaOwn: 5, holdings: [held("a", "spell")] });
    expect(excessSpells(s, totalsFor(s, new Map()))).toBe(0);
  });
});

describe("combat (17.4, 17.10, 18.2)", () => {
  const side = (label: string, total: number, roll: number) => ({ label, total, roll });

  it("gives it to the higher sum", () => {
    const r = compareCombat(side("A", 5, 3), side("B", 4, 2), "zwykla");
    expect(r).toMatchObject({ outcome: "wygrana", winner: "A", loser: "B" });
  });

  it("treats an equal sum as a draw where nobody loses anything", () => {
    const r = compareCombat(side("A", 5, 2), side("B", 4, 3), "zwykla");
    expect(r).toEqual({ outcome: "remis", kind: "zwykla" });
  });

  it("compares sums, not raw totals — a big roll beats a bigger sword", () => {
    const r = compareCombat(side("A", 3, 6), side("B", 6, 2), "zwykla"); // 9 vs 8
    expect(r).toMatchObject({ outcome: "wygrana", winner: "A" });
  });

  it("sums several attackers into one opponent (17.5)", () => {
    expect(combinedEnemyTotal([{ total: 3 }, { total: 4 }, { total: 2 }])).toBe(9);
  });

  it("makes the lost life unpreventable in magical combat only", () => {
    expect(spoilsFor("zwykla").preventable).toBe(true);
    expect(spoilsFor("magiczna").preventable).toBe(false);
  });

  it("takes the attacker's roll first (17.8)", async () => {
    const { result, attackerRoll, defenderRoll } = await resolveCombat(
      { attacker: { label: "A", total: 3 }, defender: { label: "B", total: 3 }, kind: "zwykla" },
      scriptedRandom([6, 1]),
    );
    expect(attackerRoll).toBe(6);
    expect(defenderRoll).toBe(1);
    expect(result).toMatchObject({ outcome: "wygrana", winner: "A" });
  });
});

describe("the Beast (14.7)", () => {
  it("scales from 10 to 15 across the die", () => {
    expect([1, 2, 3, 4, 5, 6].map(beastStrength)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("fights ordinarily on 1-3 and magically on 4-6", () => {
    expect([1, 2, 3].map(beastCombatKind)).toEqual(["zwykla", "zwykla", "zwykla"]);
    expect([4, 5, 6].map(beastCombatKind)).toEqual(["magiczna", "magiczna", "magiczna"]);
  });
});

describe("card resolution order (15.2, 16.4)", () => {
  it("resolves by ascending class numeral", () => {
    const drawn = [
      { cardId: "zloto", cardClass: "przedmiot" as const },
      { cardId: "niedzwiedz", cardClass: "wrog" as const },
      { cardId: "sciezka", cardClass: "spotkanie" as const },
    ];
    expect(resolutionOrder(drawn).map((c) => c.cardId)).toEqual([
      "sciezka",
      "niedzwiedz",
      "zloto",
    ]);
  });

  it("keeps draw order within one class", () => {
    const drawn = [
      { cardId: "a", cardClass: "wrog" as const },
      { cardId: "b", cardClass: "wrog" as const },
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
      "zwykla",
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
      "zwykla",
    );
    expect(best.outcome).toBe("remis");
    const typical = compareCombat(
      { label: "Postać", total: 5, roll: 3 },
      { label: "Bestia", total: beastStrength(3), roll: 3 },
      "zwykla",
    );
    expect(typical.outcome).toBe("przegrana");
  });
});
