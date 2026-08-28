import { describe, expect, it } from "vitest";
import { TROPHY_RATE, mostSwords, offerFor, offersFor, pointOffers } from "./trophies";

/**
 * The arithmetic 1.4 leaves to the player, done properly.
 *
 * The rule gives you a choice of what to hand in and says nothing about how to
 * choose. These are the cases where choosing badly costs something real.
 */

const hand = (...points: number[]) =>
  points.map((one, at) => ({ cardId: `c${at}`, points: one }));

describe("what a hand of trofea can buy", () => {
  it("buys nothing below the rate", () => {
    expect(offersFor(hand(2, 3))).toEqual([]);
    expect(mostSwords(hand(2, 3))).toBe(0);
  });

  it("finds an exact seven rather than spending the whole hand", () => {
    const [one] = offersFor(hand(6, 5, 2, 2));
    expect(one.swords).toBe(1);
    expect(one.wasted).toBe(0);
    expect(one.points).toBe(TROPHY_RATE);
    // 5+2, not 6+5 — which is what taking the biggest first would have done,
    // burning four for the same one Miecz.
    expect(one.cardIds.length).toBe(2);
  });

  it("prefers fewer Karty when two sets waste the same", () => {
    // 7 alone and 3+4 both buy one Miecz and waste nothing. The single card
    // goes, keeping the small denominations back for the next exact seven.
    const [one] = offersFor(hand(7, 3, 4));
    expect(one.cardIds).toEqual(["c0"]);
  });

  it("offers every count the hand can reach, in order", () => {
    // 6+5+2+2+7 = 22 → one, two and three Miecze are all reachable.
    const all = offersFor(hand(6, 5, 2, 2, 7));
    expect(all.map((one) => one.swords)).toEqual([1, 2, 3]);
    expect(all[0].wasted).toBe(0);
    expect(all[1].wasted).toBe(0);
  });

  /**
   * The clause that survives the subset ruling: a Karta cannot be split, so a
   * hand that cannot make a multiple of seven still burns something.
   */
  it("wastes what a hand of one big Karta must waste", () => {
    const [one] = offersFor(hand(10));
    expect(one).toMatchObject({ swords: 1, points: 10, wasted: 3 });
  });

  it("spends the whole hand when that is what the count needs", () => {
    const two = offerFor(hand(6, 5, 2, 2), 2);
    expect(two).toMatchObject({ swords: 2, points: 15, wasted: 1 });
    expect(two?.cardIds).toHaveLength(4);
  });

  it("says no rather than nearly, for a count the hand cannot reach", () => {
    expect(offerFor(hand(6, 5, 2, 2), 3)).toBeNull();
    expect(offerFor(hand(7), 0)).toBeNull();
    expect(offerFor(hand(7), 1.5)).toBeNull();
  });

  it("names cards that are really in the hand, each at most once", () => {
    const held = hand(6, 5, 2, 2, 7);
    for (const offer of offersFor(held)) {
      expect(new Set(offer.cardIds).size).toBe(offer.cardIds.length);
      for (const cardId of offer.cardIds) {
        expect(held.map((one) => one.cardId)).toContain(cardId);
      }
      // And the points really are those cards'.
      const summed = offer.cardIds.reduce(
        (sum, cardId) => sum + (held.find((one) => one.cardId === cardId)?.points ?? 0),
        0,
      );
      expect(summed).toBe(offer.points);
    }
  });

  /** Two Nobbiny are two cards worth the same, not one card counted twice. */
  it("treats equal Karty as separate cards", () => {
    const [one] = offersFor(hand(2, 2, 3));
    expect([...one.cardIds].sort()).toEqual(["c0", "c1", "c2"]);
  });

  /** The whole box, to show the search is not a performance question. */
  it("handles every hoardable Wróg in the game at once", () => {
    const everything = hand(1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 5, 5, 6, 10, 10);
    const all = offersFor(everything);
    expect(all).toHaveLength(10);
    expect(all[9]).toMatchObject({ swords: 10, points: 70, wasted: 0 });
  });
});

describe("the same question in punkty mode", () => {
  it("counts sevens and never wastes", () => {
    expect(pointOffers(15)).toEqual([
      { swords: 1, cardIds: [], points: 7, wasted: 0 },
      { swords: 2, cardIds: [], points: 14, wasted: 0 },
    ]);
  });

  it("offers nothing below the rate", () => {
    expect(pointOffers(6)).toEqual([]);
    expect(pointOffers(0)).toEqual([]);
  });
});
