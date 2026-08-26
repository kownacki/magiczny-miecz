import { describe, expect, it } from "vitest";
import { apply, merge, mergeAll, type Changeset } from "./change";
import { aHolding, aSeat, aTable } from "./fixture";

describe("merge", () => {
  it("keeps both sides' lists, in order", () => {
    const merged = merge(
      { journal: [{ seatId: "a", turn: 1, kind: "rzut" }] },
      { journal: [{ seatId: "a", turn: 1, kind: "ruch" }] },
    );
    expect(merged.journal?.map((line) => line.kind)).toEqual(["rzut", "ruch"]);
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
        { seatId: null, turn: 1, kind: "rzut" },
        { seatId: null, turn: 1, kind: "ruch" },
      ],
    });
    expect(after.journalSeq).toBe(14);
  });

  /**
   * Two patches for one row are both applied, as `commit` applies them.
   *
   * A `Map` keyed by id kept only the last, so `apply` and the database
   * disagreed about what a changeset meant — and a cascade reading its own work
   * saw the first patch quietly undone. A loss on a bridge writes exactly this
   * shape: the point of Życie, and then the bar on trying again next turn.
   */
  it("folds two patches for the same seat instead of keeping the last", () => {
    const table = aTable({ seats: [aSeat({ id: "a", zycie: 4, bridge_blocked_until_turn: null })] });
    const after = apply(table, {
      seats: [
        { id: "a", patch: { zycie: 3 } },
        { id: "a", patch: { bridge_blocked_until_turn: 9 } },
      ],
    });
    expect(after.seats[0].zycie).toBe(3);
    expect(after.seats[0].bridge_blocked_until_turn).toBe(9);
  });

  it("lets a later patch win on the same column", () => {
    const table = aTable({ seats: [aSeat({ id: "a", zloto: 1 })] });
    const after = apply(table, {
      seats: [
        { id: "a", patch: { zloto: 2 } },
        { id: "a", patch: { zloto: 5 } },
      ],
    });
    expect(after.seats[0].zloto).toBe(5);
  });

  it("does the same for holdings and effects", () => {
    const table = aTable({ holdings: [aHolding({ id: "h1", slot: null, ordinal: null })] });
    const after = apply(table, {
      holdings: {
        patch: [
          { id: "h1", patch: { slot: "glowa" } },
          { id: "h1", patch: { ordinal: 3 } },
        ],
      },
    });
    expect(after.holdings[0]).toMatchObject({ slot: "glowa", ordinal: 3 });
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
