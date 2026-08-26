import { describe, expect, it } from "vitest";
import { FIELD_SCRIPTS, compulsoryOffer, fieldScriptFor, offerKey } from "./fieldScript";
import { goodsId } from "./goods";
import { FIELDS, type FieldId } from "./board";
import type { Effect } from "./cardScript";

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

  it("gives every die table all six faces", () => {
    for (const { fieldId, offer, effect } of ALL) {
      if (effect.op !== "rzut") continue;
      for (const face of [1, 2, 3, 4, 5, 6]) {
        expect(effect.faces[face], `${fieldId}/${offer} face ${face}`).toBeDefined();
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
    // The Twierdza Strzegąca Dróg's mission is deliberately not encoded;
    // nothing may be inferred from its absence.
    expect(fieldScriptFor("twierdza-strzegaca-drog")).toBeNull();
    expect(compulsoryOffer("twierdza-strzegaca-drog", [])).toBeNull();
  });

  it("says nothing about a character who is not on the board yet", () => {
    expect(compulsoryOffer(null, [])).toBeNull();
  });
});
