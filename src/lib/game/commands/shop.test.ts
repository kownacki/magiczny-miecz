import { describe, expect, it } from "vitest";
import type { Snapshot } from "../change";
import { asFieldId } from "@/lib/engine/board";
import { combatValueOf } from "@/lib/engine/cards";
import { EVENTS } from "../decks";
import { aHolding, aSeat, aTable } from "../fixture";
import { TROPHY_RATE, buyGoods, offerOn, payHealer, sellHolding, tradeTrophies } from "./shop";
import { goodsId } from "@/lib/engine/goods";
import { only } from "@/lib/engine/stack";
import type { TurnPhase } from "@/lib/engine/turn";

/** The board's own establishments, read off `fieldScript.ts` rather than guessed. */
const GROD = asFieldId("grod")!; // Lichwiarz, 1 Sz. Z.
const OSADA = asFieldId("osada")!; // Znachor, 1 Sz. Z.
const STEP = asFieldId("step-1")!; // nothing at all

/**
 * Standing on the Obszar, move finished, nothing owed — 12.1's own window.
 *
 * The turn frame used to be left at `aTable`'s default `roll`, because nothing
 * looked: `standingShopper` asked whether the seat existed and stood somewhere
 * and stopped there. It asks 12.1 now, the way the taking commands next door
 * always have — so these fixtures have to be in the window they were always
 * meant to be describing. Everything below is about prices, stock and purses,
 * and the window is what lets it stay about those.
 */
const standing = (
  fieldId: typeof GROD,
  seat: Parameters<typeof aSeat>[0] = {},
  holdings: ReturnType<typeof aHolding>[] = [],
) =>
  aTable({
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: fieldId, ...seat })],
    game: {
      active_seat: 0,
      turn_state: only({
        phase: "field",
        fieldId,
        from: null,
        draw: 0,
        drawn: [],
      } as TurnPhase),
    },
    holdings,
  });

describe("what an Obszar is offering", () => {
  it("finds the desk printed on the board, and says whose it is", () => {
    // The name comes back with the offer so a journal line can say where a
    // purse changed — two vendors in this box sell a Miecz at different prices.
    expect(offerOn(standing(GROD), GROD, "sprzedaj")).toMatchObject({
      from: "Lichwiarz",
      effect: { cena: 1 },
    });
    expect(offerOn(standing(OSADA), OSADA, "uzdrow")).toMatchObject({
      from: "Medyk",
      effect: { cena: 1 },
    });
  });

  it("finds nothing where there is nothing", () => {
    expect(offerOn(standing(STEP), STEP, "sprzedaj")).toBeNull();
    expect(offerOn(standing(STEP), STEP, "uzdrow")).toBeNull();
  });

  /**
   * The one the whole feature turned on, and it was inverted.
   *
   * Arriving lifts every `field_cards` row into the turn's frame, so on the
   * turn you land on a TARGOWISKO it is in `drawn` and not on the board. Reading
   * only the board meant the shop answered "Na tym Obszarze nie ma czego kupić"
   * for the whole of the one turn 12.1 lets you use it, and served anybody
   * merely passing through on some other turn — which 13.1 forbids outright.
   * Precisely backwards, and invisible, both halves being the same Karta on the
   * same square.
   */
  it("finds a shop the turn is holding, not only one lying on the board", () => {
    const HERE = OSADA;
    const midTurn = aTable({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE })],
      game: {
        active_seat: 0,
        turn_state: only({
          phase: "field",
          fieldId: HERE,
          from: null,
          draw: 0,
          drawn: [{ cardId: "targowisko", cardClass: "place", granted: false }],
        } as TurnPhase),
      },
    });
    expect(offerOn(midTurn, HERE, "kup")).not.toBeNull();
    // And the Karta has to be on *this* square: another turn's frame elsewhere
    // is not a shelf here.
    expect(offerOn(midTurn, STEP, "kup")).toBeNull();
  });

  /** 16.8 leaves a shop that walked in as a Karta lying there; 21.1 counts it. */
  it("finds one that arrived as a card and stayed", () => {
    const withCard = aTable({
      seats: [aSeat({ id: "seat-a", field_id: STEP })],
      fieldCards: [{ id: "fc1", field_id: "step-1", card_id: "alchemik", granted: false, pool: null }],
    });
    // Only asserts the walk reaches field cards at all; which card carries what
    // is `cardScript.ts`'s business and is tested there.
    expect(offerOn(withCard, STEP, "sprzedaj")).not.toBeUndefined();
  });
});

describe("trading trophies (1.4)", () => {
  /** A real Wróg and its printed Miecz, so the arithmetic is the game's. */
  const wrog = EVENTS.find((c) => (combatValueOf(c)?.total ?? 0) >= TROPHY_RATE)!;
  const worth = combatValueOf(wrog)!.total;

  it("refuses when there is nothing to hand in", () => {
    expect(() => tradeTrophies(standing(GROD), { seatId: "seat-a" })).toThrow(
      new RegExp(`${TROPHY_RATE} punktów`),
    );
  });

  it("refuses below the rate", () => {
    const weak = EVENTS.find((c) => {
      const t = combatValueOf(c)?.total;
      return t !== undefined && t > 0 && t < TROPHY_RATE;
    })!;
    const table = aTable({
      seats: [aSeat({ id: "seat-a" })],
      holdings: [aHolding({ id: "t0", card_id: weak.id, kind: "trophy" })],
    });
    expect(() => tradeTrophies(table, { seatId: "seat-a" })).toThrow();
  });

  /**
   * „Posiada zawsze tyle punktów Miecza, ile jego przeciwnik."
   *
   * The Sobowtór's Karta carries no number, so what he is worth in a trade is
   * the same question his fight asked: how strong is the character opposite.
   * Held, that is the one holding him — he was made out of them.
   */
  it("prices the Sobowtór at his holder's own Miecz", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a", sword_own: 7 })],
      holdings: [aHolding({ id: "t0", card_id: "sobowtor", kind: "trophy" })],
    });
    const { writes, result } = tradeTrophies(table, { seatId: "seat-a" });
    // Seven of his own buys exactly one Miecz and wastes nothing.
    expect(result).toBe(1);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "trophies-traded",
      payload: { points: 7, gained: 1, lost: 0 },
    });
  });

  it("refuses him when his holder is not worth the rate", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a", sword_own: 3 })],
      holdings: [aHolding({ id: "t0", card_id: "sobowtor", kind: "trophy" })],
    });
    expect(() => tradeTrophies(table, { seatId: "seat-a" })).toThrow(/masz 3/);
  });

  it("pays one Miecz per seven points and loses the remainder", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a", sword_own: 2 })],
      holdings: [aHolding({ id: "t0", card_id: wrog.id, kind: "trophy" })],
    });
    const { writes, result } = tradeTrophies(table, { seatId: "seat-a" });
    expect(result).toBe(Math.floor(worth / TROPHY_RATE));
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { sword_own: 2 + result } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "trophies-traded",
      payload: { points: worth, gained: result, lost: worth - result * TROPHY_RATE },
    });
  });

  it("hands in every trophy, not just the ones that paid", () => {
    const spare = EVENTS.find(
      (c) => c.id !== wrog.id && (combatValueOf(c)?.total ?? 0) > 0,
    )!;
    const table = aTable({
      seats: [aSeat({ id: "seat-a" })],
      holdings: [
        aHolding({ id: "t0", card_id: wrog.id, kind: "trophy" }),
        aHolding({ id: "t1", card_id: spare.id, kind: "trophy" }),
      ],
    });
    expect(tradeTrophies(table, { seatId: "seat-a" }).writes.holdings?.delete).toEqual([
      "t0",
      "t1",
    ]);
  });

  it("leaves everything that is not a trophy alone", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a" })],
      holdings: [
        aHolding({ id: "t0", card_id: wrog.id, kind: "trophy" }),
        aHolding({ id: "h1", card_id: "helm", kind: "item" }),
      ],
    });
    expect(tradeTrophies(table, { seatId: "seat-a" }).writes.holdings?.delete).toEqual(["t0"]);
  });

  /**
   * The „Punkty" variant, where there are no Karty to choose between.
   *
   * Same rate and same shop; what changes is that the score is a number on the
   * seat, so a trade takes sevens out of it and leaves the rest standing —
   * there is nothing to hand in and nothing to waste. See docs/TROFEA.md.
   */
  /**
   * The same trade, and the tests are the other block's with one line changed.
   *
   * „Punkty" holds trophies exactly as „Karty pokonanych" does; what it does
   * not hold is the cardboard, which went back to the stos zużytych when the
   * Wróg died. So the choice, the rate and the waste are all shared, and the
   * only thing this block has to prove is that no Karta goes back twice.
   */
  describe("in punkty mode", () => {
    const scoring = (cardIds: string[], sword = 2) =>
      aTable({
        game: { trophy_mode: "points" },
        seats: [aSeat({ id: "seat-a", sword_own: sword })],
        holdings: cardIds.map((cardId, at) =>
          aHolding({ id: `t${at}`, seat_id: "seat-a", card_id: cardId, kind: "trophy" }),
        ),
      });

    it("pays one Miecz per seven, as the printed mode does", () => {
      // CYKLOP 6 + SMOK 5 + NOBBIN 2 = 13, one Miecz and six wasted.
      const { writes, result } = tradeTrophies(scoring(["cyklop", "smok", "nobbin"]), {
        seatId: "seat-a",
      });
      expect(result).toBe(1);
      expect(writes.seats).toEqual([{ id: "seat-a", patch: { sword_own: 3 } }]);
    });

    /** The one thing this mode changes, and the one thing worth its own test. */
    it("sends no Karta back, the pile having had it since the kill", () => {
      const { writes } = tradeTrophies(scoring(["cyklop", "smok", "nobbin"]), {
        seatId: "seat-a",
      });
      expect(writes.holdings?.delete).toHaveLength(3);
      expect(writes.game).toBeUndefined();
    });

    it("refuses below the rate rather than banking a fraction", () => {
      expect(() => tradeTrophies(scoring(["nobbin"]), { seatId: "seat-a" })).toThrow(
        new RegExp(`${TROPHY_RATE} punktów`),
      );
    });

    /** Naming Karty works here too: they are trophies, whoever holds the paper. */
    it("hands in only the trophies that were named", () => {
      const { writes } = tradeTrophies(scoring(["cyklop", "smok", "nobbin"]), {
        seatId: "seat-a",
        cardIds: ["cyklop", "nobbin"],
      });
      expect(writes.holdings?.delete).toEqual(["t0", "t2"]);
    });
  });
});

describe("selling to the Lichwiarz (21.2)", () => {
  it("pays the printed price and takes the card away", () => {
    const table = standing(GROD, { gold: 1 }, [aHolding({ id: "h1", card_id: "helm" })]);
    const { writes } = sellHolding(table, { seatId: "seat-a", holdingId: "h1" });
    expect(writes.holdings?.delete).toEqual(["h1"]);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { gold: 2 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "sold",
      payload: { cardId: "helm", price: 1 },
    });
  });

  it("refuses where nobody buys", () => {
    const table = standing(STEP, {}, [aHolding({ id: "h1" })]);
    expect(() => sellHolding(table, { seatId: "seat-a", holdingId: "h1" })).toThrow(
      /Nikt tu nie skupuje/,
    );
  });

  /** A Przyjaciel is a person and a trophy is a memory; he deals in neither. */
  it("buys only Przedmioty", () => {
    for (const kind of ["friend", "trophy", "spell"] as const) {
      const table = standing(GROD, {}, [aHolding({ id: "x", card_id: "wilk", kind })]);
      expect(() => sellHolding(table, { seatId: "seat-a", holdingId: "x" })).toThrow(
        /tylko Przedmioty/,
      );
    }
  });

  it("refuses a card the seat does not hold", () => {
    expect(() => sellHolding(standing(GROD), { seatId: "seat-a", holdingId: "no" })).toThrow(
      /Nie masz tej karty/,
    );
  });
});

describe("paying the Znachor (4.7)", () => {
  it("buys back a point and charges for it", () => {
    const table = standing(OSADA, { life: 2, gold: 3 });
    const { writes, result } = payHealer(table, { seatId: "seat-a", points: 1 });
    expect(result).toEqual({ healed: 1, paid: 1 });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3, gold: 2 } }]);
  });

  it("buys no more than 4.7 allows, however much is asked for", () => {
    const table = standing(OSADA, { life: 3, gold: 9 });
    expect(payHealer(table, { seatId: "seat-a", points: 5 }).result).toEqual({
      healed: 1,
      paid: 1,
    });
  });

  it("buys no more than the purse holds", () => {
    const table = standing(OSADA, { life: 1, gold: 2 });
    expect(payHealer(table, { seatId: "seat-a", points: 3 }).result).toEqual({
      healed: 2,
      paid: 2,
    });
  });

  it("refuses a character already at the starting level", () => {
    const table = standing(OSADA, { life: 4, gold: 9 });
    expect(() => payHealer(table, { seatId: "seat-a", points: 1 })).toThrow(/4\.7 nie pozwala/);
  });

  it("refuses an empty purse", () => {
    const table = standing(OSADA, { life: 1, gold: 0 });
    expect(() => payHealer(table, { seatId: "seat-a", points: 1 })).toThrow(/Za mało złota/);
  });

  it("asks for a real number of points", () => {
    const table = standing(OSADA, { life: 1, gold: 5 });
    for (const points of [0, -1, 1.5]) {
      expect(() => payHealer(table, { seatId: "seat-a", points })).toThrow(/Ile punktów/);
    }
  });

  it("refuses where nobody heals", () => {
    expect(() => payHealer(standing(STEP, { life: 1 }), { seatId: "seat-a", points: 1 })).toThrow(
      /nikt nie leczy/,
    );
  });
});

describe("a seat that is not standing anywhere", () => {
  it("cannot trade at all", () => {
    const nowhere = aTable({ seats: [aSeat({ id: "seat-a", field_id: null })] });
    expect(() => sellHolding(nowhere, { seatId: "seat-a", holdingId: "x" })).toThrow(
      /nie stoi jeszcze/,
    );
    expect(() => payHealer(nowhere, { seatId: "seat-a", points: 1 })).toThrow(/nie stoi jeszcze/);
  });
});

describe("buying from a shelf (21.1)", () => {
  /** Osada's shop, whose prices are printed in `fieldScript.ts`. */
  const shopping = (gold: number) => standing(OSADA, { gold });

  const forSale = () => {
    const shop = offerOn(shopping(9), OSADA, "kup");
    if (!shop) throw new Error("Osada should have a shop — read fieldScript.ts");
    return shop.effect.towar;
  };

  it("refuses where there is no shelf", () => {
    const nowhere = standing(STEP, { gold: 9 });
    expect(() => buyGoods(nowhere, { seatId: "seat-a", cardId: "helm" })).toThrow(
      /nie ma czego kupić/,
    );
  });

  it("refuses a card this shelf does not carry", () => {
    expect(() => buyGoods(shopping(9), { seatId: "seat-a", cardId: "excalibur" })).toThrow(
      /nie jest tu na sprzedaż/,
    );
  });

  it("refuses a purse that cannot cover it", () => {
    const [first] = forSale();
    expect(() =>
      buyGoods(shopping(0), { seatId: "seat-a", cardId: goodsId(first.co)! }),
    ).toThrow(/Za mało złota/);
  });

  /**
   * Taking it and paying for it are one change.
   *
   * The store read the purse, took the card across four to six round trips, and
   * then wrote an absolute `gold` computed from the reading it took first — so
   * a coin spent in that window was refunded by the purchase that followed it.
   */
  it("takes the card and pays for it in one changeset", () => {
    const [first] = forSale();
    const cardId = goodsId(first.co)!;
    const { writes } = buyGoods(shopping(9), { seatId: "seat-a", cardId });

    expect(writes.holdings?.insert?.[0]).toMatchObject({ seat_id: "seat-a", card_id: cardId });
    expect(writes.seats).toContainEqual({ id: "seat-a", patch: { gold: 9 - first.cena } });
    expect(writes.journal?.map((line) => line.kind)).toContain("bought");
  });

  /**
   * One act, one line, and it says where.
   *
   * `takeCard` writes its own „zdobywa (16.6)" for anything picked up off an
   * Obszar, and a purchase used to get that as well as its own „kupuje (21.1)"
   * — the same event twice, under two rules, the first of which is about
   * picking a Karta up off the ground rather than buying one off a shelf.
   */
  it("writes one journal line, naming the Obszar and the vendor", () => {
    const [first] = forSale();
    const cardId = goodsId(first.co)!;
    const { writes } = buyGoods(shopping(9), { seatId: "seat-a", cardId });

    expect(writes.journal?.map((line) => line.kind)).toEqual(["bought"]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "bought",
      payload: { cardId, price: first.cena, fieldId: OSADA, from: "Płatnerz" },
    });
  });
});

describe("a Karta with a buyer of its own (DIAMENT KRÓLÓW)", () => {
  const ZAMEK = asFieldId("zamek")!;
  const holding = () => [aHolding({ id: "h1", seat_id: "seat-a", card_id: "diament-krolow", kind: "item" })];

  /**
   * "Może zostać sprzedany w Zamku za 5 Sztuk Złota." It was a note for the
   * player to apply by hand, and the Zamek has no desk — so the app's answer on
   * the one square the card names was "Nikt tu nie skupuje Przedmiotów", a
   * refusal quoting a rule the card overrides.
   */
  it("sells for its own price on the Obszar its own text names", () => {
    const at = standing(ZAMEK, { gold: 0 }, holding());
    const { writes } = sellHolding(at, { seatId: "seat-a", holdingId: "h1" });
    expect(writes.seats?.[0].patch.gold).toBe(5);
    expect(writes.holdings?.delete).toEqual(["h1"]);
  });

  /**
   * And only there. At the Gród it is not the Zamek's business and falls
   * through to the Lichwiarz, who pays his flat one for it — a bad trade the
   * rules plainly allow and not this command's place to prevent.
   */
  it("falls through to the desk wherever the card does not name a buyer", () => {
    const at = standing(GROD, { gold: 0 }, holding());
    expect(sellHolding(at, { seatId: "seat-a", holdingId: "h1" }).writes.seats?.[0].patch.gold)
      .toBe(1);
  });

  /** The Zamek buys the Diament and nothing else: it has no desk of its own. */
  it("does not turn the Obszar into a desk for everything else", () => {
    const at = standing(ZAMEK, { gold: 0 }, [
      aHolding({ id: "h2", seat_id: "seat-a", card_id: "helm", kind: "item" }),
    ]);
    expect(() => sellHolding(at, { seatId: "seat-a", holdingId: "h2" })).toThrow(
      /Nikt tu nie skupuje/,
    );
  });
});

/* ==========================================================================
 * 12.1's window, which trade is inside exactly as taking is.
 * ======================================================================= */

describe("when a character may trade at all (12.1, 13.1)", () => {
  /**
   * One door each, on an Obszar that actually has that desk — no square in the
   * box has all three. The Osada prints a Płatnerz and a Medyk; the Gród prints
   * the Lichwiarz.
   */
  const DOORS: [string, typeof GROD, (table: Snapshot, seatId: string) => unknown][] = [
    ["buy", OSADA, (t, seatId) => buyGoods(t, { seatId, cardId: "helm" })],
    ["sell", GROD, (t, seatId) => sellHolding(t, { seatId, holdingId: "h1" })],
    ["heal", OSADA, (t, seatId) => payHealer(t, { seatId, points: 1 })],
  ];

  const shop = (fieldId: typeof GROD, state: TurnPhase, active = 0) =>
    aTable({
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, field_id: fieldId, gold: 9 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: fieldId, gold: 9 }),
      ],
      holdings: [aHolding({ id: "h1", seat_id: "seat-a", card_id: "helm", kind: "item" })],
      game: { active_seat: active, turn_state: only(state) },
    });

  const arrived = (fieldId: typeof GROD): TurnPhase =>
    ({ phase: "field", fieldId, from: null, draw: 0, drawn: [] }) as TurnPhase;

  /**
   * 13.1: "w żadnym przypadku nie mogą nikogo spotkać ani wogóle podejmować
   * żadnych czynności na Obszarze, z którego rozpoczynają ruch."
   *
   * The plainest of the four and the easiest to see: standing on a Targowisko
   * at the start of your turn, before rolling, you could empty it.
   */
  it("refuses before the move, on the square the turn starts from", () => {
    for (const [what, field, run] of DOORS) {
      const before = shop(field, { phase: "roll" } as TurnPhase);
      expect(() => run(before, "seat-a"), what).toThrow(/13\.1/);
    }
  });

  /**
   * 10.1, which the taking commands checked and the trading ones did not — and
   * it is reachable from a browser rather than only in theory, the route
   * reading `body.seatId`.
   */
  it("refuses a seat whose turn it is not, standing on the same square", () => {
    for (const [what, field, run] of DOORS) {
      const table = shop(field, arrived(field));
      expect(() => run(table, "seat-b"), what).toThrow(/10\.1/);
    }
  });

  /**
   * 12.1a and b, which except the whole of 12.1 and not only its taking half:
   * "odwiedzić znajdującego się tam Nieznajomego, zabrać leżące złoto,
   * Przedmioty lub Przyjaciół z wyjątkiem sytuacji, w której…". A Wilk does not
   * wait politely while you haggle.
   */
  it("refuses over an unfought Wróg, and while the Obszar still owes Karty", () => {
    const wilk = { cardId: "wilk", cardClass: "foe" as const, granted: false };
    for (const [what, field, run] of DOORS) {
      const guarded = shop(field, { ...arrived(field), drawn: [wilk] } as TurnPhase);
      const owing = shop(field, { ...arrived(field), draw: 1 } as TurnPhase);
      expect(() => run(guarded, "seat-a"), what).toThrow(/WILK/);
      expect(() => run(owing, "seat-a"), what).toThrow(/12\.1b/);
    }
  });

  /**
   * The uzupełnienie under 12.1, at the trading doors: a WŁADCA ZDARZEŃ can put
   * a LABIRYNT on the Osada, and while it lies there unresolved the Płatnerz is
   * not open over its head. This is the whole of docs/OBSZAR.md's model —
   * one pass through the Obszar first, then the free window.
   */
  it("refuses while a compulsory Karta on the square is unresolved", () => {
    const labirynt = { cardId: "labirynt", cardClass: "place" as const, granted: false };
    for (const [what, field, run] of DOORS) {
      const queued = shop(field, { ...arrived(field), drawn: [labirynt] } as TurnPhase);
      expect(() => run(queued, "seat-a"), what).toThrow(/LABIRYNT/);
      // And open again the moment it has been dealt with.
      const done = shop(field, {
        ...arrived(field),
        drawn: [labirynt],
        resolved: ["labirynt"],
      } as TurnPhase);
      try {
        run(done, "seat-a");
      } catch (refused) {
        expect((refused as Error).message, what).not.toMatch(/LABIRYNT/);
      }
    }
  });

  /**
   * The other half, and the reason this is not the compulsory/optional line
   * drawn by hand: a TARGOWISKO offers and never commands, so it earns no place
   * in the kolejka and shuts nothing. Reading it and walking on is resolving it.
   */
  it("is not closed by a Karta that only offers", () => {
    const targowisko = { cardId: "targowisko", cardClass: "place" as const, granted: false };
    for (const [what, field, run] of DOORS) {
      const table = shop(field, { ...arrived(field), drawn: [targowisko] } as TurnPhase);
      try {
        run(table, "seat-a");
      } catch (refused) {
        expect((refused as Error).message, what).not.toMatch(/12\.1|TARGOWISKO/);
      }
    }
  });

  /**
   * And through, in the window itself.
   *
   * Asserted as "not refused by the gate" rather than "does not throw": each of
   * these has arithmetic of its own — a purse, a shelf, a wound — and this
   * suite is about the window, not about what is for sale.
   */
  it("lets all three past the gate once the move has ended here", () => {
    for (const [what, field, run] of DOORS) {
      const table = shop(field, arrived(field));
      try {
        run(table, "seat-a");
      } catch (refused) {
        expect((refused as Error).message, what).not.toMatch(/10\.1|12\.1|13\.1/);
      }
    }
  });
});
