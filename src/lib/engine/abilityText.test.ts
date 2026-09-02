import { describe, expect, it } from "vitest";
import { forbiddenNatures, itemProfile, visitWhen, whenApplies } from "./abilityText";
import { owesAFrame } from "./kolejka";
import { classOf } from "./cards";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

describe("what an item gives, and when", () => {
  /**
   * Both conditions, because they are independent: a MIECZ has to be in your
   * hand *and* only counts once somebody swings, and neither implies the other.
   */
  it("reads a flat bonus, where it is worn and when it counts", () => {
    const miecz = itemProfile("miecz", "slots");
    expect(miecz.slotLabel).toBe("Ręka główna");
    expect(miecz.facts).toEqual([
      { kind: "punkty", what: "+1 Miecza", when: ["gdy założony", "tylko w walce (1.5)"] },
    ]);
  });

  it("keeps the fight condition in klasyczny, where nothing is worn", () => {
    // A property of the card and not of the variant: 5.4 has one kind of
    // possession, and the Miecz still says „podczas walki".
    expect(itemProfile("miecz", "classic").facts[0].when).toEqual(["tylko w walce (1.5)"]);
  });

  it("says only where it must be for something always on", () => {
    // PIERŚCIEŃ MOCY „dodaje właścicielowi 2 punkty Magii" — no „w walce", and
    // after the weapons were corrected it is the only item in the box that is
    // both wearable and always on.
    expect(itemProfile("pierscien-mocy", "slots").facts[0].when).toEqual(["gdy założony"]);
  });

  /** 6.3 gives a Przyjaciel no place on the body, so he only ever has the one. */
  it("says only when it counts for a Przyjaciel", () => {
    for (const id of ["giermek", "krzyzowiec"]) {
      expect(itemProfile(id, "slots").facts[0].when, id).toEqual(["tylko w walce (1.5)"]);
    }
  });

  it("says nothing about where an item must be when there is no condition", () => {
    // 5.4 has one kind of possession: a Miecz in the pack is a Miecz. Only the
    // slotted variant makes wearing it a condition, and a label that is true of
    // almost every card tells a player nothing.
    // The Łódź is not worn anywhere and lends no points, so it has neither.
    expect(itemProfile("lodz", "classic").facts.every((one) => one.when.length === 0)).toBe(true);
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
    // Neither of the Rumak's two is a `punkty`, so both carry only the place —
    // and both already say "in a fight" in their own text.
    for (const fact of rumak.facts) expect(fact.when).toEqual(["gdy założony"]);
  });

  it("says carrying capacity is added to the four, not a cap of its own", () => {
    // carryLimit adds: base four plus the Koń's eight is twelve. "Do 8" said
    // the opposite, and the card agrees with the engine — lose the horse and
    // you leave whatever you cannot carry yourself.
    const kon = itemProfile("kon", "slots");
    expect(kon.facts[0].what).toBe("+8 Przedmiotów ponad limit (5.4)");
    expect(kon.facts[0].when).toEqual(["gdy założony"]);
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

  /**
   * The fight label is read off `tylkoWalka` rather than guessed from the
   * ability's kind, which is what was wrong with the version that was removed:
   * it annotated the Tarcza and not the Sztylet, and the difference it implied
   * between them was not real.
   */
  it("labels a card by its own data, not by the kind of its ability", () => {
    const shield = { kind: "oslona", upTo: 2 } as const;
    expect(whenApplies(shield, "tarcza", "classic")).toEqual([]);
    expect(whenApplies(shield, "tarcza", "slots")).toEqual(["gdy założony"]);
    // Same kind, same card, and the flag is what decides.
    expect(whenApplies({ kind: "punkty", miecz: 1 }, "sztylet", "slots")).toEqual([
      "gdy założony",
    ]);
    expect(
      whenApplies({ kind: "punkty", miecz: 1, tylkoWalka: true }, "sztylet", "slots"),
    ).toEqual(["gdy założony", "tylko w walce (1.5)"]);
  });

  it("says a carried-only item works from the pack even in slotowy", () => {
    // Nothing wearable about it, so there is no slot to require.
    expect(
      itemProfile("tajemnicza-szkatula", "slots").facts.every(
        (one) => !one.when.includes("gdy założony"),
      ),
    ).toBe(true);
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
    expect(itemProfile("swieta-wlocznia").requirements[0].when).toEqual(["warunek"]);
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

/**
 * 13.5's line, said beside the picture: „Do niektórych instrukcji Postać musi
 * się zastosować, do innych może, jeśli ma ochotę."
 */
describe("what a Nieznajomy or a Miejsce asks of you", () => {
  it("marks a Karta whose instruction is binding", () => {
    // "Jeżeli do niej trafisz, będziesz musiał rzucić kostką" — no choice in it.
    expect(visitWhen("urocza-diablica")).toEqual(["obowiązkowe (16.5)"]);
    // A Miejsce says the same thing under its own number.
    expect(visitWhen("labirynt")).toEqual(["obowiązkowe (16.7)"]);
  });

  /**
   * The two ways a choice can be lost, which is why there is a second label.
   * A CZARODZIEJ stays on the Obszar to the end of the game, so declining him
   * in the kolejka costs nothing; a KUGLARZ is "odłóż jego Kartę" whether you
   * took the offer or not.
   */
  it("says which kind of choice it is", () => {
    expect(visitWhen("czarodziej")).toEqual(["do wyboru (13.5)", "w każdej chwili tury (12.1)"]);
    expect(visitWhen("kuglarz")).toEqual(["do wyboru (13.5)", "teraz albo wcale"]);
  });

  /** Every other class: 16.1 and 16.2 are plain, and a Przedmiot has its own lines. */
  it("says nothing about a class the question does not fit", () => {
    expect(visitWhen("wilk")).toEqual([]);
    expect(visitWhen("miecz")).toEqual([]);
  });

  it("is carried on the profile, for the panel beside the picture", () => {
    expect(itemProfile("targowisko").visit[0]).toBe("do wyboru (13.5)");
  });

  /**
   * The invariant, and the reason `mayWalkPast` is exported rather than copied:
   * a label reading „do wyboru" on a Karta the kolejka then stops the turn for
   * is worse than no label at all.
   */
  it("agrees with the kolejka on every Karta in the box", () => {
    for (const card of events as EventCard[]) {
      const labels = visitWhen(card.id);
      if (labels.length === 0) continue;
      const cardClass = classOf(card.id);
      if (!cardClass) continue;
      expect(owesAFrame({ cardId: card.id, cardClass }), card.name).toBe(
        labels[0].startsWith("obowiązkowe"),
      );
    }
  });
});
