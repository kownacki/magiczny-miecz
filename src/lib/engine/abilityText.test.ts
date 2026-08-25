import { describe, expect, it } from "vitest";
import { forbiddenNatures, itemProfile, whenApplies } from "./abilityText";

describe("what an item gives, and when", () => {
  it("reads a flat bonus and where it is worn", () => {
    const miecz = itemProfile("miecz", "slotowy");
    expect(miecz.slotLabel).toBe("Ręka główna");
    expect(miecz.facts).toEqual([
      { kind: "punkty", what: "+1 Miecza", when: "gdy założony" },
    ]);
  });

  it("says the same item works from the pack in klasyczny", () => {
    // 5.4 has one kind of possession: a Miecz in the pack is a Miecz. Only the
    // slotted variant makes wearing it the condition.
    expect(itemProfile("miecz", "klasyczny").facts[0].when).toBe("w plecaku");
  });

  it("knows the Bojowy Rumak's two rules and that both are combat-only", () => {
    const rumak = itemProfile("bojowy-rumak", "slotowy");
    expect(rumak.slotLabel).toBe("Wierzchowiec");
    expect(rumak.facts.map((fact) => fact.kind)).toEqual([
      "magia-do-miecza",
      "ginie-zamiast-ciebie",
    ]);
    expect(rumak.facts[0].what).toContain("Magii");
    // Both halves are said, because they are independent questions: it has to
    // be worn AND it only matters in a fight. Saying only one left the player
    // guessing about the other.
    for (const fact of rumak.facts) expect(fact.when).toBe("w walce, gdy założony");
  });

  it("says carrying capacity is added to the four, not a cap of its own", () => {
    // carryLimit adds: base four plus the Koń's eight is twelve. "Do 8" said
    // the opposite, and the card agrees with the engine — lose the horse and
    // you leave whatever you cannot carry yourself.
    const kon = itemProfile("kon", "slotowy");
    expect(kon.facts[0].what).toBe("+8 Przedmiotów ponad limit (5.4)");
    expect(kon.facts[0].when).toBe("gdy założony");
    // The Muł takes the few-form, which Polish spells differently.
    expect(itemProfile("mul").facts[0].what).toBe("+4 Przedmioty ponad limit (5.4)");
  });

  it("has nothing to say about a card with no formalised rules", () => {
    // Absence is normal: a card the app carries no rule for still works, its
    // text is shown, and the players apply it.
    const profile = itemProfile("nie-ma-takiej", "slotowy");
    expect(profile.facts).toEqual([]);
    expect(profile.slotLabel).toBeNull();
  });

  it("gives a carried-only item no slot", () => {
    expect(itemProfile("1-sztuka-zlota", "slotowy").slotLabel).toBeNull();
  });

  it("keeps a fight-only rule combat-only in both variants, and adds the slot in one", () => {
    // Klasyczny has no places to wear anything, so there is nothing to add.
    expect(whenApplies({ kind: "oslona", upTo: 2 }, "tarcza", "klasyczny")).toBe("w walce");
    expect(whenApplies({ kind: "oslona", upTo: 2 }, "tarcza", "slotowy")).toBe(
      "w walce, gdy założony",
    );
  });

  it("says a carried-only item works from the pack even in slotowy", () => {
    // Nothing wearable about it, so there is no slot to require.
    expect(itemProfile("tajemnicza-szkatula", "slotowy").facts.every((f) => f.when !== "gdy założony")).toBe(true);
  });
});

describe("what an item asks of you (5.3)", () => {
  it("keeps a requirement apart from the bonuses", () => {
    const spear = itemProfile("swieta-wlocznia", "klasyczny");
    expect(spear.requirements.map((need) => need.what)).toEqual([
      "tylko Postać: dobra lub chaotyczna (5.3)",
    ]);
    // The bonus is still a bonus, and is not repeated among the requirements.
    expect(spear.facts.map((fact) => fact.what)).toEqual(["+1 Miecza"]);
  });

  it("calls a requirement a condition rather than a moment", () => {
    expect(itemProfile("swieta-wlocznia").requirements[0].when).toBe("warunek");
  });

  it("names the Natures each restricted card shuts out", () => {
    // The three the deck actually restricts, stated as who may NOT hold it.
    expect(forbiddenNatures("swieta-wlocznia")).toEqual(["zla"]);
    expect(forbiddenNatures("swiety-graal")).toEqual(["zla"]);
    expect(forbiddenNatures("miecz-chaosu")).toEqual(["dobra"]);
  });

  it("restricts nothing else", () => {
    expect(forbiddenNatures("miecz")).toBeUndefined();
    expect(forbiddenNatures("nie-ma-takiej")).toBeUndefined();
  });
});

describe("what using a card does", () => {
  it("says a one-shot effect and where the card goes", () => {
    const gold = itemProfile("1-sztuka-zlota");
    expect(gold.special).toEqual(["+1 Złota", "Odłóż Kartę na stos użytych."]);
    // Not a standing bonus: nothing is gained by holding it, because it is
    // never held.
    expect(gold.facts).toEqual([]);
  });

  it("describes a branching effect rather than skipping it", () => {
    // The picture is not always there — a fresh checkout has no scans — so a
    // rule the app carries has to be sayable without one.
    const box = itemProfile("tajemnicza-szkatula");
    expect(box.special.join(" ")).toMatch(/rzut kostką/);
  });

  it("writes out the rules no typed kind can hold", () => {
    const mirror = itemProfile("zwierciadlo-zniszczenia");
    expect(mirror.notes).toHaveLength(1);
    expect(mirror.notes[0]).toContain("Miecza");
  });

  it("says the Relikwiarz's condition, not just its protection", () => {
    // Dropping the Natura read as sparing everyone at both fields.
    const said = itemProfile("relikwiarz").facts.map((f) => f.what);
    expect(said[0]).toContain("jeśli dobra");
    expect(said[1]).toContain("jeśli zła");
    // And the third rule, which nothing modelled at all.
    expect(said[2]).toContain("Demony");
  });

  it("says nothing at all for a card with no script", () => {
    expect(itemProfile("miecz").special).toEqual([]);
  });
});
