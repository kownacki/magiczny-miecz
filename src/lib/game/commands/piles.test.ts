import { describe, expect, it } from "vitest";
import type { DeckState } from "@/lib/engine/deck";
import { EVENT_COPIES, SPELL_COPIES, decksOf } from "../decks";
import { aTable } from "../fixture";
import { putOnPile, trophiesToPile } from "./piles";

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
