import { describe, expect, it } from "vitest";
import { ABILITIES, stealsLife } from "./abilities";
import { bonusFromHoldings } from "./holdings";
import events from "@/data/events.json";
import items from "@/data/items.json";

/**
 * Every weapon in the box is fight-only, and the registry now says so.
 *
 * Three of the five were flagged and five were not, which meant EXCALIBUR, the
 * TOPÓR, the MIECZ CHAOSU, ARONDIGHT and the ŚWIĘTA WŁÓCZNIA raised the
 * *parametr* — the figure 14.5 subtracts on the Kamienny Most and the
 * Trzęsawiska test — while a plain MIECZ did not. That was not a rule; it was
 * a slip, and it is what made the whole thing look arbitrary.
 */

const text = (id: string): string => {
  const all = [...(events as { id: string; text?: string }[]), ...(items as { id: string; text?: string }[])];
  return all.find((one) => one.id === id)?.text ?? "";
};

describe("what a weapon lends, and when", () => {
  /**
   * The audit itself, kept as the test: the flag and the printed text must
   * agree for every card that lends points. A new transcription that says
   * "w walce" and forgets the flag fails here rather than quietly helping
   * somebody across the bridge.
   */
  it("flags exactly the cards whose own text says w walce", () => {
    const wrong: string[] = [];
    for (const [id, abilities] of Object.entries(ABILITIES)) {
      const points = abilities.find((one) => one.kind === "punkty");
      if (!points || points.kind !== "punkty") continue;
      const says = /w walce|podczas .*walki|użyt[ay] w walce/i.test(text(id));
      if (says !== (points.tylkoWalka === true)) {
        wrong.push(`${id}: text ${says ? "says" : "is silent"}, flag ${points.tylkoWalka === true}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("keeps every blade out of the parametr", () => {
    for (const id of [
      "miecz",
      "sztylet",
      "excalibur",
      "arondight",
      "topor-swiatla-i-ciemnosci",
      "miecz-chaosu",
      "swieta-wlocznia",
    ]) {
      const hand = [{ cardId: id, kind: "item" as const, face: "open" as const }];
      expect(bonusFromHoldings(hand, "classic", "parametr").miecz, id).toBe(0);
      expect(bonusFromHoldings(hand, "classic", "walka").miecz, id).toBeGreaterThan(0);
    }
  });

  /**
   * The reason both halves had to land together: with the flag alone Excalibur
   * is a common Miecz that has lost its bridge bonus, which is strictly worse
   * than the Miecz.
   */
  it("gives Excalibur back something a plain Miecz has not", () => {
    expect(stealsLife(ABILITIES.excalibur ?? [])).toBe(1);
    expect(stealsLife(ABILITIES.miecz ?? [])).toBe(0);
  });

  it("says nothing about stealing for a card that does not", () => {
    expect(stealsLife([])).toBe(0);
    expect(stealsLife(ABILITIES["srebrna-strzala"] ?? [])).toBe(0);
  });
});
