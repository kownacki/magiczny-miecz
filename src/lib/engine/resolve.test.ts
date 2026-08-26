import { describe, expect, it } from "vitest";
import { isSettled } from "./resolve";
import { FIELD_SCRIPTS } from "./fieldScript";
import { SCRIPTS } from "./cardScript";
import type { Effect } from "./cardScript";

describe("what the app may carry out on its own", () => {
  it("settles what has one outcome", () => {
    expect(isSettled({ op: "nic" })).toBe(true);
    expect(isSettled({ op: "punkty", stat: "gold", delta: -1 })).toBe(true);
    expect(isSettled({ op: "tura-stracona", turns: 1 })).toBe(true);
    expect(isSettled({ op: "zaklecie", count: 1 })).toBe(true);
    expect(isSettled({ op: "kamien" })).toBe(true);
    expect(isSettled({ op: "walka", nazwa: "Osiłek", miecz: 4 })).toBe(true);
    expect(isSettled({ op: "przenies", to: { kind: "pole", fieldId: "karczma" } })).toBe(true);
  });

  it("refuses what the rules leave to the player", () => {
    // "wedle własnego wyboru" — a referee that chose would be playing your
    // character, which is the whole line this function draws.
    expect(
      isSettled({
        op: "wybor",
        options: [
          { label: "a", effect: { op: "punkty", stat: "sword", delta: 1 } },
          { label: "b", effect: { op: "punkty", stat: "magic", delta: 1 } },
        ],
      }),
    ).toBe(false);
    expect(isSettled({ op: "strata", co: "przedmiot" })).toBe(false);
    expect(isSettled({ op: "przenies", to: { kind: "dowolne-w-kregu" } })).toBe(false);
    expect(isSettled({ op: "zgadnij", nagroda: { op: "zaklecie", count: 1 } })).toBe(false);
    // Free healing has one answer; paid healing is a purchase, and how much to
    // buy is the buyer's.
    expect(isSettled({ op: "uzdrow", upTo: 4 })).toBe(true);
    expect(isSettled({ op: "uzdrow", upTo: 4, cena: 1 })).toBe(false);
  });

  it("is only as settled as its least settled step", () => {
    const withChoice: Effect = {
      op: "po-kolei",
      steps: [
        { op: "punkty", stat: "gold", delta: 1 },
        { op: "wybor", options: [{ label: "a", effect: { op: "nic" } }] },
      ],
    };
    expect(isSettled(withChoice)).toBe(false);
    expect(
      isSettled({ op: "po-kolei", steps: [{ op: "nic" }, { op: "kamien" }] }),
    ).toBe(true);
  });

  it("settles the Karczma, which is the whole point", () => {
    // Six faces, five of them things that simply happen and one — "przenieś się
    // na dowolny Obszar w tym Kręgu" — that is the player pointing at a board.
    const karczma = FIELD_SCRIPTS.karczma!.offers[0].effect;
    if (karczma.op !== "rzut") throw new Error("expected a die table");
    const settled = [1, 2, 3, 4, 5, 6].filter((face) => isSettled(karczma.faces[face]));
    expect(settled).toEqual([1, 2, 3, 4, 6]);
  });

  it("answers for every encoded card without throwing", () => {
    // The switch is exhaustive over `Effect`, so a new op added without a
    // decision about it fails to compile. This checks the corpus as it stands.
    for (const [cardId, script] of Object.entries(SCRIPTS)) {
      expect(() => isSettled(script!.effect), cardId).not.toThrow();
    }
    for (const [fieldId, script] of Object.entries(FIELD_SCRIPTS)) {
      for (const offer of script!.offers) {
        expect(() => isSettled(offer.effect), `${fieldId}/${offer.name}`).not.toThrow();
      }
    }
  });
});
