import { describe, expect, it } from "vitest";
import {
  andWhom,
  describeCondition,
  describeEffect,
  describeLoss,
  summariseEffect,
} from "./effectText";
import { TARGET_FULL } from "./polish";
import { FIELD_SCRIPTS } from "./fieldScript";
import type { Effect } from "./cardScript";

/**
 * The two fragments below had a second copy each in the turn panel, under
 * different names — `LOSS_LABEL` and `conditionLabel` — and `conditionLabel`
 * was identical to this file's private `ifWhen` down to the last character.
 * Two copies of a sentence are two chances for one of them to stay right, which
 * is the hazard `polish.ts` was written to end one level down; these are the
 * same hazard one level up, in the sentences the labels are set into.
 */

describe("what a loss takes off you", () => {
  it("names the one thing without counting it", () => {
    expect(describeLoss({ op: "strata", co: "przedmiot" })).toBe("tracisz Przedmiot");
  });

  it("counts only when there is more than one to count", () => {
    // "tracisz 1 Przedmiot" reads as a card with a number printed on it. The
    // card says "tracisz Przedmiot" and so does this.
    expect(describeLoss({ op: "strata", co: "przedmiot", count: 1 })).toBe("tracisz Przedmiot");
    expect(describeLoss({ op: "strata", co: "przedmiot", count: 2 })).toBe("tracisz 2 Przedmioty");
  });

  it("declines the noun it counts, all three ways", () => {
    /**
     * This used to say "tracisz 5 Przyjaciela", and was pinned as a wart on the
     * grounds that no card in the box sets a count above one — which is true,
     * and is exactly why it survived being written twice.
     *
     * Masculine personal nouns take the genitive plural at 2-4 as well as at
     * 5+, so Przyjaciel reads the same in both and Przedmiot does not. That is
     * the reason the forms are a table rather than a suffix rule.
     */
    expect(describeLoss({ op: "strata", co: "przyjaciel", count: 2 })).toBe(
      "tracisz 2 Przyjaciół",
    );
    expect(describeLoss({ op: "strata", co: "przyjaciel", count: 5 })).toBe(
      "tracisz 5 Przyjaciół",
    );
  });

  it("says when the choice is not yours", () => {
    expect(describeLoss({ op: "strata", co: "zaklecie", wybor: "losowo" })).toBe(
      "tracisz Zaklęcie (losowo)",
    );
  });

  it("declines the plural losses the way the cards print them", () => {
    expect(describeLoss({ op: "strata", co: "wszystkie-przedmioty" })).toBe(
      "tracisz wszystkie Przedmioty",
    );
    expect(describeLoss({ op: "strata", co: "gold" })).toBe("tracisz całe złoto");
  });

  it("leaves the target to whoever is setting the sentence", () => {
    // The panel names the target in its own layout and the summary hangs it off
    // the end, so the fragment itself must not decide. `describeEffect` is the
    // one that adds it.
    const effect = { op: "strata", co: "przedmiot", target: "zli" } as const;
    expect(describeLoss(effect)).toBe("tracisz Przedmiot");
    expect(describeEffect(effect)).toBe("tracisz Przedmiot — Złe Postacie");
  });
});

describe("the clause a conditional effect opens with", () => {
  it("reads a Natura in Polish, not as the key it is stored under", () => {
    expect(describeCondition({ is: "natura", jedna_z: ["evil"] })).toBe("jeśli zła");
  });

  it("joins two Natury with an alternative", () => {
    expect(describeCondition({ is: "natura", jedna_z: ["evil", "chaotic"] })).toBe(
      "jeśli zła lub chaotyczna",
    );
  });

  it("names the stat a threshold is measured on", () => {
    expect(describeCondition({ is: "prog", stat: "sword", ponizej: 4 })).toBe("jeśli Miecz < 4");
    expect(describeCondition({ is: "prog", stat: "magic", ponizej: 3 })).toBe("jeśli Magia < 3");
  });

  it("asks about gold without asking how much", () => {
    expect(describeCondition({ is: "ma-zloto" })).toBe("jeśli masz złoto");
  });
});

describe("who an effect passes over", () => {
  it("names the exempt characters rather than their ids", () => {
    // The Zaklinacz Czasu's flute stills everyone "z wyjątkiem Elfa, Hummita,
    // Spryciarza". This read "oprócz: elf" until the lookup the panel had all
    // along was moved somewhere the engine could reach it.
    expect(
      describeEffect({ op: "tura-stracona", turns: 1, target: "wszyscy", oprocz: ["elf"] }),
    ).toBe("tracisz 1 turę — wszyscy (oprócz: ELF)");
  });

  it("still falls back to the id for a character out of this box", () => {
    // Two of the five that card names are expansion characters, so they are not
    // `CharacterId`s and never will be while the scope is the base game.
    expect(
      describeEffect({ op: "tura-stracona", turns: 1, target: "wszyscy", oprocz: ["szczesciarz"] }),
    ).toBe("tracisz 1 turę — wszyscy (oprócz: szczesciarz)");
  });
});

/**
 * The terse register, which is the one a player reads mid-turn.
 *
 * A field's compulsory table is six rows on a sheet with a die about to be
 * thrown, and each row is one call to `summariseEffect`. So a branch that is
 * wrong or missing here is not a cosmetic matter: it is the app telling the
 * table what the Karczma does, and being believed.
 */

/**
 * One sample of every op the union allows.
 *
 * A `Record` keyed on `Effect["op"]` rather than a list, so that adding an op
 * to `cardScript.ts` without deciding what a table row says about it is a
 * compile error in this file — which is the one file whose job is to notice.
 * A new op has an obvious place to land: here, and then in one of the two
 * tests at the foot of the file.
 */
const ONE_OF_EACH: Record<Effect["op"], Effect> = {
  nic: { op: "nic" },
  punkty: { op: "punkty", stat: "sword", delta: 2 },
  "tura-stracona": { op: "tura-stracona", turns: 1 },
  walka: { op: "walka", nazwa: "Miejscowy osiłek", miecz: 4 },
  przenies: { op: "przenies", to: { kind: "dowolne-w-kregu" } },
  zaklecie: { op: "zaklecie", count: 1 },
  kamien: { op: "kamien" },
  uzdrow: { op: "uzdrow", upTo: 4 },
  wybor: {
    op: "wybor",
    options: [
      { label: "Zapłać 1 Sz. Z.", effect: { op: "punkty", stat: "gold", delta: -1 } },
      { label: "Tracisz 1 Życia", effect: { op: "punkty", stat: "life", delta: -1 } },
    ],
  },
  "po-kolei": { op: "po-kolei", steps: [{ op: "nic" }, { op: "kamien" }] },
  gdy: {
    op: "gdy",
    warunek: { is: "prog", stat: "sword", ponizej: 4 },
    to: { op: "zaklecie", count: 1 },
    inaczej: { op: "nic" },
  },

  // Everything below has no terse form and falls to the fallback. Kept in the
  // same table so the union stays covered whichever side of the line an op is.
  rzut: { op: "rzut", faces: { 1: { op: "nic" } } },
  sprzedaj: { op: "sprzedaj", cena: 1 },
  "ruch-dodatkowy": { op: "ruch-dodatkowy" },
  "zaklecia-do-limitu": { op: "zaklecia-do-limitu" },
  wyciagnij: { op: "wyciagnij", count: 1 },
  strata: { op: "strata", co: "przedmiot" },
  "zamien-punkty": { op: "zamien-punkty" },
  zgadnij: { op: "zgadnij", nagroda: { op: "zaklecie", count: 1 } },
  natura: { op: "natura", na: "good" },
  kup: { op: "kup", towar: [{ co: "Tarcza", cena: 2 }] },
  "jak-pole": { op: "jak-pole", fieldId: "swiatynia-bogini-nemed" },
  "poloz-karte": { op: "poloz-karte", gdzie: { kind: "dowolne-w-kregu" } },
  otrzymaj: { op: "otrzymaj", co: "Magiczny Miecz" },
  "rzut-za-kazdego": { op: "rzut-za-kazdego", co: "przyjaciel", gubiPrzy: 2 },
  uwolnij: { op: "uwolnij", od: "zly-duch" },
  zabierz: { op: "zabierz", co: "przyjaciel" },
  efekt: {
    op: "efekt",
    label: "Opętany",
    modifier: { kind: "move-max", fields: 0 },
    ends: { kind: "dispelled" },
  },
};

describe("what one row of a field's table says", () => {
  it("names the four tracked numbers in the case they are read in", () => {
    // The labels are `polish.ts`'s, shared with the long register. They used to
    // be a fourth private copy of the same table written out inside the draw
    // modal, which is the hazard that file exists to end.
    expect(summariseEffect({ op: "punkty", stat: "sword", delta: 2 })).toBe("+2 Miecza");
    expect(summariseEffect({ op: "punkty", stat: "magic", delta: 1 })).toBe("+1 Magii");
    expect(summariseEffect({ op: "punkty", stat: "life", delta: -1 })).toBe("−1 Życia");
    expect(summariseEffect({ op: "punkty", stat: "gold", delta: -1 })).toBe("−1 Złota");
  });

  it("counts turns the way Polish counts, including the exception in the teens", () => {
    // This branch used to say "turę" whatever the number, and got away with it
    // only because every table in the box loses you exactly one.
    expect(summariseEffect({ op: "tura-stracona", turns: 1 })).toBe("tracisz 1 turę");
    expect(summariseEffect({ op: "tura-stracona", turns: 3 })).toBe("tracisz 3 tury");
    expect(summariseEffect({ op: "tura-stracona", turns: 5 })).toBe("tracisz 5 tur");
    expect(summariseEffect({ op: "tura-stracona", turns: 13 })).toBe("tracisz 13 tur");
    expect(summariseEffect({ op: "tura-stracona", turns: 22 })).toBe("tracisz 22 tury");
  });

  it("says which of the two numbers a creature is fought with", () => {
    expect(summariseEffect({ op: "walka", nazwa: "Miejscowy osiłek", miecz: 4 })).toBe(
      "walka: Miejscowy osiłek (Miecz 4)",
    );
    expect(summariseEffect({ op: "walka", nazwa: "Upiór", magia: 4 })).toBe(
      "walka: Upiór (Magia 4)",
    );
  });

  it("distinguishes a destination the card names from one the player points at", () => {
    expect(summariseEffect({ op: "przenies", to: { kind: "pole", fieldId: "karczma" } })).toBe(
      "przenieś się na: Karczma",
    );
    expect(summariseEffect({ op: "przenies", to: { kind: "dowolne-w-kregu" } })).toBe(
      "przenieś się na dowolny Obszar w tym Kręgu",
    );
  });

  it("separates free healing from healing that is a purchase", () => {
    expect(summariseEffect({ op: "uzdrow", upTo: 4 })).toBe("uzdrowienie");
    expect(summariseEffect({ op: "uzdrow", upTo: 4, cena: 1 })).toBe(
      "leczenie za 1 Sz. Z. za punkt",
    );
  });

  it("trusts an option's own label rather than reading its effect back", () => {
    // The whole reason for a second register. "Zapłać 1 Sz. Z." is already the
    // sentence; the long form would print "Zapłać 1 Sz. Z.: −1 Złota".
    expect(summariseEffect(ONE_OF_EACH.wybor)).toBe("Zapłać 1 Sz. Z. albo Tracisz 1 Życia");
  });

  it("strings a sequence together in the order it happens", () => {
    expect(
      summariseEffect({
        op: "po-kolei",
        steps: [
          { op: "punkty", stat: "gold", delta: -1 },
          { op: "uzdrow", upTo: 4 },
          { op: "kamien" },
        ],
      }),
    ).toBe("−1 Złota, potem uzdrowienie, potem Zamiana w Kamień (20.1)");
  });

  it("says the condition, not only the two things it chooses between", () => {
    // It used to print the consequences alone — "+1 Zaklęcie, inaczej nic się
    // nie dzieje" — which leaves a reader no way to tell which half applies to
    // them. That is a rule told wrong, not a rule told briefly.
    expect(summariseEffect(ONE_OF_EACH.gdy)).toBe(
      "jeśli Miecz < 4: +1 Zaklęcie, inaczej nic się nie dzieje",
    );
    expect(
      summariseEffect({
        op: "gdy",
        warunek: { is: "ma-zloto" },
        to: { op: "punkty", stat: "gold", delta: -1 },
      }),
    ).toBe("jeśli masz złoto: −1 Złota");
  });

  /**
   * Both registers at once, which is the point of sharing the helper.
   *
   * `describeCondition` translated `evil` and left the other two in English, so
   * a Polish table read "jeśli good". It went unseen because the map that fixes
   * it — `NATURE_LABEL` — was three files away and already complete: the words
   * existed, and this was the one place that did not ask for them.
   */
  it("names every Natura in Polish, here and in the long register alike", () => {
    expect(
      summariseEffect({
        op: "gdy",
        warunek: { is: "natura", jedna_z: ["good"] },
        to: { op: "nic" },
      }),
    ).toBe("jeśli dobra: nic się nie dzieje");
    expect(describeCondition({ is: "natura", jedna_z: ["chaotic"] })).toBe("jeśli chaotyczna");
  });

  it("says nothing happened rather than saying nothing", () => {
    expect(summariseEffect({ op: "nic" })).toBe("nic się nie dzieje");
    expect(summariseEffect({ op: "zaklecie", count: 1 })).toBe("+1 Zaklęcie");
    expect(summariseEffect({ op: "kamien" })).toBe("Zamiana w Kamień (20.1)");
  });
});

describe("the ops the terse register has no short form for", () => {
  /**
   * The hole, written down.
   *
   * Twelve of the twenty-four ops fall through to "rozpatrzcie sami" — the app
   * handing the rule back to the table. None of them can be reached by a
   * compulsory field offer as the box stands, which is why it has never been a
   * bug. Adding a branch for one of these is meant to fail here, so that the
   * decision is taken once and out loud.
   *
   * It was thirteen until the Wieża Przeznaczenia was scripted: two of its six
   * faces are `ruch-dodatkowy`, and 16.5 makes that a table nobody may walk
   * past, so the app had to be able to say what happened. Taken out loud, as
   * intended.
   */
  it("hands exactly twelve of them back to the players", () => {
    const givenUp = Object.entries(ONE_OF_EACH)
      .filter(([, effect]) => summariseEffect(effect) === "rozpatrzcie sami")
      .map(([op]) => op)
      .sort();

    expect(givenUp).toEqual(
      [
        "jak-pole",
        "kup",
        "natura",
        "otrzymaj",
        "poloz-karte",
        "rzut",
        "sprzedaj",
        "strata",
        "wyciagnij",
        "zaklecia-do-limitu",
        "zamien-punkty",
        "zgadnij",
      ].sort(),
    );
  });

  it("never hands back a row of a table nobody may walk past (16.5)", () => {
    // The Karczma and the Strażnik are the two Obszary that demand rather than
    // offer, so they are the two whose every row is read by somebody who did
    // not choose to read it.
    for (const [fieldId, script] of Object.entries(FIELD_SCRIPTS)) {
      if (!script!.obowiazkowe) continue;
      for (const offer of script!.offers) {
        const effect = offer.effect;
        // A die table is read a face at a time, which is the arrangement this
        // register exists for; anything else is the one row.
        const rows: Effect[] =
          effect.op === "rzut"
            ? [1, 2, 3, 4, 5, 6].map((face) => effect.faces[face]).filter(Boolean)
            : [effect];
        for (const row of rows) {
          expect(summariseEffect(row), `${fieldId}/${offer.name}`).not.toBe("rozpatrzcie sami");
        }
      }
    }
  });
});

/**
 * Saying whose it is, in the panel's voice.
 *
 * The rule is trivial and was still got wrong, because it was written out once
 * per case that happened to remember it. `punkty` and `tura-stracona` named a
 * target that was not you; `strata` did not — so Burza Siedmiu Słońc, which
 * takes every Zaklęcie from every character in the Krąg, appeared in the panel
 * as "tracisz wszystkie Zaklęcia": a storm that ends the magic in the world
 * looking like a bad afternoon for whoever drew the card.
 */
describe("naming the target a panel is talking about", () => {
  it("says nothing when it is you", () => {
    // "tracisz Przedmiot — ty" is the app explaining who "tracisz" means.
    expect(andWhom("ty")).toBe("");
  });

  it("says nothing when the card names nobody", () => {
    // Most effects carry no target at all, and second person is already the
    // default voice of every sentence in here.
    expect(andWhom(undefined)).toBe("");
  });

  it("names everybody else in the long form", () => {
    expect(andWhom("wszyscy")).toBe(" — wszystkie Postacie");
    expect(andWhom("dobrzy")).toBe(" — Postacie o Naturze dobrej");
  });

  it("is the panel's wording and not the summary's", () => {
    /**
     * `polish.ts` keeps two wordings of the eleven on purpose — the short one
     * hangs off a line that has already named itself, the long one is for
     * somebody being told to go and do a thing with no card in front of them.
     * This is the long one, and a test that did not say so would pass just as
     * well if it quietly became the other.
     */
    expect(andWhom("w-dolnym-kregu")).toBe(" — wędrujący po Dolnym Kręgu");
    expect(andWhom("w-dolnym-kregu")).not.toBe(" — wędrujący Dolnym Kręgiem");
  });

  it("covers every target the union has", () => {
    // The compiler keeps `TARGET_FULL` complete; this keeps the clause it
    // builds from being empty or undefined for one of them.
    for (const target of Object.keys(TARGET_FULL) as (keyof typeof TARGET_FULL)[]) {
      const said = andWhom(target);
      if (target === "ty") continue;
      expect(said.startsWith(" — ")).toBe(true);
      expect(said.length).toBeGreaterThan(4);
    }
  });
});
