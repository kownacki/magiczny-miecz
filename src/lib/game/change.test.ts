import { describe, expect, it } from "vitest";
import { apply, merge, mergeAll, type Changeset } from "./change";
import { aHolding, aSeat, aTable } from "./fixture";

describe("merge", () => {
  it("keeps both sides' lists, in order", () => {
    const merged = merge(
      { journal: [{ seatId: "a", turn: 1, kind: "pierwsze" }] },
      { journal: [{ seatId: "a", turn: 1, kind: "drugie" }] },
    );
    expect(merged.journal?.map((line) => line.kind)).toEqual(["pierwsze", "drugie"]);
  });

  it("lets the later write win, column by column", () => {
    const merged = merge({ game: { turn: 4, status: "playing" } }, { game: { turn: 5 } });
    expect(merged.game).toEqual({ turn: 5, status: "playing" });
  });

  /**
   * The trap this shape sets, written down so it stays caught.
   *
   * Two writes to the same column are the *last* one, not the sum of them — so
   * anything that reads a column, changes it and writes it back has to see the
   * previous change first. A death returns Zaklęcia and trofea to two different
   * piles, and both of those are `deck`: merging them side by side silently
   * dropped the spells. Chaining through `apply` is what makes it right.
   */
  it("does not add up two writes to the same column", () => {
    const merged = merge({ game: { deck: { events: "a" } } }, { game: { deck: { spells: "b" } } });
    expect(merged.game?.deck).toEqual({ spells: "b" });
  });

  it("is empty for empty", () => {
    expect(mergeAll({}, {}, {})).toEqual({});
  });
});

describe("apply", () => {
  it("patches a seat without touching the others", () => {
    const table = aTable({
      seats: [aSeat({ id: "a", seat_index: 0 }), aSeat({ id: "b", seat_index: 1 })],
    });
    const after = apply(table, { seats: [{ id: "b", patch: { zycie: 1 } }] });
    expect(after.seats.map((s) => s.zycie)).toEqual([4, 1]);
  });

  it("removes deleted holdings and keeps the rest", () => {
    const table = aTable({
      holdings: [aHolding({ id: "h1" }), aHolding({ id: "h2" }), aHolding({ id: "h3" })],
    });
    const after = apply(table, { holdings: { delete: ["h1", "h3"] } });
    expect(after.holdings.map((h) => h.id)).toEqual(["h2"]);
  });

  it("gives an inserted row a placeholder id rather than a plausible one", () => {
    const after = apply(aTable(), {
      fieldCards: { insert: [{ field_id: "kurhan", card_id: "smok" }] },
    });
    expect(after.fieldCards).toHaveLength(1);
    expect(after.fieldCards[0].id).toMatch(/^pending:/);
  });

  it("moves the journal's high-water mark by what was written", () => {
    const table = aTable({ journalSeq: 12 });
    const after = apply(table, {
      journal: [
        { seatId: null, turn: 1, kind: "a" },
        { seatId: null, turn: 1, kind: "b" },
      ],
    });
    expect(after.journalSeq).toBe(14);
  });

  /** The property the cascades rely on: a command can read its own work. */
  it("lets a second step see what the first decided", () => {
    const table = aTable({ seats: [aSeat({ id: "a", eliminated: false })] });
    const first: Changeset = { seats: [{ id: "a", patch: { eliminated: true } }] };
    expect(apply(table, first).seats[0].eliminated).toBe(true);
    // and the snapshot it came from is untouched
    expect(table.seats[0].eliminated).toBe(false);
  });
});
