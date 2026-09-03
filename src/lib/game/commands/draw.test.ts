import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { CardClass } from "@/data/types";
import type { DeckState, Shuffle } from "@/lib/engine/deck";
import { PRINTED_STOCK } from "@/lib/engine/stock";
import type { TurnPhase } from "@/lib/engine/turn";
import { top } from "@/lib/engine/stack";
import { EVENT_COPIES, SPELL_COPIES, decksOf } from "../decks";
import { aHolding, aSeat, aTable } from "../fixture";
import { drawAll, drawCard, drawSpell, drawSpellWithWand, shopStock } from "./draw";
import { plural } from "@/lib/engine/polish";

/**
 * Real slice refs, not invented ones.
 *
 * A pile holds refs rather than ids because the box has genuine duplicates,
 * and a ref written out by hand would be a card no lookup can find — which is
 * a failure mode two of the tests below are specifically about.
 */
const eventRef = (cardId: string) => EVENT_COPIES.get(cardId)![0];
const spellRef = (spellId: string) => SPELL_COPIES.get(spellId)![0];

const pile = (draw: readonly string[], discard: readonly string[] = []): DeckState => ({
  draw: [...draw],
  discard: [...discard],
});

const piles = (over: { events?: DeckState; spells?: DeckState } = {}) => ({
  events: pile([]),
  spells: pile([]),
  ...over,
});

/**
 * The shuffle a test hands in, which is the point of taking one.
 *
 * Turning the used pile over reverses it, so the card that comes up next is a
 * fact the test states rather than a coin it throws. Nothing calls this unless
 * a pile has actually run dry.
 */
const reversed: Shuffle = (items) => [...items].reverse();

/** Blows up if a draw reaches for the shuffle when no pile has run out. */
const never: Shuffle = () => {
  throw new Error("nothing should have been reshuffled");
};

const HERE = asFieldId("mroczna-polana")!;

const onField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: HERE,
  from: null,
  draw: 1,
  drawn: [],
  ...over,
});

const deckAfter = (writes: { game?: { deck?: unknown } }) =>
  decksOf({ deck: writes.game?.deck ?? null });

/* ==========================================================================
 * A Karta Zdarzeń (15.1, 15.2, 15.5)
 * ======================================================================= */

describe("ciągnięcie Karty Zdarzeń", () => {
  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({
      seats: [aSeat({ id: "seat-a", field_id: HERE })],
      ...over,
      game: {
        turn_state: onField(),
        deck: piles({ events: pile([eventRef("cyklop"), eventRef("helm")]) }),
        ...(over.game ?? {}),
      },
    });

  it("refuses before the move has finished on an Obszar", () => {
    expect(() =>
      drawCard(table({ game: { turn_state: { phase: "roll" } } }), {
        named: null,
        shuffle: never,
      }),
    ).toThrow("Nie czas na ciągnięcie Kart — najpierw skończ ruch na Obszarze.");
  });

  /**
   * 13.4's count, which for a long time only the browser was keeping.
   *
   * "Jeżeli na danym Obszarze leżą już jakieś Karty, ciągnie się ich tylko
   * tyle, by ich suma równała się liczbie Kart..." — and 16.8's worked example
   * is the check: an abandoned Niedźwiedź and 2 Sztuki Złota become „2 z 3
   * Kart" for whoever stops there next. The waiting Karty are lifted into
   * `drawn` on arrival, so the sum is already there to compare against.
   *
   * The Draw button was disabled and nothing else refused, so the console and
   * the route could both draw a square dry.
   */
  describe("13.4's count", () => {
    /**
     * `draw` is what is *still* owed, subtracted on arrival — see `afterMove`.
     * These build the frame directly, so they state the remainder rather than
     * the printed number.
     */
    const owed = (draw: number, drawn: { cardId: string; cardClass: "foe" }[]) =>
      table({ game: { turn_state: onField({ draw, drawn }) } });
    const lying = [{ cardId: "cyklop", cardClass: "foe" as const }];

    it("refuses once the Karty lying here fill the number", () => {
      // HERE is Step I, which prints „wyciągnij 1 kartę" — and the refusal says
      // so, because `draw` is 0 whether the square asks for nothing or has been
      // filled, and only the board knows which.
      expect(() => drawCard(owed(0, lying), { named: null, shuffle: never })).toThrow(
        "Ten Obszar daje 1 — tyle już tu leży albo wyciągnięto (13.4).",
      );
    });

    it("says so differently where the Obszar draws nothing at all", () => {
      const bare = table({
        game: { turn_state: onField({ fieldId: asFieldId("karczma")!, draw: 0, drawn: [] }) },
        seats: [aSeat({ id: "seat-a", field_id: asFieldId("karczma")! })],
      });
      expect(() => drawCard(bare, { named: null, shuffle: never })).toThrow(
        "Na tym Obszarze nie ciągnie się Kart (13.4).",
      );
    });

    it("still draws what is left over", () => {
      const done = drawCard(owed(1, lying), { named: null, shuffle: never });
      expect(done.result.card?.id).toBe("cyklop");
    });

    /**
     * And spends it, so a square worth two is worth two and not for ever.
     *
     * The old shape compared the printed number against `drawn.length`, which
     * `takeCard` shrinks — so picking a blocker up handed the draw back and a
     * „wyciągnij 1 kartę" square with a Miecz on it paid out twice.
     */
    it("counts the draw off the Obszar's tally", () => {
      const after = drawCard(owed(1, lying), { named: null, shuffle: never });
      expect(top(after.writes.game!.turn_state!)).toMatchObject({ draw: 0 });
    });

    /**
     * A Karta's own instruction is not the player asking for more.
     *
     * Skalne Wrota says „wyciągnij 3 Karty" and Odmiana Losu swaps one for
     * another; 13.4 caps what the *square* owes, not what a card may do once it
     * is being resolved. It neither needs the tally nor spends it.
     */
    it("lets a Karta draw past it without spending it", () => {
      const done = drawCard(owed(0, lying), { named: null, shuffle: never, byCard: true });
      expect(done.result.card?.id).toBe("cyklop");
      expect(top(done.writes.game!.turn_state!)).toMatchObject({ draw: 0 });
    });
  });

  it("takes the top card and puts the pile back one shorter", () => {
    const { writes, result } = drawCard(table(), { named: null, shuffle: never });

    expect(result.card?.id).toBe("cyklop");
    expect(result.recycled).toBe(false);
    expect(deckAfter(writes).events).toEqual({ draw: [eventRef("helm")], discard: [] });
  });

  it("puts the card into the turn with the slice it came off", () => {
    const { writes } = drawCard(table(), { named: null, shuffle: never });
    expect(top(writes.game!.turn_state!)).toMatchObject({
      phase: "field",
      drawn: [{ cardId: "cyklop", cardClass: "foe", ref: eventRef("cyklop") }],
    });
  });

  it("journals the draw against the seat whose turn it is", () => {
    const { writes } = drawCard(table(), { named: null, shuffle: never });
    expect(writes.journal).toEqual([
      {
        seatId: "seat-a",
        round: 3,
        kind: "card",
        payload: {
          cardId: "cyklop",
          ref: eventRef("cyklop"),
          source: "talia",
          recycled: false,
        },
      },
    ]);
  });

  /**
   * 15.2 and 16.4: the numeral decides, not the order they came off the pile.
   *
   * The Wróg is drawn second and resolves first, because `afterDraw` re-sorts
   * the whole stack every time a card joins it. This is the rule that a draw
   * writing its own list would quietly lose.
   */
  it("re-orders the whole stack by class each time a card joins it", () => {
    const holding = table({
      game: {
        turn_state: onField({
          draw: 2,
          drawn: [{ cardId: "helm", cardClass: "item", ref: eventRef("helm") }],
        }),
        deck: piles({ events: pile([eventRef("cyklop")]) }),
      },
    });
    const { writes } = drawCard(holding, { named: null, shuffle: never });
    expect(
      (top(writes.game!.turn_state!) as Extract<TurnPhase, { phase: "field" }>).drawn.map(
        (card) => card.cardId,
      ),
    ).toEqual(["cyklop", "helm"]);
  });

  /** 15.5: the used pile is turned over and dealt from again, and it is said out loud. */
  it("turns the used pile over when the draw runs dry, and says so", () => {
    const dry = table({
      game: {
        deck: piles({
          events: pile([], [eventRef("helm"), eventRef("cyklop")]),
        }),
      },
    });
    const { writes, result } = drawCard(dry, { named: null, shuffle: reversed });

    // Reversed, so the Cyklop is on top of the recycled pile.
    expect(result.card?.id).toBe("cyklop");
    expect(result.recycled).toBe(true);
    expect(deckAfter(writes).events).toEqual({ draw: [eventRef("helm")], discard: [] });
    expect(writes.journal?.map((line) => line.kind)).toEqual(["reshuffle", "card"]);
    expect(writes.journal?.[0]).toEqual({
      seatId: null,
      round: 3,
      kind: "reshuffle",
      payload: { pile: "zdarzenia" },
    });
    expect(writes.journal?.[1]).toMatchObject({ payload: { recycled: true } });
  });

  it("refuses when there is nothing left in either pile", () => {
    const empty = table({ game: { deck: piles() } });
    expect(() => drawCard(empty, { named: null, shuffle: never })).toThrow(
      "Talia Kart Zdarzeń jest pusta.",
    );
  });

  it("refuses a slice the card index has never heard of", () => {
    const nonsense = table({ game: { deck: piles({ events: pile(["zdarzenia-9#99"]) }) } });
    expect(() => drawCard(nonsense, { named: null, shuffle: never })).toThrow(
      "Nieznana karta w talii: zdarzenia-9#99",
    );
  });

  describe("przy planszy", () => {
    const physical = (over: Parameters<typeof aTable>[0] = {}) =>
      table({ ...over, game: { mode: "companion", deck: null, ...(over.game ?? {}) } });

    it("has to be told which card came up", () => {
      expect(() => drawCard(physical(), { named: null, shuffle: never })).toThrow(
        "Podaj nazwę wyciągniętej karty.",
      );
    });

    it("takes the named card and never touches a pile", () => {
      const { writes, result } = drawCard(physical(), {
        named: { cardId: "cyklop", cardClass: "foe" },
        shuffle: never,
      });

      expect(result).toEqual({ card: expect.objectContaining({ id: "cyklop" }), recycled: false });
      expect(writes.game?.deck).toBeUndefined();
      expect(writes.journal?.[0]).toEqual({
        seatId: "seat-a",
        round: 3,
        kind: "card",
        payload: { cardId: "cyklop", cardClass: "foe", source: "fizyczna" },
      });
    });

    /** The referee is usable before the deck is transcribed: an unknown id is not an error. */
    it("still records a card nobody has transcribed", () => {
      const { result } = drawCard(physical(), {
        named: { cardId: "smok-z-tarnowa", cardClass: "foe" },
        shuffle: never,
      });
      expect(result.card).toBeNull();
    });
  });
});

/* ==========================================================================
 * Badanie Obszaru as one act (13.4)
 * ======================================================================= */

describe("wyciągnięcie wszystkich Kart naraz", () => {
  /** Płaskowyż Mgieł, the box's own worked example — it prints three. */
  const MGLY = asFieldId("plaskowyz-mgiel")!;

  const atMgly = (
    over: {
      draw?: number;
      drawn?: { cardId: string; cardClass: CardClass }[];
      events?: DeckState;
      mode?: "simulation" | "companion";
    } = {},
  ) =>
    aTable({
      seats: [aSeat({ id: "seat-a", field_id: MGLY })],
      game: {
        ...(over.mode ? { mode: over.mode } : {}),
        turn_state: {
          phase: "field",
          fieldId: MGLY,
          from: null,
          draw: over.draw ?? 3,
          drawn: (over.drawn ?? []) as never,
        },
        deck: piles({
          events:
            over.events ?? pile([eventRef("cyklop"), eventRef("helm"), eventRef("niedzwiedz")]),
        }),
      },
    });

  const stateAfter = (writes: { game?: { turn_state?: unknown } }) =>
    top(writes.game!.turn_state as never) as Extract<TurnPhase, { phase: "field" }>;

  /**
   * The whole point: at a table badanie Obszaru is one motion, not N of them.
   *
   * You stop, you look at what is lying there, you count, and you deal the
   * difference. Between the first press and the second the app used to be in a
   * state the game has no name for — half-explored — and every question about
   * it had to be answered about a moment that does not exist at a table.
   */
  it("deals everything the Obszar owes in one act", () => {
    const { writes, result } = drawAll(atMgly(), { shuffle: never });
    expect(result.dealt).toBe(3);
    const state = stateAfter(writes);
    expect(state.drawn).toHaveLength(3);
    expect(state.draw).toBe(0);
  });

  /**
   * 13.4: "ciągnie się ich tylko tyle, by ich suma równała się liczbie Kart" —
   * a Wilk and a Miecz already lying on a square that prints three.
   */
  it("deals only the difference when Karty are already lying here", () => {
    const { writes, result } = drawAll(
      atMgly({
        draw: 1,
        drawn: [
          { cardId: "wilk", cardClass: "foe" },
          { cardId: "miecz", cardClass: "item" },
        ],
      }),
      { shuffle: never },
    );
    expect(result.dealt).toBe(1);
    const state = stateAfter(writes);
    expect(state.drawn).toHaveLength(3);
    expect(state.draw).toBe(0);
  });

  /**
   * 15.2 is not this command's arithmetic and must not become a second copy of
   * it: every card joins through `afterDraw`, which re-runs `resolutionOrder`
   * over the whole stack. So a Wróg dealt second still resolves before a
   * Przedmiot dealt first.
   */
  it("orders what came up by 15.2, not by the order it was dealt", () => {
    const { writes } = drawAll(
      atMgly({ draw: 2, events: pile([eventRef("helm"), eventRef("cyklop")]) }),
      { shuffle: never },
    );
    expect(stateAfter(writes).drawn.map((one) => one.cardId)).toEqual(["cyklop", "helm"]);
  });

  it("keeps a Karta already lying here inside the same ordering", () => {
    const { writes } = drawAll(
      atMgly({
        draw: 1,
        drawn: [{ cardId: "helm", cardClass: "item" }],
        events: pile([eventRef("cyklop")]),
      }),
      { shuffle: never },
    );
    expect(stateAfter(writes).drawn.map((one) => one.cardId)).toEqual(["cyklop", "helm"]);
  });

  it("writes one journal line per Karta, not one for the gesture", () => {
    const { writes } = drawAll(atMgly({ draw: 2 }), { shuffle: never });
    expect((writes.journal ?? []).filter((line) => line.kind === "card")).toHaveLength(2);
  });

  /** 15.5: the used pile is turned over, and it used to happen in silence. */
  it("turns the used pile over when the deck runs short, and says so", () => {
    const { writes, result } = drawAll(
      atMgly({ draw: 2, events: pile([eventRef("cyklop")], [eventRef("helm")]) }),
      { shuffle: reversed },
    );
    expect(result.recycled).toBe(true);
    expect(result.dealt).toBe(2);
    expect((writes.journal ?? [])[0]).toMatchObject({ kind: "reshuffle" });
  });

  it("refuses before the move has finished on an Obszar", () => {
    const early = aTable({
      seats: [aSeat({ id: "seat-a", field_id: MGLY })],
      game: { turn_state: { phase: "roll" }, deck: piles() },
    });
    expect(() => drawAll(early, { shuffle: never })).toThrow(
      "Nie czas na ciągnięcie Kart — najpierw skończ ruch na Obszarze.",
    );
  });

  it("refuses a square that owes nothing, and names the number it prints", () => {
    expect(() => drawAll(atMgly({ draw: 0 }), { shuffle: never })).toThrow(/daje 3/);
  });

  it("refuses at a physical table, where the cardboard is dealt by hand", () => {
    expect(() => drawAll(atMgly({ mode: "companion", draw: 2 }), { shuffle: never })).toThrow(
      /nazwij każdą Kartę osobno/,
    );
  });
});

/* ==========================================================================
 * A Zaklęcie (9.2, 9.3, 9.5, 2.6)
 * ======================================================================= */

describe("rozdanie Zaklęcia", () => {
  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({
      ...over,
      game: {
        deck: piles({ spells: pile([spellRef("krag-plomieni")]) }),
        ...(over.game ?? {}),
      },
    });

  /** The Goblin's Magia of 1 buys no Zaklęcia at all — 2.6's table starts at 2. */
  const magical = (over: Parameters<typeof aSeat>[0] = {}) =>
    aSeat({ id: "seat-a", magic_own: 3, ...over });

  it("refuses a seat that is not at this table", () => {
    expect(() => drawSpell(table(), { seatId: "seat-z", shuffle: never })).toThrow(
      "Nieznane miejsce.",
    );
  });

  it("refuses a character whose Magia allows none (2.6)", () => {
    expect(() =>
      drawSpell(table({ seats: [aSeat({ magic_own: 1 })] }), {
        seatId: "seat-a",
        shuffle: never,
      }),
    ).toThrow("Magia tej Postaci nie pozwala na żadne Zaklęcia (2.6).");
  });

  it("refuses a character already holding its allowance", () => {
    const full = table({
      seats: [magical()],
      holdings: [
        aHolding({ id: "s-1", card_id: "krag-plomieni", kind: "spell", face: "hidden" }),
        aHolding({ id: "s-2", card_id: "magia-i-miecz", kind: "spell", face: "hidden" }),
      ],
    });
    expect(() => drawSpell(full, { seatId: "seat-a", shuffle: never })).toThrow(
      "Ta Postać może mieć najwyżej 2 Zaklęcia (2.6).",
    );
  });

  /** 9.3: the one kind of holding the rest of the table may not see. */
  it("deals the card face down and hands back its id", () => {
    const { writes, result } = drawSpell(table({ seats: [magical()] }), {
      seatId: "seat-a",
      shuffle: never,
    });

    expect(result).toBe("krag-plomieni");
    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "krag-plomieni", kind: "spell", face: "hidden" },
    ]);
    expect(deckAfter(writes).spells).toEqual({ draw: [], discard: [] });
    expect(writes.journal).toEqual([
      { seatId: "seat-a", round: 3, kind: "spell", payload: { spellId: "krag-plomieni" } },
    ]);
  });

  /** 9.5: "Jeśli stos zostanie wyczerpany, tasuje się Karty Zaklęć już użyte". */
  it("turns the used spells over when the stack runs dry, and says so", () => {
    const dry = table({
      seats: [magical()],
      game: {
        deck: piles({
          spells: pile([], [spellRef("magia-i-miecz"), spellRef("krag-plomieni")]),
        }),
      },
    });
    const { writes, result } = drawSpell(dry, { seatId: "seat-a", shuffle: reversed });

    expect(result).toBe("krag-plomieni");
    expect(writes.journal?.map((line) => line.kind)).toEqual(["reshuffle", "spell"]);
    expect(writes.journal?.[0]).toEqual({
      seatId: null,
      round: 3,
      kind: "reshuffle",
      payload: { pile: "zaklecia" },
    });
    expect(deckAfter(writes).spells).toEqual({
      draw: [spellRef("magia-i-miecz")],
      discard: [],
    });
  });

  it("refuses when there is not a Zaklęcie left anywhere", () => {
    const empty = table({ seats: [magical()], game: { deck: piles() } });
    expect(() => drawSpell(empty, { seatId: "seat-a", shuffle: never })).toThrow(
      "Stos Kart Zaklęć jest pusty.",
    );
  });

  it("sends a physical table to its own stack", () => {
    const physical = table({ seats: [magical()], game: { mode: "companion", deck: null } });
    expect(() => drawSpell(physical, { seatId: "seat-a", shuffle: never })).toThrow(
      "Przy planszy Zaklęcia ciągnie się z fizycznego stosu.",
    );
  });

  /**
   * The Różdżka floors the allowance beneath 2.6's table.
   *
   * A Goblin on Magia 1 may hold none by the table and one with the wand, which
   * is where the card is worth most.
   */
  it("lets the Różdżka raise a ceiling of none to one", () => {
    const wanded = table({
      seats: [aSeat({ magic_own: 1 })],
      holdings: [aHolding({ id: "h-wand", card_id: "rozdzka-zaklec", kind: "item" })],
    });
    expect(drawSpell(wanded, { seatId: "seat-a", shuffle: never }).result).toBe(
      "krag-plomieni",
    );
  });
});

/* ==========================================================================
 * The Różdżka's refill (9.5)
 * ======================================================================= */

describe("Różdżka Zaklęć", () => {
  const table = (over: Parameters<typeof aTable>[0] = {}) =>
    aTable({
      ...over,
      game: {
        deck: piles({ spells: pile([spellRef("krag-plomieni")]) }),
        ...(over.game ?? {}),
      },
    });

  const wand = (over: Parameters<typeof aHolding>[0] = {}) =>
    aHolding({ id: "h-wand", card_id: "rozdzka-zaklec", kind: "item", ...over });

  it("refuses a character who does not have one", () => {
    expect(() =>
      drawSpellWithWand(table({ seats: [aSeat({ magic_own: 3 })] }), {
        seatId: "seat-a",
        shuffle: never,
      }),
    ).toThrow("Ta Postać nie ma Różdżki Zaklęć.");
  });

  /** A beaten Wróg's card is a memory, not equipment: a trophy Różdżka casts nothing. */
  it("does not count one held as a trophy", () => {
    const trophied = table({
      seats: [aSeat({ magic_own: 3 })],
      holdings: [wand({ kind: "trophy" })],
    });
    expect(() => drawSpellWithWand(trophied, { seatId: "seat-a", shuffle: never })).toThrow(
      "Ta Postać nie ma Różdżki Zaklęć.",
    );
  });

  it("refills a Goblin who has cast its last Zaklęcie", () => {
    const empty = table({ seats: [aSeat({ magic_own: 1 })], holdings: [wand()] });
    const { writes, result } = drawSpellWithWand(empty, { seatId: "seat-a", shuffle: never });
    expect(result).toBe("krag-plomieni");
    expect(writes.holdings?.insert?.[0]).toMatchObject({ face: "hidden" });
  });

  /** "gdy ma tyle Zaklęć, ile na początku gry lub mniej" — a Goblin began with none. */
  it("waits until the hand is back down to the setup hand", () => {
    const holding = table({
      seats: [aSeat({ magic_own: 3 })],
      holdings: [wand(), aHolding({ id: "s-1", card_id: "krag-plomieni", kind: "spell" })],
    });
    expect(() => drawSpellWithWand(holding, { seatId: "seat-a", shuffle: never })).toThrow(
      "Różdżka daje nowe Zaklęcie dopiero, gdy nie masz żadnego.",
    );
  });

  /** The Czarodziej was dealt two at setup, so two is where the wand starts refilling. */
  it("measures a character against its own setup hand, not against 2.6", () => {
    const wizard = table({
      seats: [aSeat({ character_id: asSeatCharacter("czarodziej"), magic_own: 5 })],
      holdings: [
        wand(),
        aHolding({ id: "s-1", card_id: "krag-plomieni", kind: "spell" }),
        aHolding({ id: "s-2", card_id: "magia-i-miecz", kind: "spell" }),
        aHolding({ id: "s-3", card_id: "kamien-filozoficzny", kind: "spell" }),
      ],
    });
    expect(() => drawSpellWithWand(wizard, { seatId: "seat-a", shuffle: never })).toThrow(
      "Różdżka daje nowe Zaklęcie dopiero, gdy masz najwyżej 2 (tyle, co na początku gry).",
    );
  });
});

/* ==========================================================================
 * What the Wyposażenie has left (21.2)
 * ======================================================================= */

describe("stan Wyposażenia (21.2)", () => {
  it("offers every printed copy while nothing is in play", () => {
    expect(shopStock(aTable())).toEqual(PRINTED_STOCK);
  });

  it("counts a copy in somebody's pack against the pile", () => {
    const table = aTable({
      holdings: [
        aHolding({ id: "h-1", card_id: "magiczny-miecz" }),
        aHolding({ id: "h-2", card_id: "magiczny-miecz", seat_id: "seat-b" }),
      ],
    });
    expect(shopStock(table)["magiczny-miecz"]).toBe(PRINTED_STOCK["magiczny-miecz"] - 2);
  });

  /** 12.1 and 16.8: a card left lying on an Obszar is still out of the shop. */
  it("counts a copy lying on a field too", () => {
    const table = aTable({
      fieldCards: [{ id: "f-1", field_id: HERE, card_id: "latarnia", granted: false, pool: null }],
    });
    expect(shopStock(table).latarnia).toBe(0);
  });

  it("never goes below nothing when more are in play than the box printed", () => {
    const table = aTable({
      holdings: [0, 1].map((n) =>
        aHolding({ id: `h-${n}`, card_id: "latarnia", seat_id: `seat-${n}` }),
      ),
    });
    expect(shopStock(table).latarnia).toBe(0);
  });

  it("says nothing about cards the Wyposażenie sheet does not print", () => {
    expect(shopStock(aTable())).not.toHaveProperty("cyklop");
  });
});

describe("2.6's refusal says the number in Polish", () => {
  /**
   * A two-way ternary with no branch for one read "najwyżej 1 Zaklęć".
   * A Magia of 2 is a capacity of one, so it was reachable.
   */
  it("declines Zaklęcie for one, Zaklęcia for a few and Zaklęć for the rest", () => {
    expect(plural(1, "Zaklęcie", "Zaklęcia", "Zaklęć")).toBe("Zaklęcie");
    expect(plural(2, "Zaklęcie", "Zaklęcia", "Zaklęć")).toBe("Zaklęcia");
    expect(plural(3, "Zaklęcie", "Zaklęcia", "Zaklęć")).toBe("Zaklęcia");
    expect(plural(0, "Zaklęcie", "Zaklęcia", "Zaklęć")).toBe("Zaklęć");
    expect(plural(5, "Zaklęcie", "Zaklęcia", "Zaklęć")).toBe("Zaklęć");
  });
});
