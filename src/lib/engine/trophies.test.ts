import { describe, expect, it } from "vitest";
import {
  TROPHY_RATE,
  mostSwords,
  offerFor,
  offersFor,
  pointOffers,
  trophyPointsOf,
} from "./trophies";

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

  /**
   * The tie-break the seat card leans on: given the hand oldest first, two
   * equally good answers resolve to the earlier Karty.
   *
   * 3, 3, 4 buys one Miecz two ways — either 3 with the 4 — and both spend two
   * Karty and waste nothing. `reachable` keeps the first witness it finds at a
   * given size and walks the hand in order, so the first 3 wins. The browser
   * hands it the shelf oldest first, which turns that into "spend the Wróg you
   * beat in turn two, not the one from turn nine".
   */
  it("breaks a tie towards the earlier Karty", () => {
    const [offer] = offersFor(hand(3, 3, 4));
    expect(offer.cardIds).toEqual(["c0", "c2"]);
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

/**
 * Optimal, and not merely better than greedy.
 *
 * Every test above is a case somebody thought of. This one thinks of none: it
 * enumerates every subset of a hand by brute force, works out the best each
 * number of Mieczy can do, and demands `offersFor` match it — on a hundred
 * hands, with the sizes and the printed values a real shelf has.
 *
 * Asked because the question is worth an answer rather than a reading of the
 * code: for each `+1 Miecza` on offer, is that really the combination of
 * unspent trofea that wastes the fewest points? The DP in `reachable` says so
 * and this checks it, including the tie-break — among sets that waste the same,
 * the one that hands over the fewest Karty, which keeps the small
 * denominations back for hitting an exact seven later.
 */
describe("every offer is the best the hand can do", () => {
  /** The same question answered the slow, obviously-correct way. */
  function bruteForce(hand: readonly { points: number }[]) {
    const best = new Map<number, { wasted: number; cards: number }>();
    for (let mask = 1; mask < 1 << hand.length; mask++) {
      let points = 0;
      let cards = 0;
      for (let at = 0; at < hand.length; at++) {
        if (mask & (1 << at)) {
          points += hand[at].points;
          cards += 1;
        }
      }
      const swords = Math.floor(points / TROPHY_RATE);
      if (swords < 1) continue;
      const wasted = points - swords * TROPHY_RATE;
      const standing = best.get(swords);
      if (
        standing === undefined ||
        wasted < standing.wasted ||
        (wasted === standing.wasted && cards < standing.cards)
      ) {
        best.set(swords, { wasted, cards });
      }
    }
    return best;
  }

  /** Deterministic, because a test that fails only on Tuesdays is not a test. */
  function rolls(seed: number) {
    let at = seed;
    return (upTo: number) => {
      at = (at * 1103515245 + 12345) % 2147483648;
      return 1 + (at % upTo);
    };
  }

  it("matches a brute force over every subset, on a hundred hands", () => {
    const roll = rolls(20260828);
    for (let round = 0; round < 100; round += 1) {
      // Up to ten Karty, each worth what a Wróg in the box is worth (1 to 10).
      const size = roll(10);
      const held = Array.from({ length: size }, (_, at) => ({
        cardId: `w${at}`,
        points: roll(10),
      }));

      const truth = bruteForce(held);
      const offers = offersFor(held);

      // Every count the hand can reach is offered, and no count it cannot.
      expect(offers.map((one) => one.swords)).toEqual(
        [...truth.keys()].sort((a, b) => a - b),
      );

      for (const offer of offers) {
        const want = truth.get(offer.swords);
        expect({
          swords: offer.swords,
          wasted: offer.wasted,
          cards: offer.cardIds.length,
        }).toEqual({ swords: offer.swords, wasted: want?.wasted, cards: want?.cards });

        // And the set it names really is the set it charges for.
        const spent = offer.cardIds.reduce(
          (sum, cardId) => sum + (held.find((one) => one.cardId === cardId)?.points ?? 0),
          0,
        );
        expect(spent).toBe(offer.points);
      }
    }
  });
});

/**
 * Which Wrogowie are worth anything, which is a rule and not caution.
 *
 * 1.4 keeps the Karty of "napotkanymi Wrogami (mającymi określony parametr
 * Miecza)" and 16.2 says it again — "Karty pokonanych Wrogów **tego rodzaju**"
 * — so a Wróg fought magically is beaten and gone, and the seven-point
 * arithmetic never prices a Magia in Miecze. Ten of the thirty-two are
 * magical (docs/TROFEA.md), so this decides a third of the deck.
 *
 * This counted any number it found until now, while the trophy panel kept its
 * own copy that read the rule correctly. `trophiesFrom` refuses to make a
 * magical Wróg a trophy at all, so the two never met in an ordinary game —
 * which is exactly why the disagreement could sit there.
 */
describe("what a beaten Wróg is worth (1.4, 16.2)", () => {
  it("is the Miecz printed on an ordinary one", () => {
    expect(trophyPointsOf("cyklop")).toBe(6);
    expect(trophyPointsOf("czarna-hybryda")).toBe(2);
  });

  it("is nothing for one fought magically, whatever his Magia", () => {
    // Książę Demonów carries a Magia of 10 — the largest number on any Wróg —
    // so counting it would have been worth a Miecz and a half on its own.
    expect(trophyPointsOf("ksiaze-demonow")).toBe(0);
    expect(trophyPointsOf("duch-ciemnosci")).toBe(0);
  });

  it("is nothing for a card that is not a Wróg at all", () => {
    expect(trophyPointsOf("helm")).toBe(0);
    expect(trophyPointsOf("nie-ma-takiej-karty")).toBe(0);
  });

  /**
   * The Sobowtór has no number of his own — "posiada zawsze tyle punktów
   * Miecza, ile jego przeciwnik" — so he is priced at what he fought at, and
   * asked for rather than defaulted so a trophy is never silently worth zero.
   */
  it("prices the one Wróg who mirrors at what he fought", () => {
    expect(trophyPointsOf("sobowtor", { miecz: 7 })).toBe(7);
    expect(trophyPointsOf("sobowtor")).toBe(0);
  });
});
