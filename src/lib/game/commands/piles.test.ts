import { describe, expect, it } from "vitest";
import type { DeckState } from "@/lib/engine/deck";
import { EVENT_COPIES, SPELL_COPIES, decksOf } from "../decks";
import { aTable } from "../fixture";
import { putOnPile, stackAt, stackForDraw, trophiesToPile } from "./piles";

/**
 * The one door every card leaves a hand through, and the two things it keeps out.
 *
 * The invariant this guards: **a card never leaves the game.** Nineteen places
 * in the commands delete a holding — a death, a drop, a card used, a Zaklęcie
 * spoken, a trade, a toll on the bridge, the Kamień, the host's withdrawal —
 * and every one of them pairs the delete with a return, because a card that is
 * deleted has not been „odłożona na stos zużytych": it is out of the box, and
 * 9.5 can never bring it back.
 *
 * Two things are deliberately not returned, and both live here rather than at
 * the nineteen call sites, which is the whole reason this function exists.
 * They are tested here because they are exceptions to an invariant, and an
 * untested exception is how an invariant stops being one.
 */

const eventRef = (cardId: string) => EVENT_COPIES.get(cardId)![0];
const spellRef = (spellId: string) => SPELL_COPIES.get(spellId)![0];
const pile = (draw: readonly string[] = [], discard: readonly string[] = []): DeckState => ({
  draw: [...draw],
  discard: [...discard],
});
const table = (over: Parameters<typeof aTable>[0] = {}) =>
  aTable({ ...over, game: { deck: { events: pile(), spells: pile() }, ...(over.game ?? {}) } });
const after = (writes: { game?: { deck?: unknown } }) =>
  decksOf({ deck: writes.game?.deck ?? null });

describe("putting a card back (9.5, 21.2)", () => {
  it("sends a Karta Zdarzeń to the stos zużytych", () => {
    const writes = putOnPile(table(), "events", [{ cardId: "cyklop" }]);
    expect(after(writes).events.discard).toEqual([eventRef("cyklop")]);
  });

  it("sends a Zaklęcie to its own pile", () => {
    const writes = putOnPile(table(), "spells", [{ cardId: "ocalony" }]);
    expect(after(writes).spells.discard).toEqual([spellRef("ocalony")]);
  });

  /**
   * A conjured card belongs to no pile: the deck never gave it up, and its own
   * copy is still waiting in the draw. Returning one is how a table ends the
   * evening holding two Cyklopy.
   */
  it("keeps a card the test console conjured out of every pile", () => {
    const writes = putOnPile(table(), "events", [{ cardId: "cyklop", granted: true }]);
    expect(writes).toEqual({});
  });

  /**
   * 21.2 makes the Wyposażenie a stock rather than a deck — „umieszcza się je
   * powtórnie w stosie Kart zakupów" — and eleven of the twelve are *also* in
   * the event deck. Pushing a sold Hełm onto the used pile would hand the deck
   * a thirteenth Hełm and the shop its own back at once; `stockLeft` puts it
   * back on the shelf by arithmetic instead, the moment it stops being in play.
   */
  it("leaves the Wyposażenie to its own stock rather than the used pile", () => {
    const writes = putOnPile(table(), "events", [{ cardId: "helm" }]);
    expect(writes).toEqual({});
  });

  /** At a physical table the pile is a pile, and the app is not holding it. */
  it("writes nothing in companion mode", () => {
    const writes = putOnPile(table({ game: { mode: "companion" } }), "events", [
      { cardId: "cyklop" },
    ]);
    expect(writes).toEqual({});
  });
});

describe("trofea going back (1.4, 4.4)", () => {
  // Rows as the holdings table hands them over, which is what the four callers
  // pass — `trophiesToPile` reads `card_id`, not `cardId`.
  const beaten = [{ card_id: "cyklop", granted: false }];

  it("sends the Karta back in the mode where it was being hoarded", () => {
    const writes = trophiesToPile(table({ game: { trophy_mode: "cards" } }), beaten);
    expect(after(writes).events.discard).toEqual([eventRef("cyklop")]);
  });

  /**
   * „Punkty" already sent it, at the moment the Wróg died — what stays on the
   * seat is a copy of him. Returning it again is the same double as a granted
   * card: a box holding one Wilkołak ending the evening holding two.
   */
  it("sends nothing back in the mode where the deck already has it", () => {
    const writes = trophiesToPile(table({ game: { trophy_mode: "points" } }), beaten);
    expect(writes).toEqual({});
  });
});

/**
 * Arranging the pile so a named Karta comes up next.
 *
 * The point of it is what it *doesn't* do: `give`, `place` and `summon` all put
 * a card in play by fiat and skip 15.2's ordering, the card's own disposition
 * and the journal line saying where it went. This puts the card back on the
 * deck's own path, so a test table watching a script run watches the same thing
 * a game would.
 */
describe("stacking a card for the next draw", () => {
  const seatId = "seat-a";
  const stacked = (over: Parameters<typeof aTable>[0], cardId: string) =>
    stackForDraw(table(over), { seatId, cardId });

  it("brings a card up from the middle of the draw pile", () => {
    const events = pile([eventRef("smok"), eventRef("cyklop"), eventRef("wilkolak")]);
    const out = stacked({ game: { deck: { events, spells: pile() } } }, "cyklop");
    expect(after(out.writes).events.draw).toEqual([
      eventRef("cyklop"),
      eventRef("smok"),
      eventRef("wilkolak"),
    ]);
  });

  /** 9.5's used pile is a pile, and a card already spent can be asked for again. */
  it("takes one back off the stos zużytych", () => {
    const events = pile([eventRef("smok")], [eventRef("cyklop")]);
    const out = stacked({ game: { deck: { events, spells: pile() } } }, "cyklop");
    expect(after(out.writes).events.draw).toEqual([eventRef("cyklop"), eventRef("smok")]);
    expect(after(out.writes).events.discard).toEqual([]);
  });

  /** A move, not an insertion — the box keeps the copies it was printed with. */
  it("does not conjure a second copy", () => {
    const events = pile([eventRef("smok"), eventRef("cyklop")]);
    const out = stacked({ game: { deck: { events, spells: pile() } } }, "cyklop");
    const { draw, discard } = after(out.writes).events;
    expect([...draw, ...discard].length).toBe(2);
  });

  it("knows a Zaklęcie from a Karta Zdarzeń, and says which", () => {
    const spells = pile([spellRef("magia-i-miecz"), spellRef("ocalony")]);
    const out = stacked({ game: { deck: { events: pile(), spells } } }, "ocalony");
    expect(out.result).toBe("spells");
    expect(after(out.writes).spells.draw[0]).toBe(spellRef("ocalony"));
  });

  /**
   * Every copy in play is a refusal.
   *
   * The alternative is a second Cyklop on top of a deck that only ever held
   * one, which is the failure `returningRef` exists to prevent going the other
   * way — and a test table that quietly gains cards is worse than one that says
   * no.
   */
  it("refuses when no copy is in a pile", () => {
    expect(() => stacked({ game: { deck: { events: pile(), spells: pile() } } }, "cyklop")).toThrow(
      /w grze/,
    );
  });

  it("refuses a card that belongs to no deck at all (21.2)", () => {
    // Eleven of the twelve Wyposażenie cards are also in the event deck; the
    // TARCZA TOLIMANA is the one that is only ever bought, so it is the only
    // card in the box with no pile to sit on top of. `STACKABLE` does not offer
    // it either, so this is the door held shut behind the list.
    expect(() => stacked({}, "tarcza-tolimana")).toThrow(/talii/);
  });

  /** Marked manual, like every other thing the console conjures. */
  it("writes it down", () => {
    const events = pile([eventRef("cyklop")]);
    const out = stacked({ game: { deck: { events, spells: pile() } } }, "cyklop");
    expect(out.writes.journal).toEqual([
      { seatId, round: 3, kind: "test-stack", payload: { cardId: "cyklop" }, manual: true },
    ]);
  });
});

/**
 * The same, by where the card lies rather than by what it is called.
 *
 * The half `pile` needs to be worth printing: having read the draw order
 * numbered from the top, `stack 10` is how you say "that one".
 */
describe("stacking by position", () => {
  const seatId = "seat-a";
  const three = pile([eventRef("smok"), eventRef("cyklop"), eventRef("wilkolak")]);
  const at = (n: number, which: "events" | "spells" = "events") =>
    stackAt(table({ game: { deck: { events: three, spells: pile([spellRef("ocalony")]) } } }), {
      seatId,
      pile: which,
      at: n,
    });

  it("counts from the top, one-based, like the list it answers", () => {
    expect(at(2).result).toBe("cyklop");
    expect(after(at(2).writes).events.draw[0]).toBe(eventRef("cyklop"));
  });

  /** Already on top is what was asked for, so it is a no-op and not an error. */
  it("takes the first without complaining", () => {
    expect(at(1).result).toBe("smok");
    expect(after(at(1).writes).events.draw).toEqual(three.draw);
  });

  it("says how many there are rather than just refusing", () => {
    expect(() => at(4)).toThrow(/3 Kart/);
    expect(() => at(0)).toThrow(/3 Kart/);
  });

  it("counts down the pile it was pointed at", () => {
    expect(at(1, "spells").result).toBe("ocalony");
  });

  it("has nothing to offer from an empty pile", () => {
    const bare = table({ game: { deck: { events: pile(), spells: pile() } } });
    expect(() => stackAt(bare, { seatId, pile: "events", at: 1 })).toThrow(/pusta/);
  });
});
