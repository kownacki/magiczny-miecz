import { describe, expect, it } from "vitest";
import { aHolding, aSeat, aTable } from "../fixture";
import { healSeat, killSeat, spendLife } from "./life";

describe("uzdrowienie (4.7)", () => {
  it("restores a point", () => {
    const table = aTable({ seats: [aSeat({ life: 2 })] });
    const { writes, result } = healSeat(table, { seatId: "seat-a" });
    expect(result).toBe(3);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 3 } }]);
    expect(writes.journal?.[0]).toMatchObject({ kind: "healed", payload: { from: 2, to: 3 } });
  });

  it("refuses rather than charging for nothing at the ceiling", () => {
    const table = aTable({ seats: [aSeat({ life: 4 })] });
    expect(() => healSeat(table, { seatId: "seat-a" })).toThrow(/tylko do 4/);
  });

  /** 4.6 lets Życie sit above four; healing must never take it back down. */
  it("does not drain a character who is over the ceiling", () => {
    const table = aTable({ seats: [aSeat({ life: 6 })] });
    expect(() => healSeat(table, { seatId: "seat-a" })).toThrow();
  });
});

describe("spending Życie", () => {
  it("takes the points and leaves the seat alive", () => {
    const table = aTable({ seats: [aSeat({ life: 4 })] });
    const { writes, result } = spendLife(table, "seat-a", 2);
    expect(result).toBe(2);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 2 } }]);
    expect(writes.journal ?? []).toHaveLength(0);
  });

  it("never goes below zero", () => {
    const table = aTable({ seats: [aSeat({ life: 1 })] });
    expect(spendLife(table, "seat-a", 3).result).toBe(0);
  });

  /**
   * An effect is a row against the seat, and 4.4 puts a different Postać in
   * that chair — so a Zaklęcie cast on the one who died was still there,
   * taking its point off somebody it was never spoken over.
   */
  it("takes away everything that was true of the character (4.4)", () => {
    const table = aTable({
      seats: [aSeat({ life: 1 })],
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-a",
          field_card_id: null,
          source: "klatwa",
          label: "-1 Miecza",
          modifier: { kind: "points", miecz: -1 },
          ends: { kind: "turns", turns: 3 },
        },
      ],
    });
    const { writes } = spendLife(table, "seat-a", 1);
    expect(writes.effects?.delete).toEqual(["eff-1"]);
  });

  /**
   * OCALONY: „ocalenie przed stratą punktu Życia jeżeli taka strata ma
   * nastąpić" — spoken in advance and spent by being needed, at the one door
   * every loss in the game comes through.
   */
  it("takes the loss instead of the character, once", () => {
    const saved = aTable({
      seats: [aSeat({ id: "seat-a", life: 3 })],
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-a",
          field_card_id: null,
          source: "OCALONY",
          label: "Ocalony",
          modifier: { kind: "ocalenie" },
          ends: { kind: "dispelled" },
        },
      ],
    });
    const { writes, result } = spendLife(saved, "seat-a", 1);
    expect(result).toBe(3);
    expect(writes.seats).toBeUndefined();
    // Spent: the next loss is the character's own.
    expect(writes.effects?.delete).toEqual(["eff-1"]);
    expect(writes.journal?.[0]).toMatchObject({ kind: "healed", payload: { saved: "Ocalony" } });
  });

  it("saves from the whole loss, not one point of it", () => {
    const saved = aTable({
      seats: [aSeat({ id: "seat-a", life: 1 })],
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-a",
          field_card_id: null,
          source: "OCALONY",
          label: "Ocalony",
          modifier: { kind: "ocalenie" },
          ends: { kind: "dispelled" },
        },
      ],
    });
    // The Bestia takes two, and „ocalenie przed stratą" is the loss not
    // happening rather than it happening by less — so nobody dies here.
    const { writes, result } = spendLife(saved, "seat-a", 2);
    expect(result).toBe(1);
    expect(writes.seats).toBeUndefined();
  });

  it("kills the seat when they run out", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
    });
    const { writes } = spendLife(table, "seat-a", 4);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["death", "turn-end"]);
  });
});

describe("śmierć (4.4)", () => {
  const table = () =>
    aTable({
      game: { active_seat: 0 },
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
      holdings: [
        aHolding({ id: "h-item", card_id: "helm", kind: "item" }),
        aHolding({ id: "h-friend", card_id: "wilk", kind: "friend" }),
        aHolding({ id: "h-spell", card_id: "krag-plomieni", kind: "spell" }),
        aHolding({ id: "h-trophy", card_id: "goblin", kind: "trophy" }),
      ],
    });

  it("leaves the gear and the friends lying on the Obszar", () => {
    const writes = killSeat(table(), "seat-a");
    expect(writes.fieldCards?.insert?.map((card) => card.card_id)).toEqual(["helm", "wilk"]);
    expect(writes.fieldCards?.insert?.every((c) => c.field_id === "mroczna-polana")).toBe(true);
  });

  it("empties the hand completely, spells and trophies included", () => {
    const writes = killSeat(table(), "seat-a");
    expect(writes.holdings?.delete).toEqual(["h-item", "h-friend", "h-spell", "h-trophy"]);
  });

  it("marks the seat out and says so", () => {
    const writes = killSeat(table(), "seat-a");
    expect(writes.seats).toContainEqual({
      id: "seat-a",
      // 1.4: the score goes with the Karty, and so does the shelf that
      // remembers who paid for it. See docs/TROFEA.md.
      patch: { eliminated: true, trophy_points: 0, trophy_beaten: [] },
    });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "death",
      payload: { droppedOnField: ["helm", "wilk"], spellsDiscarded: 1, field: "mroczna-polana" },
    });
  });

  /**
   * The reason a death and the pass that follows it are one change.
   *
   * The pass is decided against a table that already knows the character is
   * out. Run as two changes it could hand the turn back to the seat that just
   * died, which is the shape of bug the ordering comment in `resolveBridgeOrdeal`
   * was written to dodge by hand.
   */
  it("hands play on, and never back to the character who just died", () => {
    const dying = aTable({
      game: { active_seat: 1 },
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
    });
    const writes = killSeat(dying, "seat-b");
    expect(writes.game?.active_seat).toBe(0);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["death", "turn-end"]);
  });

  it("does not touch the turn when it was somebody else's", () => {
    const writes = killSeat(table(), "seat-b");
    expect(writes.game?.active_seat).toBeUndefined();
    expect(writes.journal?.map((line) => line.kind)).toEqual(["death"]);
  });
});
