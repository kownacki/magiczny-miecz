import { describe, expect, it } from "vitest";
import { FIELD_SCRIPTS, fieldScriptFor } from "./fieldScript";
import { goodsId } from "./goods";
import { FIELDS } from "./board";
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
    for (const fieldId of Object.keys(FIELD_SCRIPTS)) {
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
    for (const id of ["osada", "pustelnia", "zamek"]) {
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
