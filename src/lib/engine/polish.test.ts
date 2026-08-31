import { describe, expect, it } from "vitest";
import { FIELDS } from "./board";
import {
  cardName,
  characterName,
  fieldName,
  LOST_LABEL,
  plural,
  roundShown,
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
    expect(`+2 ${STAT_LABEL.sword}`).toBe("+2 Miecza");
    expect(`−1 ${STAT_LABEL.life}`).toBe("−1 Życia");
  });

  it("distinguishes losing one thing from losing all of them", () => {
    expect(LOST_LABEL.zaklecie).toBe("Zaklęcie");
    expect(LOST_LABEL["wszystkie-zaklecia"]).toBe("wszystkie Zaklęcia");
  });
});

/**
 * Three lookups, one job: turn a stored id into the thing printed on the card
 * or the board. They are separate functions and not one because the piles
 * overlap — `czarodziej` and `demon` are each both a Karta Postaci and a Karta
 * Zdarzeń, and a single lookup would answer the wrong one half the time.
 */
describe("naming what is printed on a card", () => {
  it("gives a character the name off its Karta Postaci", () => {
    expect(characterName("barbarzynca")).toBe("BARBARZYŃCA");
  });

  it("falls back to the id for a character out of another box", () => {
    // The Zaklinacz Czasu's card names two expansion characters (see `oprocz`
    // in `cardScript.ts`), so a miss here is the card being transcribed
    // faithfully rather than anything being wrong.
    expect(characterName("szczesciarz")).toBe("szczesciarz");
  });

  it("names a Karta Zdarzeń", () => {
    expect(cardName("zaraza")).toBe("ZARAZA");
  });

  it("names a Wyposażenie card that is in no other pile", () => {
    // The one Przedmiot that exists only as Wyposażenie. A lookup that read
    // the Karty Zdarzeń alone — which is what the turn panel's copy did — put
    // "tarcza-tolimana" on the Lichwiarz's sell button, and every other item
    // in the shop hid it, because they all happen to be printed as event cards
    // too.
    expect(cardName("tarcza-tolimana")).toBe("TARCZA TOLIMANA");
  });

  it("names a Zaklęcie, which 12.5 has spoken out loud", () => {
    expect(cardName("golem")).toBe("GOLEM");
  });

  it("falls back to the id for a card nothing knows", () => {
    // Legible enough to debug with: a card the deck does not know is a bug to
    // see, not one to hide behind "?".
    expect(cardName("nie-ma-takiej-karty")).toBe("nie-ma-takiej-karty");
  });

  it("tells a character and a card of the same id apart", () => {
    expect(characterName("czarodziej")).toBe("CZARODZIEJ");
    expect(cardName("demon")).toBe("DEMON");
  });
});

/**
 * The one place that decides how a round is numbered on screen.
 *
 * Five surfaces print it and the column they print is 0-based, so the whole
 * point of the helper is that none of them adds the one itself.
 */
describe("the round as a person counts it", () => {
  it("shows the first circuit of the table as 1, not 0", () => {
    expect(roundShown(0)).toBe(1);
    expect(roundShown(4)).toBe(5);
  });
});
