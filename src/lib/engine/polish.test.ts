import { describe, expect, it } from "vitest";
import { FIELDS } from "./board";
import {
  fieldName,
  LOST_LABEL,
  plural,
  STAT_LABEL,
  TARGET_FULL,
  TARGET_SHORT,
} from "./polish";

/** The forms the whole app counts turns in, so one call site reads as prose. */
const tury = (n: number) => plural(n, "tura", "tury", "tur");

describe("counting in Polish", () => {
  it("uses the singular for exactly one", () => {
    expect(tury(1)).toBe("tura");
  });

  it("uses the few form for two, three and four", () => {
    expect([2, 3, 4].map(tury)).toEqual(["tury", "tury", "tury"]);
  });

  it("uses the many form from five up to ten", () => {
    expect([5, 6, 7, 8, 9, 10].map(tury)).toEqual(Array(6).fill("tur"));
  });

  it("counts nothing the many way", () => {
    // "0 tur", not "0 tura" — the one number that is neither one nor few.
    expect(tury(0)).toBe("tur");
  });

  it("keeps the teens out of the few form", () => {
    // The whole reason this function exists rather than a `n === 1` check:
    // 12, 13 and 14 end in 2, 3 and 4 and still take the many form.
    expect([11, 12, 13, 14].map(tury)).toEqual(["tur", "tur", "tur", "tur"]);
  });

  it("separates 22 from 12", () => {
    // Both end in 2. The exception is about the tens, not the last digit, and
    // a shorter rule that only looked at 2–4 got this one wrong.
    expect(tury(12)).toBe("tur");
    expect(tury(22)).toBe("tury");
  });

  it("carries the same rule into large numbers", () => {
    expect([21, 22, 23, 24].map(tury)).toEqual(["tur", "tury", "tury", "tury"]);
    expect([25, 30, 100, 101].map(tury)).toEqual(["tur", "tur", "tur", "tur"]);
    // 112–114 repeats the teens exception a hundred later; 122 does not.
    expect([111, 112, 113, 114].map(tury)).toEqual(["tur", "tur", "tur", "tur"]);
    expect(tury(122)).toBe("tury");
    expect(tury(1002)).toBe("tury");
  });

  it("says the same about Zaklęcia as about tury", () => {
    // The forms differ per noun; the rule choosing between them does not.
    const zaklecia = (n: number) => plural(n, "Zaklęcie", "Zaklęcia", "Zaklęć");
    expect([1, 3, 5, 13, 23].map(zaklecia)).toEqual([
      "Zaklęcie",
      "Zaklęcia",
      "Zaklęć",
      "Zaklęć",
      "Zaklęcia",
    ]);
  });
});

describe("naming a field", () => {
  it("gives the printed name, not the slug", () => {
    expect(fieldName("zamek-bestii")).toBe(FIELDS.get("zamek-bestii")?.name);
    expect(fieldName("zamek-bestii")).not.toBe("zamek-bestii");
  });

  it("names both Stopnie apart", () => {
    // The two fields that started the whole id-guarding rule.
    expect(fieldName("step-1")).not.toBe(fieldName("step-2"));
  });
});

describe("the shared label tables", () => {
  it("covers every Target twice, in both voices", () => {
    expect(Object.keys(TARGET_FULL).sort()).toEqual(Object.keys(TARGET_SHORT).sort());
  });

  it("keeps the panel's wording longer than the card's", () => {
    // Deliberately two wordings and not one copy: the summary hangs off an
    // effect that has already named itself, the panel is telling somebody to
    // go and do a thing with no card in front of them.
    expect(TARGET_SHORT.dobrzy).toBe("Dobre Postacie");
    expect(TARGET_FULL.dobrzy).toBe("Postacie o Naturze dobrej");
    expect(TARGET_SHORT.ty).toBe(TARGET_FULL.ty);
  });

  it("reads the stats in the case they are counted in", () => {
    expect(`+2 ${STAT_LABEL.miecz}`).toBe("+2 Miecza");
    expect(`−1 ${STAT_LABEL.zycie}`).toBe("−1 Życia");
  });

  it("distinguishes losing one thing from losing all of them", () => {
    expect(LOST_LABEL.zaklecie).toBe("Zaklęcie");
    expect(LOST_LABEL["wszystkie-zaklecia"]).toBe("wszystkie Zaklęcia");
  });
});
