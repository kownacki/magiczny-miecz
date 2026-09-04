import { describe, expect, it } from "vitest";
import {
  MOVE_HOLDS_FOR_MS,
  isStale,
  standingMoves,
  standingPicks,
  standingRules,
} from "./reconcile";
import type { Held, Seat } from "./table";
import { asSeatCharacter } from "@/lib/engine/characters";
import { asFieldId } from "@/lib/engine/board";
import type { CardId } from "@/data/ids";
import type { Slot } from "@/lib/engine/slots";

/**
 * The half-second in which the browser and the server disagree.
 *
 * Every rule here exists because a card, or a Karta Postaci, was seen in the
 * wrong place for one tick. That is a class of bug nobody reports properly —
 * "it flickered" — and none of it could be asked a question while it lived
 * inside a `setState` callback in the middle of a fetch.
 */

const NOW = Date.parse("2026-01-01T12:00:00Z");

function held(over: Partial<Held> = {}): Held {
  return {
    id: "h1",
    cardId: "helm" as CardId,
    kind: "item",
    face: "open",
    slot: null,
    granted: false,
    ...over,
  };
}

function seat(over: Partial<Seat> = {}): Seat {
  return {
    id: "seat-a",
    seat_index: 0,
    player_name: "Michał",
    character_id: asSeatCharacter("goblin"),
    field_id: asFieldId("osada"),
    sword_own: 2,
    magic_own: 1,
    sword_total: 2,
    magic_total: 1,
    spell_capacity: 1,
    sword_in_fight: 2,
    magic_in_fight: 1,
    life: 4,
    gold: 1,
    nature: "good",
    turns_lost: 0,
    stone_until_round: null,
    holdings: [],
    hidden_count: 0,
    away: false,
    // The person driving it, and everything about them, is a different row —
    // see `Seat`. The `as Seat` below is why the four columns that used to be
    // here survived the split in this file without a word from the compiler.
    driver_id: "usra",
    eliminated: false,
    effects: [],
    ...over,
  } as Seat;
}

describe("an answer that arrived out of order", () => {
  it("is dropped when it is behind what is on screen", () => {
    /**
     * The poll and a move's own refetch are in flight together, and a poll that
     * started before the write can land after it. Rendering it puts the old
     * table back and snaps the card the player just moved into its old place,
     * until the next tick moves it again.
     */
    expect(isStale(6, 7)).toBe(true);
  });

  it("is not dropped when it says the same thing", () => {
    // Two reads of a table nobody has touched carry the same number. Refusing
    // the second would drop every answer after the first, and the screen would
    // stop at whatever it happened to be showing.
    expect(isStale(7, 7)).toBe(false);
  });

  it("is not dropped when it is news", () => {
    expect(isStale(8, 7)).toBe(false);
  });

  it("renders the first answer of all", () => {
    // The counter starts below every real revision so that nothing has to be a
    // special case on the first poll.
    expect(isStale(0, -1)).toBe(false);
  });
});

describe("a Karta Postaci taken before the server said so", () => {
  const goblin = asSeatCharacter("goblin")!;
  const kaplanka = asSeatCharacter("kaplanka")!;

  it("stands while the seat still shows something else", () => {
    const pending = { "seat-a": goblin };
    expect(standingPicks(pending, [seat({ character_id: null })])).toEqual(
      pending,
    );
  });

  it("is dropped the moment the server reports the same thing", () => {
    // Kept any longer it would be a second copy of a truth the table already
    // holds, and the two would drift the moment anything else changed the seat.
    expect(
      standingPicks({ "seat-a": goblin }, [seat({ character_id: goblin })]),
    ).toEqual({});
  });

  it("is dropped when the seat has gone", () => {
    // Nothing left to be waiting for. A seat swept out of the poczekalnia
    // cannot confirm anything, and holding the pick would show a character on a
    // row that is not there.
    expect(standingPicks({ "seat-gone": goblin }, [seat()])).toEqual({});
  });

  it("keeps one seat's pick while dropping another's", () => {
    const still = standingPicks({ "seat-a": goblin, "seat-b": kaplanka }, [
      seat({ id: "seat-a", character_id: goblin }),
      seat({ id: "seat-b", character_id: null }),
    ]);
    expect(still).toEqual({ "seat-b": kaplanka });
  });

  it("hands back the very same object when nothing was dropped", () => {
    /**
     * This is React state read on every poll. Rebuilding an identical object
     * would be a re-render every two seconds, per device, all game — in the
     * case that is by far the commonest, which is that nothing is pending at
     * all.
     */
    const empty = {};
    expect(standingPicks(empty, [seat()])).toBe(empty);
    const pending = { "seat-a": goblin };
    expect(standingPicks(pending, [seat({ character_id: null })])).toBe(
      pending,
    );
  });
});

describe("a card moved on screen before the server said so", () => {
  const glowa: Slot = "head";
  const wearing = (slot: Slot | null) => [seat({ holdings: [held({ slot })] })];

  it("stands while the server still has the card where it was", () => {
    const pending = { h1: glowa };
    expect(standingMoves(pending, wearing(null), { h1: NOW }, NOW)).toEqual(
      pending,
    );
  });

  it("is dropped once the server agrees the card is there", () => {
    expect(
      standingMoves({ h1: glowa }, wearing(glowa), { h1: NOW }, NOW),
    ).toEqual({});
  });

  it("treats a card in the pack and a card with no slot at all as the same place", () => {
    /**
     * The wire sends `slot: null` for the pack and the optimistic move writes
     * null too — but `slot` is *optional* on a `Held`, so a card that carries no
     * such key must count as agreement as well, or taking something off would
     * never settle and the card would hang until the timeout dropped it.
     *
     * Written without the key rather than with a null one, which is the whole
     * point: a `held({ slot: null })` passes either way.
     */
    const bare = {
      id: "h1",
      cardId: "helm" as CardId,
      kind: "item",
      face: "open",
    } as Held;
    expect("slot" in bare).toBe(false);
    expect(
      standingMoves(
        { h1: null },
        [seat({ holdings: [bare] })],
        { h1: NOW },
        NOW,
      ),
    ).toEqual({});
  });

  it("is dropped when the card itself has gone", () => {
    // Dropped, spent or lost while the move was in flight. There is nothing
    // left to pin.
    expect(
      standingMoves({ h1: glowa }, [seat({ holdings: [] })], { h1: NOW }, NOW),
    ).toEqual({});
  });

  it("stops standing after two polls' worth of silence", () => {
    /**
     * The one that keeps a lost request from pinning a card for the rest of the
     * evening. Without it a move whose request never arrived stays on screen
     * for ever, in a place the table does not know about — which is worse than
     * the flicker it was there to prevent.
     */
    const pending = { h1: glowa };
    const made = { h1: NOW };
    expect(
      standingMoves(pending, wearing(null), made, NOW + MOVE_HOLDS_FOR_MS - 1),
    ).toEqual(pending);
    expect(
      standingMoves(pending, wearing(null), made, NOW + MOVE_HOLDS_FOR_MS + 1),
    ).toEqual({});
  });

  it("times the wait from the move and not from any answer", () => {
    /**
     * A move with no recorded moment is already expired, which is the safe
     * direction: the alternative is a move that never times out because nobody
     * wrote down when it was made.
     */
    expect(standingMoves({ h1: glowa }, wearing(null), {}, NOW)).toEqual({});
  });

  it("holds both halves of a swap, and lets go of both", () => {
    /**
     * Putting a card on a place that is taken moves two cards. Only the one
     * being put on used to be held here, so the card it replaced sat on the
     * body until the next poll — you saw your Excalibur go on and your Miecz
     * stay where it was, which is not a swap, it is a glitch that fixes itself.
     */
    const hand = (a: Slot | null, b: Slot | null) => [
      seat({
        holdings: [held({ id: "h1", slot: a }), held({ id: "h2", slot: b })],
      }),
    ];
    const pending = { h1: glowa, h2: null };
    const made = { h1: NOW, h2: NOW };
    expect(standingMoves(pending, hand(null, glowa), made, NOW)).toEqual(
      pending,
    );
    expect(standingMoves(pending, hand(glowa, null), made, NOW)).toEqual({});
  });

  it("hands back the very same object when nothing was dropped", () => {
    const empty = {};
    expect(standingMoves(empty, wearing(null), {}, NOW)).toBe(empty);
  });
});

describe("zasady stołu trzymane przed serwerem", () => {
  const table = { eq_mode: "slots", endless_stock: true };

  it("keeps a rule the server has not caught up with", () => {
    expect(standingRules({ eq_mode: "classic" }, table)).toEqual({
      eq_mode: "classic",
    });
  });

  it("drops one the table already has", () => {
    expect(standingRules({ eq_mode: "slots" }, table)).toEqual({});
  });

  /**
   * The reason this goes through `keepIf` rather than being written out: a
   * table with nothing pending is the commonest case by far, and rebuilding
   * the object every poll re-renders every device every two seconds.
   */
  it("hands back the very same object when nothing was dropped", () => {
    const pending = { eq_mode: "classic" as const };
    expect(standingRules(pending, table)).toBe(pending);
  });

  it("keeps the ones still waiting and drops the rest", () => {
    expect(
      standingRules({ eq_mode: "classic", endless_stock: true }, table),
    ).toEqual({
      eq_mode: "classic",
    });
  });
});
