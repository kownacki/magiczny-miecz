import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { combatValueOf } from "@/lib/engine/cards";
import { EVENTS } from "../decks";
import { aHolding, aSeat, aTable } from "../fixture";
import { TROPHY_RATE, buyGoods, offerOn, payHealer, sellHolding, tradeTrophies } from "./shop";
import { goodsId } from "@/lib/engine/goods";

/** The board's own establishments, read off `fieldScript.ts` rather than guessed. */
const GROD = asFieldId("grod")!; // Lichwiarz, 1 Sz. Z.
const OSADA = asFieldId("osada")!; // Znachor, 1 Sz. Z.
const STEP = asFieldId("step-1")!; // nothing at all

const standing = (
  fieldId: typeof GROD,
  seat: Parameters<typeof aSeat>[0] = {},
  holdings: ReturnType<typeof aHolding>[] = [],
) =>
  aTable({
    seats: [aSeat({ id: "seat-a", field_id: fieldId, ...seat })],
    holdings,
  });

describe("what an Obszar is offering", () => {
  it("finds the desk printed on the board", () => {
    expect(offerOn(standing(GROD), GROD, "sprzedaj")).toMatchObject({ cena: 1 });
    expect(offerOn(standing(OSADA), OSADA, "uzdrow")).toMatchObject({ cena: 1 });
  });

  it("finds nothing where there is nothing", () => {
    expect(offerOn(standing(STEP), STEP, "sprzedaj")).toBeNull();
    expect(offerOn(standing(STEP), STEP, "uzdrow")).toBeNull();
  });

  /** 16.8 leaves a shop that walked in as a Karta lying there; 21.1 counts it. */
  it("finds one that arrived as a card and stayed", () => {
    const withCard = aTable({
      seats: [aSeat({ id: "seat-a", field_id: STEP })],
      fieldCards: [{ id: "fc1", field_id: "step-1", card_id: "alchemik", granted: false }],
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
  describe("in punkty mode", () => {
    const scoring = (points: number, sword = 2) =>
      aTable({
        game: { trophy_mode: "punkty" },
        seats: [aSeat({ id: "seat-a", sword_own: sword, trophy_points: points })],
      });

    it("pays one Miecz per seven and keeps the remainder", () => {
      const { writes, result } = tradeTrophies(scoring(TROPHY_RATE * 2 + 3), {
        seatId: "seat-a",
      });
      expect(result).toBe(2);
      expect(writes.seats).toEqual([
        { id: "seat-a", patch: { sword_own: 4, trophy_points: 3 } },
      ]);
      // Nothing was held, so nothing goes back to a pile.
      expect(writes.holdings).toBeUndefined();
    });

    it("refuses below the rate rather than banking a fraction", () => {
      expect(() => tradeTrophies(scoring(TROPHY_RATE - 1), { seatId: "seat-a" })).toThrow(
        new RegExp(`${TROPHY_RATE} punktów`),
      );
    });

    /** The Karty are on the pile, so naming one is naming something nobody has. */
    it("ignores a named card, there being none to name", () => {
      const { result } = tradeTrophies(scoring(TROPHY_RATE), {
        seatId: "seat-a",
        cardIds: ["smok"],
      });
      expect(result).toBe(1);
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
  const shopping = (gold: number) =>
    aTable({ seats: [aSeat({ id: "seat-a", field_id: OSADA, gold })] });

  const forSale = () => {
    const shop = offerOn(shopping(9), OSADA, "kup");
    if (!shop) throw new Error("Osada should have a shop — read fieldScript.ts");
    return shop.towar;
  };

  it("refuses where there is no shelf", () => {
    const nowhere = aTable({ seats: [aSeat({ id: "seat-a", field_id: STEP, gold: 9 })] });
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
});
