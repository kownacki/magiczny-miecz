import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { combatValueOf } from "@/lib/engine/cards";
import { EVENTS } from "../decks";
import { aHolding, aSeat, aTable } from "../fixture";
import { TROPHY_RATE, offerOn, payHealer, sellHolding, tradeTrophies } from "./shop";

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
      seats: [aSeat({ id: "seat-a", miecz_own: 2 })],
      holdings: [aHolding({ id: "t0", card_id: wrog.id, kind: "trophy" })],
    });
    const { writes, result } = tradeTrophies(table, { seatId: "seat-a" });
    expect(result).toBe(Math.floor(worth / TROPHY_RATE));
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { miecz_own: 2 + result } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "wymiana-trofeow",
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
});

describe("selling to the Lichwiarz (21.2)", () => {
  it("pays the printed price and takes the card away", () => {
    const table = standing(GROD, { zloto: 1 }, [aHolding({ id: "h1", card_id: "helm" })]);
    const { writes } = sellHolding(table, { seatId: "seat-a", holdingId: "h1" });
    expect(writes.holdings?.delete).toEqual(["h1"]);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { zloto: 2 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "sprzedaz",
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
    const table = standing(OSADA, { zycie: 2, zloto: 3 });
    const { writes, result } = payHealer(table, { seatId: "seat-a", points: 1 });
    expect(result).toEqual({ healed: 1, paid: 1 });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { zycie: 3, zloto: 2 } }]);
  });

  it("buys no more than 4.7 allows, however much is asked for", () => {
    const table = standing(OSADA, { zycie: 3, zloto: 9 });
    expect(payHealer(table, { seatId: "seat-a", points: 5 }).result).toEqual({
      healed: 1,
      paid: 1,
    });
  });

  it("buys no more than the purse holds", () => {
    const table = standing(OSADA, { zycie: 1, zloto: 2 });
    expect(payHealer(table, { seatId: "seat-a", points: 3 }).result).toEqual({
      healed: 2,
      paid: 2,
    });
  });

  it("refuses a character already at the starting level", () => {
    const table = standing(OSADA, { zycie: 4, zloto: 9 });
    expect(() => payHealer(table, { seatId: "seat-a", points: 1 })).toThrow(/4\.7 nie pozwala/);
  });

  it("refuses an empty purse", () => {
    const table = standing(OSADA, { zycie: 1, zloto: 0 });
    expect(() => payHealer(table, { seatId: "seat-a", points: 1 })).toThrow(/Za mało złota/);
  });

  it("asks for a real number of points", () => {
    const table = standing(OSADA, { zycie: 1, zloto: 5 });
    for (const points of [0, -1, 1.5]) {
      expect(() => payHealer(table, { seatId: "seat-a", points })).toThrow(/Ile punktów/);
    }
  });

  it("refuses where nobody heals", () => {
    expect(() => payHealer(standing(STEP, { zycie: 1 }), { seatId: "seat-a", points: 1 })).toThrow(
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
