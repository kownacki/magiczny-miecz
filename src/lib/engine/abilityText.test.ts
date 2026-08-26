import { describe, expect, it } from "vitest";
import { forbiddenNatures, itemProfile, whenApplies } from "./abilityText";

describe("what an item gives, and when", () => {
  it("reads a flat bonus and where it is worn", () => {
    const miecz = itemProfile("miecz", "slots");
    expect(miecz.slotLabel).toBe("Ręka główna");
    expect(miecz.facts).toEqual([
      { kind: "punkty", what: "+1 Miecza", when: "gdy założony" },
    ]);
  });

  it("says nothing about where an item must be when there is no condition", () => {
    // 5.4 has one kind of possession: a Miecz in the pack is a Miecz. Only the
    // slotted variant makes wearing it a condition, and a label that is true of
    // almost every card tells a player nothing.
    expect(itemProfile("miecz", "classic").facts[0].when).toBeNull();
  });

  it("knows the Bojowy Rumak's two rules and that both are combat-only", () => {
    const rumak = itemProfile("bojowy-rumak", "slots");
    expect(rumak.slotLabel).toBe("Wierzchowiec");
    expect(rumak.facts.map((fact) => fact.kind)).toEqual([
      "magia-do-miecza",
      "ginie-zamiast-ciebie",
    ]);
    expect(rumak.facts[0].what).toContain("Magii");
    // The label says WHERE it has to be and nothing else. That it only matters
    // in a fight is already in the text of both lines, so repeating it added
    // nothing — and it was only ever added to four hand-picked kinds, which
    // made the other seventeen look like they applied at moments they do not.
    for (const fact of rumak.facts) expect(fact.when).toBe("gdy założony");
  });

  it("says carrying capacity is added to the four, not a cap of its own", () => {
    // carryLimit adds: base four plus the Koń's eight is twelve. "Do 8" said
    // the opposite, and the card agrees with the engine — lose the horse and
    // you leave whatever you cannot carry yourself.
    const kon = itemProfile("kon", "slots");
    expect(kon.facts[0].what).toBe("+8 Przedmiotów ponad limit (5.4)");
    expect(kon.facts[0].when).toBe("gdy założony");
    // The Muł takes the few-form, which Polish spells differently.
    expect(itemProfile("mul").facts[0].what).toBe("+4 Przedmioty ponad limit (5.4)");
  });

  it("has nothing to say about a card with no formalised rules", () => {
    // Absence is normal: a card the app carries no rule for still works, its
    // text is shown, and the players apply it.
    const profile = itemProfile("nie-ma-takiej", "slots");
    expect(profile.facts).toEqual([]);
    expect(profile.slotLabel).toBeNull();
  });

  it("gives a carried-only item no slot", () => {
    expect(itemProfile("1-sztuka-zlota", "slots").slotLabel).toBeNull();
  });

  it("labels only where a card must be, never when it fires", () => {
    // A Sztylet's +1 Miecza matters only in a fight too, and never carried a
    // combat label — so annotating the Tarcza and not the Sztylet was telling
    // the player something untrue about the difference between them.
    expect(whenApplies({ kind: "oslona", upTo: 2 }, "tarcza", "classic")).toBeNull();
    expect(whenApplies({ kind: "oslona", upTo: 2 }, "tarcza", "slots")).toBe("gdy założony");
    expect(whenApplies({ kind: "punkty", miecz: 1 }, "sztylet", "slots")).toBe("gdy założony");
  });

  it("says a carried-only item works from the pack even in slotowy", () => {
    // Nothing wearable about it, so there is no slot to require.
    expect(itemProfile("tajemnicza-szkatula", "slots").facts.every((f) => f.when !== "gdy założony")).toBe(true);
  });
});

describe("what an item asks of you (5.3)", () => {
  it("keeps a requirement apart from the bonuses", () => {
    const spear = itemProfile("swieta-wlocznia", "classic");
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
    expect(forbiddenNatures("swieta-wlocznia")).toEqual(["evil"]);
    expect(forbiddenNatures("swiety-graal")).toEqual(["evil"]);
    expect(forbiddenNatures("miecz-chaosu")).toEqual(["good"]);
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
