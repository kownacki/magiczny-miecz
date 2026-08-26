import { describe, expect, it } from "vitest";
import {
  arrangedBy,
  insertIndexIn,
  landsBefore,
  orderWith,
  sameOrder,
  stepFor,
} from "./pack-order";

/**
 * The gesture, without the pixels.
 *
 * Every claim below is one somebody noticed by dragging a card and finding it
 * somewhere else — a card picked up and put straight back down landing at the
 * back of the pack, the fourth card moving when you pointed at the fifth, the
 * whole tail of the row shuffling aside to make a place that was already there.
 * They read as "it feels wrong" rather than as bugs, and while the answers
 * lived in a closure inside a seven-hundred-line component there was nowhere to
 * put a test that would have caught any of them.
 */

const pack = (...ids: string[]) => ids.map((id) => ({ id }));
/** a b c d e — five cards, so there is a middle to aim either side of. */
const five = pack("a", "b", "c", "d", "e");
const at = (id: string) => five.findIndex((held) => held.id === id);

describe("the order the pack is drawn in", () => {
  it("is the server's, when this device has asked for nothing", () => {
    expect(arrangedBy(five, null).map((held) => held.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is this device's, while it still describes these cards", () => {
    // The drag has to look instant. Waiting for the round trip would show the
    // card back where it was for as long as the poll takes.
    expect(arrangedBy(five, ["e", "d", "c", "b", "a"]).map((h) => h.id)).toEqual([
      "e", "d", "c", "b", "a",
    ]);
  });

  it("ignores an order from before a card was taken or lost", () => {
    /**
     * Ignored rather than cleared, which is what keeps this a derivation. A
     * stale order that had to be *cleared* would be a second piece of state to
     * keep in step with the first, and the moment it fell behind the pack would
     * be drawn in an order describing cards that are not in it.
     */
    const fewer = pack("a", "b", "c");
    expect(arrangedBy(fewer, ["c", "b", "a", "d", "e"]).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores an order for a different set of the same size", () => {
    // Same length is not the same cards: one taken and one picked up between
    // the drag and the answer leaves a list that would sort half the pack to
    // the front and put the stranger nowhere in particular.
    expect(arrangedBy(pack("a", "b", "z"), ["z", "b", "c"]).map((h) => h.id)).toEqual(["a", "b", "z"]);
  });

  it("never hands back the array it was given", () => {
    // It is sorted in place further down; handing back the caller's array would
    // reorder the seat's own holdings under it.
    expect(arrangedBy(five, null)).not.toBe(five);
  });
});

describe("where the gap is", () => {
  it("is at the card being hovered", () => {
    expect(insertIndexIn(five, "c", "a")).toBe(2);
  });

  it("is nowhere when nothing is being hovered", () => {
    expect(insertIndexIn(five, null, "a")).toBe(-1);
  });

  it("is nowhere when nothing is in the air", () => {
    /**
     * A hover outlives what it was for. Put the card down with Escape or a
     * click on the board and the pointer has not moved, so nothing tells the
     * row to close — and the row does not merely stay open, it opens *wider*,
     * because `stepFor` reads a row with nothing lifted as a card arriving from
     * the body and steps the whole tail aside for it.
     */
    expect(insertIndexIn(five, "c", null)).toBe(-1);
  });

  it("is nowhere for a card that has left the pack", () => {
    expect(insertIndexIn(five, "gone", "a")).toBe(-1);
  });
});

describe("which way each card steps aside", () => {
  const row = (liftedIndex: number, insertIndex: number) =>
    five.map((_, index) => stepFor(index, { liftedIndex, insertIndex }));

  it("moves nothing while nothing is being aimed at", () => {
    expect(row(at("a"), -1)).toEqual([0, 0, 0, 0, 0]);
  });

  it("opens a place to the left by stepping the cards between there and the hollow right", () => {
    // Lift `d`, aim at `b`: b and c step right into the place d left, and the
    // way a hand opens a gap is exactly this.
    expect(row(at("d"), at("b"))).toEqual([0, 1, 1, 0, 0]);
  });

  it("closes a place to the right by stepping cards left into the hollow", () => {
    /**
     * The half that was wrong. Stepping right for both was the wrong picture:
     * everything from the target rightwards stays exactly where it is, since
     * nothing past the landing place moves — so dropping on the far end used to
     * shove the whole tail sideways to make a place that was already there,
     * several squares back.
     */
    expect(row(at("b"), at("d"))).toEqual([0, 0, -1, -1, 0]);
  });

  it("moves nothing when the card is aimed at its own square", () => {
    // The hollow it left is already the answer.
    expect(row(at("c"), at("c"))).toEqual([0, 0, 0, 0, 0]);
  });

  it("steps the whole tail aside for a card arriving from the body", () => {
    // Nothing was lifted out of the row, so there is no hollow to close and the
    // row has to open a real place.
    expect(row(-1, at("c"))).toEqual([0, 0, 1, 1, 1]);
  });
});

describe("the card a landing card goes in front of", () => {
  it("is the square you aimed at, coming from the right", () => {
    expect(landsBefore(five, "b", at("d"))).toBe("b");
  });

  it("is the card after it, coming from the left", () => {
    /**
     * The same square counted from the other end. Counting it from the wrong
     * end put the card down one place short of where it was aimed: point at the
     * fifth square and the fourth card was the one that moved.
     */
    expect(landsBefore(five, "d", at("b"))).toBe("e");
  });

  it("is the end of the row when you aim at the last card from the left", () => {
    expect(landsBefore(five, "e", at("b"))).toBeNull();
  });

  it("is the square you aimed at for a card off the body", () => {
    // It has no place in the row yet, so there is no hollow and no side to
    // arrive from.
    expect(landsBefore(five, "c", -1)).toBe("c");
  });

  it("is the square itself when the card is not in the row at all", () => {
    expect(landsBefore(five, "z", at("b"))).toBe("z");
  });
});

describe("the order a drop asks for", () => {
  it("puts the card in front of the one named", () => {
    expect(orderWith(five, "e", "b")).toEqual(["a", "e", "b", "c", "d"]);
  });

  it("puts it on the end when nothing is named", () => {
    expect(orderWith(five, "b", null)).toEqual(["a", "c", "d", "e", "b"]);
  });

  it("puts it on the end when the card named has gone", () => {
    // The row it was aimed at is a poll old. Landing at the back is wrong-ish
    // and recoverable; throwing is not.
    expect(orderWith(five, "b", "zniknela")).toEqual(["a", "c", "d", "e", "b"]);
  });

  it("takes the card out before deciding where it goes", () => {
    /**
     * The card picked up and put straight back down. Without the removal, `c`
     * would be counted as still sitting in front of itself and the splice would
     * land it one place along — which is how a card that had not been asked to
     * move ended up moving.
     */
    expect(orderWith(five, "c", "d")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("adds a card the pack has never held", () => {
    // A card coming off the body: the pack is a row a player arranges, and this
    // is the commonest way a card enters it.
    expect(orderWith(five, "helm", "c")).toEqual(["a", "b", "helm", "c", "d", "e"]);
  });
});

describe("a drop that changes nothing", () => {
  it("is recognised, so nothing is written", () => {
    /**
     * Dropping a card in front of the one that already follows it is a real aim
     * at a real place, and the place happens to be the one it is in. Allowed,
     * and answered with silence rather than with a round trip that reorders the
     * pack into the order it is already in — which would bump the revision and
     * wake every device at the table.
     */
    expect(sameOrder(orderWith(five, "c", "d"), five)).toBe(true);
  });

  it("is not confused with one that does", () => {
    expect(sameOrder(orderWith(five, "c", "b"), five)).toBe(false);
    expect(sameOrder(orderWith(five, "a", null), five)).toBe(false);
  });

  it("counts a card arriving from the body as a change", () => {
    // It is longer than the row it is being compared against, and every id up
    // to the insertion still matches — so a comparison that only walked the
    // shorter list would call this no change and drop the write.
    expect(sameOrder(orderWith(five, "helm", null), five)).toBe(false);
  });
});
