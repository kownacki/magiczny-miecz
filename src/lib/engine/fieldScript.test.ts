import { describe, expect, it } from "vitest";
import {
  FIELD_SCRIPTS,
  compulsoryOffer,
  fieldScriptFor,
  offerKey,
  touchesGold,
  trades,
  tradesForGold,
} from "./fieldScript";
import { goodsId } from "./goods";
import { FIELDS, asFieldId, type FieldId } from "./board";
import { scriptFor, type Effect } from "./cardScript";
import { fieldTextBesidesOffers, fieldWithText, offerText } from "@/lib/view/fieldText";

/** Every effect in a field's offers, flattened. */
function every(effect: Effect): Effect[] {
  const found = [effect];
  if (effect.op === "po-kolei") effect.steps.forEach((s) => found.push(...every(s)));
  if (effect.op === "wybor") effect.options.forEach((o) => found.push(...every(o.effect)));
  if (effect.op === "rzut") {
    Object.values(effect.faces).forEach((f) => found.push(...every(f)));
  }
  if (effect.op === "gdy") {
    found.push(...every(effect.to));
    if (effect.inaczej) found.push(...every(effect.inaczej));
  }
  return found;
}

const ALL = Object.entries(FIELD_SCRIPTS).flatMap(([fieldId, script]) =>
  script.offers.flatMap((offer) =>
    every(offer.effect).map((effect) => ({ fieldId, offer: offer.name, effect })),
  ),
);

describe("the fields that trade", () => {
  it("names fields the board actually has", () => {
    for (const fieldId of Object.keys(FIELD_SCRIPTS) as FieldId[]) {
      expect(FIELDS.has(fieldId), fieldId).toBe(true);
    }
  });

  it("sends every character somewhere the board has", () => {
    for (const { fieldId, effect } of ALL) {
      if (effect.op === "przenies" && effect.to.kind === "pole") {
        expect(FIELDS.has(effect.to.fieldId), `${fieldId} → ${effect.to.fieldId}`).toBe(true);
      }
    }
  });

  it("sells only Wyposażenie cards that exist", () => {
    const priced = ALL.filter((e) => e.effect.op === "kup");
    expect(priced.length).toBeGreaterThan(0);
    for (const { fieldId, effect } of priced) {
      if (effect.op !== "kup") continue;
      for (const towar of effect.towar) {
        expect(goodsId(towar.co), `${fieldId}: ${towar.co}`).not.toBeNull();
        expect(towar.cena).toBeGreaterThan(0);
      }
    }
  });

  it("prices the Osada's Płatnerz as the board prints it", () => {
    const shop = fieldScriptFor("osada")!.offers.find((o) => o.name === "Płatnerz")!;
    expect(shop.effect.op).toBe("kup");
    if (shop.effect.op !== "kup") return;
    // "za 2 Sz. Z. miecz; sztylet za 3 Sz. Z.; hełm - 1 Sz. Z." — the sword is
    // cheaper than the dagger, which reads like a misprint and is not one.
    expect(shop.effect.towar).toEqual([
      { co: "Miecz", cena: 2 },
      { co: "Sztylet", cena: 3 },
      { co: "Hełm", cena: 1 },
    ]);
  });

  /**
   * Every face a table can actually land on, which is not the same range for
   * both kinds. One die is 1-6; two dice are 2-12 and can never read 1, so a
   * two-die table with a face 1 would be a row nobody could ever reach and a
   * missing face 12 would be a hole where the worst outcome belongs.
   */
  it("gives every die table every face it can land on", () => {
    for (const { fieldId, offer, effect } of ALL) {
      if (effect.op !== "rzut") continue;
      const faces =
        effect.kostki === 2 ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
      for (const face of faces) {
        expect(effect.faces[face], `${fieldId}/${offer} face ${face}`).toBeDefined();
      }
      if (effect.kostki === 2) {
        expect(effect.faces[1], `${fieldId}/${offer} cannot roll a 1`).toBeUndefined();
      }
    }
  });

  it("never encodes a field as doing nothing at all", () => {
    // A script that is six blank faces claims the app is helping when it is
    // not, which is worse than leaving the prose alone — see the Twierdza,
    // whose mission is deliberately absent from this file.
    for (const [fieldId, script] of Object.entries(FIELD_SCRIPTS)) {
      const does = script.offers.some((offer) =>
        every(offer.effect).some((effect) => effect.op !== "nic" && effect.op !== "rzut"),
      );
      expect(does, fieldId).toBe(true);
    }
  });

  it("makes the two fields nobody may walk past mandatory", () => {
    // "MUSISZ RZUCIĆ KOSTKĄ" at the Karczma, and the Strażnik's toll.
    expect(fieldScriptFor("karczma")?.obowiazkowe).toBe(true);
    expect(fieldScriptFor("straznik-magicznych-wrot")?.obowiazkowe).toBe(true);
    expect(fieldScriptFor("osada")?.obowiazkowe).toBeUndefined();
  });

  it("charges for healing where the board charges", () => {
    for (const id of ["osada", "pustelnia", "zamek"] as const) {
      const cure = fieldScriptFor(id)!
        .offers.flatMap((o) => every(o.effect))
        .find((e) => e.op === "uzdrow");
      expect(cure, id).toBeDefined();
      if (cure?.op !== "uzdrow") continue;
      expect(cure.cena, id).toBe(1);
      // 4.7: never above the four a character starts with.
      expect(cure.upTo, id).toBe(4);
    }
  });
});

describe("a price list names real cards", () => {
  it("matches the printed names case-insensitively", () => {
    expect(goodsId("Miecz")).toBe("miecz");
    expect(goodsId("HEŁM")).toBe("helm");
    expect(goodsId("łódź")).toBe("lodz");
    expect(goodsId("Kij i Sznur")).toBe("kij-i-sznur");
  });

  it("answers null for something that is not equipment", () => {
    expect(goodsId("Zaklęcie")).toBeNull();
    expect(goodsId("")).toBeNull();
  });
});

/**
 * The Obszar that happens to you (16.5).
 *
 * This decides whether a turn can be walked away from, and it lived in the page
 * component until now, which is why it had no tests. The two fields it answers
 * for are the only two carrying `obowiazkowe: true`: the Karczma's "MUSISZ
 * RZUCIĆ KOSTKĄ" and the Strażnik's toll.
 */
describe("the offer an Obszar makes whether or not it is asked", () => {
  it("hands back the Karczma's die table before anything is settled", () => {
    const owed = compulsoryOffer("karczma", []);
    expect(owed?.name).toBe("Karczma");
    expect(owed?.effect.op).toBe("rzut");
  });

  it("hands back the Strażnik's toll, which is a choice but not an optional one", () => {
    // Paying or bleeding is a choice; skipping is not. Both are compulsory
    // fields, and only these two are.
    const owed = compulsoryOffer("straznik-magicznych-wrot", []);
    expect(owed?.name).toBe("Strażnik");
    expect(owed?.effect.op).toBe("wybor");
  });

  /**
   * `resolved` holds `offerKey` values, not field ids.
   *
   * A field's offer is written into the same "resolved" list the drawn cards
   * use, prefixed `pole:` so a card named after a field cannot silently settle
   * it. Passing the bare field id settles nothing — this is worth an assertion
   * of its own because both are strings and neither the compiler nor the shape
   * of the call says which one is meant.
   */
  it("is settled by the offer's key, and not by the field id", () => {
    expect(offerKey("Karczma")).toBe("pole:Karczma");
    expect(compulsoryOffer("karczma", ["pole:Karczma"])).toBeNull();
    expect(compulsoryOffer("karczma", ["karczma"])?.name).toBe("Karczma");
  });

  it("is not settled by another field's offer", () => {
    expect(compulsoryOffer("karczma", [offerKey("Strażnik")])?.name).toBe("Karczma");
  });

  it("says nothing about a field that only offers", () => {
    // The Osada has three services and a character may visit none of them, so
    // its window is an offer and closing it is allowed.
    expect(fieldScriptFor("osada")!.offers.length).toBeGreaterThan(0);
    expect(compulsoryOffer("osada", [])).toBeNull();
  });

  it("says nothing about a field with no script at all", () => {
    // The Wrzosowiska draw two Karty and print nothing else, so 13.4 covers the
    // whole of it and there is no script to find. Nothing may be inferred from
    // that absence — least of all that the Obszar does nothing.
    expect(fieldScriptFor("wrzosowiska")).toBeNull();
    expect(compulsoryOffer("wrzosowiska", [])).toBeNull();
  });

  /**
   * The Twierdza used to stand here as the example of a deliberate absence.
   * Its mission is encoded now, and the thing worth pinning instead is that
   * nobody is given an errand for walking past: "Władca Twierdzy **może**
   * wyznaczyć ci misję. **Jeżeli się zdecydowałeś** rzuć kostką" is optional
   * twice over.
   */
  it("never presses the Władca's errand on a passer-by", () => {
    expect(fieldScriptFor("twierdza-strzegaca-drog")).not.toBeNull();
    expect(compulsoryOffer("twierdza-strzegaca-drog", [])).toBeNull();
  });

  it("says nothing about a character who is not on the board yet", () => {
    expect(compulsoryOffer(null, [])).toBeNull();
  });
});

describe("the cards that are shops", () => {
  it("recognises each of the three trading operations", () => {
    expect(trades({ op: "kup", towar: [{ co: "Miecz", cena: 2 }] })).toBe(true);
    expect(trades({ op: "sprzedaj", cena: 1 })).toBe(true);
    expect(trades({ op: "uzdrow", upTo: 4, cena: 1 })).toBe(true);
  });

  it("counts free healing, which is still somebody you visit", () => {
    // The Pustelnik charges and the Nieznajomy on the road does not, and both
    // are a person standing on the Obszar with something to give.
    expect(trades({ op: "uzdrow", upTo: 2 })).toBe(true);
  });

  it("finds a shop inside a sequence or a choice", () => {
    const buy: Effect = { op: "kup", towar: [{ co: "Zaklęcie", cena: 1 }] };
    expect(trades({ op: "po-kolei", steps: [{ op: "nic" }, buy] })).toBe(true);
    expect(
      trades({
        op: "wybor",
        options: [
          { label: "Nie", effect: { op: "nic" } },
          { label: "Tak", effect: buy },
        ],
      }),
    ).toBe(true);
  });

  it("does not go looking inside a die table", () => {
    // The Wezwanie Duchów rolls "3, 4 — leczysz do 1 Życia". That is an
    // outcome you might get, not a healer you can visit, and hoisting it into
    // "Możesz tu odwiedzić" would offer a service nobody at this Obszar can
    // buy. Deliberately shallower than `fieldsNamedBy`, which walks everything.
    expect(
      trades({
        op: "rzut",
        faces: {
          1: { op: "nic" },
          2: { op: "nic" },
          3: { op: "uzdrow", upTo: 1 },
          4: { op: "uzdrow", upTo: 1 },
          5: { op: "nic" },
          6: { op: "nic" },
        },
      }),
    ).toBe(false);
  });

  it("does not go looking inside a condition either", () => {
    expect(
      trades({ op: "gdy", warunek: { is: "ma-zloto" }, to: { op: "sprzedaj", cena: 1 } }),
    ).toBe(false);
  });

  it("says no to everything that merely happens to you", () => {
    expect(trades({ op: "nic" })).toBe(false);
    expect(trades({ op: "punkty", stat: "gold", delta: -1 })).toBe(false);
    expect(trades({ op: "walka", nazwa: "CYKLOP", miecz: 6 })).toBe(false);
  });

  it("agrees with the board about which fields keep a shop", () => {
    // The Osada trades and the Karczma's die table does not, which is the whole
    // distinction this predicate draws.
    expect(fieldScriptFor("osada")!.offers.some((offer) => trades(offer.effect))).toBe(true);
    expect(fieldScriptFor("karczma")!.offers.some((offer) => trades(offer.effect))).toBe(false);
  });
});

/**
 * A quoted line is a promise about the board, the same as a rule number is a
 * promise about the Instrukcja.
 *
 * `FieldOffer.text` exists so a subview can show the board's words for the one
 * offer being visited rather than the whole square's. That is only worth doing
 * while the two agree: a sentence that has drifted from the transcription is
 * worse than none, because it still looks like the board. So every one of them
 * has to be findable, verbatim, inside the Obszar's own text.
 */
describe("an offer's printed line", () => {
  it("appears verbatim in the Obszar's own transcription", () => {
    for (const [id, script] of Object.entries(FIELD_SCRIPTS)) {
      for (const offer of script?.offers ?? []) {
        if (offer.text === undefined) continue;
        const printed = fieldWithText(id as FieldId)?.text ?? "";
        expect(printed, `${id} — ${offer.name}`).toContain(offer.text);
      }
    }
  });

  /**
   * The other half: an Obszar with several offers must say which is which, or
   * `offerText` falls back to the whole square's text and puts the Czarownica's
   * die table above the Płatnerz's prices.
   */
  it("is present wherever an Obszar makes more than one, except the Egzorcyzm", () => {
    for (const [id, script] of Object.entries(FIELD_SCRIPTS)) {
      if (!script || script.obowiazkowe || script.offers.length < 2) continue;
      for (const offer of script.offers) {
        // The one offer the board is silent about: the ZŁY DUCH's own Karta
        // carries the words, and the Pustelnia prints only the herbs.
        if (offer.name === "Egzorcyzm") {
          expect(offerText(id as FieldId, offer)).toBeNull();
          continue;
        }
        expect(offerText(id as FieldId, offer), `${id} — ${offer.name}`).not.toBeNull();
      }
    }
  });
});

/**
 * The paragraph at the top of an Obszar and the buttons under it must not both
 * carry the same sentence.
 */
describe("what is left of an Obszar's text once its offers take their lines", () => {
  it("is nothing at all where the whole text is the list", () => {
    // Both fields print "MOŻESZ TU ODWIEDZIĆ:" and then a line per offer, so
    // once each line is on its own button the heading is the list's own.
    expect(fieldTextBesidesOffers(asFieldId("osada")!)).toBeNull();
    expect(fieldTextBesidesOffers(asFieldId("grod")!)).toBeNull();
  });

  it("keeps the whole paragraph where the Obszar makes one offer", () => {
    // `offerText` falls back to the field's own text there, and stripping it
    // would leave the square undescribed and the button holding a die table.
    const zamek = fieldTextBesidesOffers(asFieldId("zamek")!);
    expect(zamek).toContain("Nadworny Medyk");
  });

  it("keeps what the board says beyond the offer it itemised", () => {
    // The Pustelnia prints the Pustelnik's paragraph and nothing about the
    // Egzorcyzm, so the paragraph goes to his button and nothing is left.
    expect(fieldTextBesidesOffers(asFieldId("pustelnia")!)).toBeNull();
  });
});

/**
 * The satchel on the map claims there is a merchant on a square, so the
 * question behind it is narrower than "does gold come into this".
 */
describe("tradesForGold", () => {
  const offer = (fieldId: string, name: string) => {
    const found = fieldScriptFor(asFieldId(fieldId)!)?.offers.find((one) => one.name === name);
    if (!found) throw new Error(`${fieldId} has no ${name} — read fieldScript.ts`);
    return found.effect;
  };

  it("counts a desk that charges or pays", () => {
    expect(tradesForGold(offer("osada", "Płatnerz"))).toBe(true);
    expect(tradesForGold(offer("grod", "Lichwiarz"))).toBe(true);
    expect(tradesForGold(offer("osada", "Medyk"))).toBe(true);
    // A `po-kolei` whose first step is the price, and whose second is the die
    // that may undo it — the Zamek's is the one healer that can go wrong.
    expect(tradesForGold(offer("zamek", "Nadworny Medyk"))).toBe(true);
  });

  it("counts a Karta that settled here and sells", () => {
    expect(tradesForGold(scriptFor("targowisko")!.effect)).toBe(true);
    expect(tradesForGold(scriptFor("sztukmistrz")!.effect)).toBe(true);
  });

  it("does not count healing that asks nothing", () => {
    // The CUDOTWÓRCA gives two punkty Życia „podczas każdych odwiedzin" and
    // names no price. A satchel over him would send somebody with an empty
    // purse past him rather than to him.
    expect(tradesForGold(scriptFor("cudotworca")!.effect)).toBe(false);
  });

  it("does not count gold a die table happens to move", () => {
    // The Karczma can take a Sztuka Złota and the Twierdza's Misja can bring
    // three, and neither is a counter you walk up to. `touchesGold` says yes to
    // both, which is right for showing a purse and wrong for a map.
    const karczma = offer("karczma", "Karczma");
    expect(touchesGold(karczma)).toBe(true);
    expect(tradesForGold(karczma)).toBe(false);
    expect(tradesForGold(offer("twierdza-strzegaca-drog", "Misja"))).toBe(false);
  });

  it("does not count a wish that may be a coin", () => {
    // Magiczne Wrota offers „1 Sztuka Złota" among four wishes. A purse is
    // worth showing there; a merchant is not what is standing there.
    const wish = offer("magiczne-wrota", "Życzenie");
    expect(touchesGold(wish)).toBe(true);
    expect(tradesForGold(wish)).toBe(false);
  });
});
