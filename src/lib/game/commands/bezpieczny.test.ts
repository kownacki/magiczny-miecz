import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { applyEffect } from "./effects";
import type { Effect } from "@/lib/engine/cardScript";
import type { FieldId } from "@/lib/engine/board";
import type { Nature } from "@/data/types";

/**
 * The nine cards that carry a character past what an Obszar does to them.
 *
 * They are specific about both halves — which Obszar, and which of its costs.
 * The Rękawice keep the point of Życie on the Ruchome Skały and would not save
 * a Przedmiot anywhere; the Kij i Sznur keep the Przedmiot on the Bagna and
 * would not save a point of Życie. Reading either as general protection is the
 * mistake this suite exists to catch.
 */

const standing = (field: FieldId, cards: string[], nature: Nature = "good") =>
  aTable({
    seats: [aSeat({ id: "seat-a", field_id: field, life: 4, nature })],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

const LOSE_LIFE = { op: "punkty", stat: "life", delta: -1 } as unknown as Effect;
const LOSE_ITEM = {
  op: "strata",
  co: "przedmiot",
  count: 1,
  wybor: "losowo",
} as unknown as Effect;

/** Piles are not shuffled here; the order in is the order out. */
const asIs = <T,>(items: readonly T[]): T[] => [...items];

/** Dice for the losses that pick at random; harmless where nothing rolls. */
const run = (table: ReturnType<typeof standing>, effect: Effect) =>
  applyEffect(
    table,
    { seatId: "seat-a", effect, reason: "Obszar", shuffle: asIs },
    ports({ random: scriptedRandom([1, 1, 1, 1]) }),
  );

describe("keeping the point of Życie an Obszar would take", () => {
  it("takes it when nothing protects", async () => {
    const table = standing("ruchome-skaly-1", []);
    expect(apply(table, (await run(table, LOSE_LIFE)).writes).seats[0].life).toBe(3);
  });

  /** "Dzięki Rękawicom ... nie stracisz 1 punktu Życia na Ruchomych Skałach." */
  it("keeps it with the Rękawice, on the Obszar they name", async () => {
    const table = standing("ruchome-skaly-1", ["rekawice"]);
    const out = await run(table, LOSE_LIFE);
    expect(apply(table, out.writes).seats[0].life).toBe(4);
    expect(out.result.did.join(" ")).toMatch(/chroni na tym Obszarze/);
  });

  it("does not carry them to any other Obszar", async () => {
    const table = standing("bagna-1", ["rekawice"]);
    expect(apply(table, (await run(table, LOSE_LIFE)).writes).seats[0].life).toBe(3);
  });

  /**
   * The Relikwiarz spares a Dobra Postać at the Czarci Młyn and a Zła one at
   * the Studnia Wieczności, and nobody at the other — which is why `isSpared`
   * asks for a Natura at all.
   */
  it("asks the Natura where the card does", async () => {
    const dobra = standing("czarci-mlyn", ["relikwiarz"], "good");
    expect(apply(dobra, (await run(dobra, LOSE_LIFE)).writes).seats[0].life).toBe(4);

    const zla = standing("czarci-mlyn", ["relikwiarz"], "evil");
    expect(apply(zla, (await run(zla, LOSE_LIFE)).writes).seats[0].life).toBe(3);

    // And the other way round at the other Obszar.
    const tam = standing("studnia-wiecznosci", ["relikwiarz"], "evil");
    expect(apply(tam, (await run(tam, LOSE_LIFE)).writes).seats[0].life).toBe(4);
  });

  /** These cards say what an Obszar will not do *to* you. None declines a gift. */
  it("does not decline a point the Obszar gives", async () => {
    const table = standing("ruchome-skaly-1", ["rekawice"]);
    const gain = { op: "punkty", stat: "life", delta: 1 } as unknown as Effect;
    expect(apply(table, (await run(table, gain)).writes).seats[0].life).toBe(5);
  });
});

describe("keeping the Przedmiot an Obszar would take", () => {
  it("takes it when nothing protects", async () => {
    const table = standing("bagna-1", ["helm"]);
    expect(apply(table, (await run(table, LOSE_ITEM)).writes).holdings).toHaveLength(0);
  });

  /** "Mając kij i mocny sznur ... Nie tracisz tam Przedmiotu ani Przyjaciela." */
  it("keeps it with the Kij i Sznur, on the Bagna", async () => {
    const table = standing("bagna-1", ["helm", "kij-i-sznur"]);
    const out = await run(table, LOSE_ITEM);
    expect(apply(table, out.writes).holdings).toHaveLength(2);
    expect(out.result.did.join(" ")).toMatch(/nic nie traci/);
  });

  /**
   * The two halves do not stand in for each other: a card that saves a
   * Przedmiot is no help against a point of Życie, and the reverse.
   */
  it("is no help against the other kind of cost", async () => {
    const kij = standing("bagna-1", ["kij-i-sznur"]);
    expect(apply(kij, (await run(kij, LOSE_LIFE)).writes).seats[0].life).toBe(3);

    const rek = standing("ruchome-skaly-1", ["helm", "rekawice"]);
    expect(apply(rek, (await run(rek, LOSE_ITEM)).writes).holdings.length).toBeLessThan(2);
  });
});
