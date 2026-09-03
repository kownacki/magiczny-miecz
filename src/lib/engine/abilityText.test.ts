import { describe, expect, it } from "vitest";
import {
  describeAggression,
  previewOf,
  forbiddenNatures,
  itemProfile,
  requirementOf,
  staysAs,
  whenApplies,
} from "./abilityText";

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
    expect(box.special.join(" ")).toMatch(/rzuć kostką/);
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
 * How long a Nieznajomy or a Miejsce is here — the one thing that varies
 * between them, since 16.5 and 16.7 bind the instruction on all of them.
 */
describe("how long a Nieznajomy or a Miejsce stays", () => {
  it("tells the three shapes apart", () => {
    // „Bez względu na to, czy skorzystasz z propozycji… odłóż jego Kartę."
    expect(staysAs("kuglarz")).toBe("jednorazowa — potem wraca na stos");
    // She waits for the first Dobra Postać, not for the first Postać.
    expect(staysAs("wrozka")).toBe(
      "czeka na Obszarze na pierwszą Postać, która spełni warunki — potem wraca na stos",
    );
    // „Pierwszej Postaci, Eremita ofiaruje" — anybody's, so no clause.
    expect(staysAs("eremita")).toBe("czeka na Obszarze na pierwszą Postać — potem wraca na stos");
    // „Cudotwórca będzie mieszkał na tym Obszarze do końca rozgrywki."
    expect(staysAs("cudotworca")).toBe("zostaje na Obszarze do końca gry");
    // „połóż przy nim 4 punkty Życia… Po wykorzystaniu 4 punktów, Drzewo usycha."
    expect(staysAs("drzewo-zycia")).toBe("zostaje na Obszarze, dopóki się nie wyczerpie");
  });

  it("says nothing about a class the question does not fit", () => {
    expect(staysAs("wilk")).toBeNull();
    expect(staysAs("miecz")).toBeNull();
  });

  it("is carried on the profile, for the panel beside the picture", () => {
    expect(itemProfile("targowisko").visit).toBe("zostaje na Obszarze do końca gry");
  });
});

/**
 * The line a Przedmiot prints for 5.3, borrowed by the three Nieznajomi who
 * serve one Natura — different rules, one question for the person reading.
 */
describe("what a Karta asks of the character in front of it", () => {
  /** „Marcin (MAG) jest zły" — the adjective agrees with the Karta Postaci. */
  /** Your own Postać is not introduced to you, and „Postać" is feminine. */
  it("does not introduce the reader to their own Postać", () => {
    expect(
      requirementOf("wrozka", {
        nature: "evil",
        name: "Marcin (MAG)",
        gender: "m",
        mine: true,
      })?.detail,
    ).toBe("Twoja Postać jest zła");
  });

  it("names the Postać and agrees with its gender", () => {
    expect(
      requirementOf("wrozka", { nature: "evil", name: "Marcin (MAG)", gender: "m" })?.detail,
    ).toBe("Marcin (MAG) jest zły");
    expect(
      requirementOf("wrozka", { nature: "evil", name: "Ania (WIEDŹMA)", gender: "f" })?.detail,
    ).toBe("Ania (WIEDŹMA) jest zła");
  });

  it("reads a Nieznajomy's own condition, and says who passes", () => {
    // „Pierwszej Dobrej Postaci, która do niej zawita ofiaruje do wyboru…"
    expect(requirementOf("wrozka", "good")).toEqual({
      label: "tylko Postać",
      value: "dobra",
      // A wish is a gift, so meeting the condition is the good answer and the
      // panel colours the line green.
      valence: "korzysc",
      met: true,
      detail: "Twoja Postać jest dobra",
    });
    expect(requirementOf("wrozka", "evil")?.met).toBe(false);
    // Outside a game nobody is reading it, so neither colour is earned.
    expect(requirementOf("wrozka", null)?.met).toBeNull();
  });

  /** The one whose condition is in its script and whose disposition cannot fold it in. */
  it("gives the CZARODZIEJ a line of his own", () => {
    // „Każda Dobra Postać, która tu zawita, otrzyma 1 Zaklęcie" — he stays for
    // good, so there is no „czeka tu na pierwszą…" to say it inside.
    expect(requirementOf("czarodziej", "evil")?.met).toBe(false);
  });

  /** Said once: the disposition drops out of `special` where `staysAs` covers it. */
  it("does not print the disposition twice on a Nieznajomy", () => {
    expect(itemProfile("wrozka").special.join(" ")).not.toContain("czeka tu");
    expect(itemProfile("wrozka").visit).toContain("która spełni warunki");
  });

  it("still reads 5.3 off a Przedmiot", () => {
    const talizman = requirementOf("relikwiarz", "good");
    if (talizman) {
      expect(talizman.label).toBe("tylko Postać");
      // 5.3 is about holding a card, so a Przedmiot cites it and its number is
      // kept apart from the value: one is a hover, the other is a link.
      expect(talizman.rule).toBe("(5.3)");
      expect(talizman.value).not.toContain("5.3");
    }
  });

  it("says nothing where the Karta serves anybody", () => {
    expect(requirementOf("cudotworca", "evil")).toBeNull();
    // A Nieznajomy's condition is its Karta's, not the Instrukcja's.
    expect(requirementOf("wrozka", "good")?.rule).toBeUndefined();
    expect(requirementOf("wilk", "good")).toBeNull();
  });

  /**
   * A Nieznajomy's condition is not 5.3 and must not become it: the WRÓŻKA is
   * met perfectly legally by a Zła Postać — she simply does nothing and waits.
   */
  it("does not turn a Nieznajomy's condition into a rule about holding cards", () => {
    expect(forbiddenNatures("wrozka")).toBeUndefined();
  });
});

/**
 * The same line on a Spotkanie, where meeting the condition is usually the bad
 * news — which is the half the panel had wrong on every card that has one.
 */
describe("a Spotkanie's condition", () => {
  /**
   * „Może je wezwać każda **Zła** Postać", and the app said nothing at all.
   *
   * The requirement line wanted an absent `inaczej`; this card writes it as
   * „nic". `specialOf` accepted both and struck the condition out of the rows
   * on the strength of a line that was never drawn, so the one thing the card
   * is about appeared in neither place.
   */
  it("reads a gate written with an explicit do-nothing branch", () => {
    const evil = requirementOf("godzina-duchow", "evil");
    expect(evil?.label).toBe("tylko Postać");
    expect(evil?.value).toBe("zła");
    expect(evil?.met).toBe(true);
    // Said once: the rows below do not repeat it.
    expect(itemProfile("godzina-duchow").special.join(" ")).not.toContain("jeśli zła");
  });

  /**
   * A Natura on a Spotkanie names who suffers far more often than who may
   * help themselves, and „tylko" said the opposite of what the Karta says.
   */
  it("says a Karta reaches a Natura rather than admitting it", () => {
    const hit = requirementOf("zacmienie-slonc", "good");
    expect(hit?.label).toBe("dotyczy Postaci");
    // Genitive, because „dotyczy" governs one — „dotyczy Postaci: dobra" is the
    // word in the wrong shape.
    expect(hit?.value).toBe("dobrej lub chaotycznej");
    expect(hit?.met).toBe(true);
    expect(hit?.valence).toBe("strata");
  });

  /**
   * Which is what the colour is read off. A Dobra Postać meets ZAĆMIENIE's
   * condition and loses a turn for it; a Zła Postać fails it and keeps hers.
   * Green on the first was the panel congratulating her.
   */
  it("hands the panel the two answers it needs to colour the line", () => {
    const good = requirementOf("zacmienie-slonc", "good");
    const evil = requirementOf("zacmienie-slonc", "evil");
    expect([good?.met, good?.valence]).toEqual([true, "strata"]);
    expect([evil?.met, evil?.valence]).toEqual([false, "strata"]);
    // A Nieznajomy's gift is the other way round, in the same two fields.
    expect([requirementOf("wrozka", "good")?.met, requirementOf("wrozka", "good")?.valence]) //
      .toEqual([true, "korzysc"]);
  });

  /** Two live arms are content, not a gate: neither one is „tylko". */
  it("says nothing where both branches act", () => {
    for (const id of ["sabat-czarownic", "slup-ognia", "poslancy-bogow", "zatrute-ziola"]) {
      expect(requirementOf(id, "good"), id).toBeNull();
    }
  });
});

describe("what the summary beside the picture leaves out", () => {
  /**
   * The requirement line has already said „tylko Postać: dobra"; saying it
   * again as „Jeśli dobra:" pushes the six gifts a clause further from the eye.
   */
  /** Both conditions the requirement line states, and only those two. */
  it("does not repeat the condition the requirement line states", () => {
    // „Tylko Postać: uznany agresor" is already above it.
    expect(itemProfile("dobre-bostwo").special[0]).toBe("do wyboru:");
    // The Złodziej's second branch acts, so it is content and both halves stay.
    expect(itemProfile("zlodziej-dobroczynca").special).toHaveLength(2);
  });

  it("does not repeat the Natura the requirement line states", () => {
    const wrozka = itemProfile("wrozka").special;
    expect(wrozka.join(" ")).not.toContain("dobra:");
    // One row per gift, so six alternatives read as six things (15.2's own
    // sentence is a paragraph; this is a list).
    expect(wrozka[0]).toBe("do wyboru:");
    expect(wrozka[1]).toBe("— Zyskujesz 1 punkt Miecza");
    expect(wrozka).toHaveLength(7);
  });

  /** „Możesz je wybrać ze stosu" — the one Zaklęcie in the box that is chosen. */
  it("says the Półbóg's Zaklęcie is picked, not dealt", () => {
    expect(itemProfile("polbog").special.join(" ")).toContain("wybierasz 1 dowolne Zaklęcie ze stosu");
  });
});

/**
 * The Dobre Bóstwo, said as a requirement — the only Karta that asks what the
 * reader has done rather than what they are.
 */
describe("a Karta that accuses", () => {
  it("names the aggressor, and hangs the evidence off it", () => {
    const guilty = requirementOf("dobre-bostwo", {
      nature: "good",
      aggression: "Runda 3 — atak na Postać WIEDŹMA, Obszar Osada",
    });
    // „dotyczy Postaci uznanej za agresora" and not „tylko Postać", which read
    // as a qualification for something: the judgement costs a coin or a turn.
    expect(guilty?.label).toBe("dotyczy Postaci");
    expect(guilty?.value).toBe("uznanej za agresora");
    expect(guilty?.valence).toBe("strata");
    expect(guilty?.met).toBe(true);
    expect(guilty?.detail).toBe("Twoja Postać: Runda 3 — atak na Postać WIEDŹMA, Obszar Osada");
  });

  it("clears a Postać with nothing against them", () => {
    const clean = requirementOf("dobre-bostwo", { nature: "good", aggression: null });
    expect(clean?.met).toBe(false);
    // The acquittal in the card's own two limbs.
    expect(clean?.detail).toBe(
      "Twoja Postać jeszcze nigdy nie zaatakowała innej Postaci ani nie użyła " +
        "swoich zdolności na jej niekorzyść",
    );

    // Somebody else's, where „Postać" carries the agreement so no gender is needed.
    expect(
      requirementOf("dobre-bostwo", {
        nature: "good",
        aggression: null,
        name: "Marcin (BARBARZYŃCA)",
        gender: "m",
      })?.detail,
    ).toBe(
      "Marcin (BARBARZYŃCA) jeszcze nigdy nie zaatakował innej Postaci " +
        "ani nie użył swoich zdolności na jej niekorzyść",
    );

    // And the two Karty Postaci that are feminine take the other ending.
    expect(
      requirementOf("dobre-bostwo", {
        nature: "good",
        aggression: null,
        name: "Ania (WIEDŹMA)",
        gender: "f",
      })?.detail,
    ).toMatch(/^Ania \(WIEDŹMA\) jeszcze nigdy nie zaatakowała innej Postaci ani nie użyła/);
  });

  /** Outside a game nobody is reading it, so neither colour is earned. */
  it("says nothing either way when the reader is unknown", () => {
    expect(requirementOf("dobre-bostwo", { nature: null })?.met).toBeNull();
  });

  it("still reads a Natura off the cards that carry one", () => {
    expect(requirementOf("wrozka", { nature: "evil" })?.met).toBe(false);
  });
});

describe("describing one act of aggression", () => {
  it("says when, what and whom", () => {
    expect(
      describeAggression({ kind: "attacker", victim: "WIEDŹMA", where: "osada", round: 3, how: "atak" }),
    ).toBe("Runda 3 — atak na Postać WIEDŹMA, Obszar Osada");
  });

  /** 13.3 puts both on one Obszar; a Przyjaciel sent out would not. */
  it("names both Obszary when they differ", () => {
    expect(
      describeAggression({
        kind: "attacker",
        victim: "WIEDŹMA",
        where: "osada",
        victimWhere: "grod",
        round: 3,
        how: "atak",
      }),
    ).toContain("Obszar Osada → Gród");
  });

  /** A mark written before any of this existed still says what it said. */
  it("says what it can about a bare mark", () => {
    expect(describeAggression({ kind: "attacker" })).toBe("atak na inną Postać");
  });
});

/**
 * What an offer would leave you with. A choice between two rules is not a
 * choice until you know the numbers.
 */
describe("what one option would do to the numbers", () => {
  const barbarzynca = {
    sword: 6,
    magic: 2,
    life: 3,
    gold: 5,
    swordFloor: 6,
    magicFloor: 2,
  };

  it("says where a point lands", () => {
    expect(previewOf({ op: "punkty", stat: "sword", delta: 1 }, barbarzynca)).toBe("Miecz 6 → 7");
  });

  /**
   * 1.2–1.5: own points never fall below the starting values, so a swap that
   * would take a Barbarzyńca's Miecz to 2 does not — and the sheet must not
   * promise it would.
   */
  /**
   * The Kuglarz is not a swap: one parameter takes the other's value and the
   * other stands, so the two directions are two different offers.
   */
  it("moves the parameter the direction names, and leaves the other", () => {
    // Miecz becomes what the Magia is. A Barbarzyńca on 6 and 12 gains six.
    expect(
      previewOf({ op: "zamien-punkty", z: "sword" }, { ...barbarzynca, magic: 12 }),
    ).toBe("Miecz 6 → 12");
    // The other way round, off the same numbers, is a different answer.
    expect(
      previewOf({ op: "zamien-punkty", z: "magic" }, { ...barbarzynca, magic: 12 }),
    ).toBe("Magia 12 → 6");
  });

  /** 1.3 and 2.3 put a floor under own points, and it holds here too. */
  it("stops at the floor", () => {
    expect(previewOf({ op: "zamien-punkty", z: "sword" }, barbarzynca)).toBe(
      "Miecz 6 — bez zmian",
    );
  });

  /** „tylko do wysokości startowej — 4 punktów" is the Cudotwórca's ceiling. */
  it("caps the Cudotwórca at four", () => {
    expect(previewOf({ op: "uzdrow", upTo: 2 }, barbarzynca)).toBe("Życie 3 → 4");
    expect(previewOf({ op: "uzdrow", upTo: 2 }, { ...barbarzynca, life: 4 })).toBe(
      "Życie 4 — bez zmian",
    );
  });

  it("prices the Sztukmistrz's Zaklęcie", () => {
    expect(previewOf({ op: "zaklecie", count: 1, cena: 1 }, barbarzynca)).toBe("Złoto 5 → 4");
  });

  it("says nothing about what it cannot count", () => {
    expect(previewOf({ op: "nic" }, barbarzynca)).toBeNull();
    expect(previewOf({ op: "ruch-dodatkowy" }, barbarzynca)).toBeNull();
  });
});
