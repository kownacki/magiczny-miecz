import { describe, expect, it } from "vitest";
import { apply, isEmpty, merge, mergeAll, type Changeset } from "./change";
import { aHolding, aSeat, aTable } from "./fixture";

describe("merge", () => {
  it("keeps both sides' lists, in order", () => {
    const merged = merge(
      { journal: [{ seatId: "a", turn: 1, kind: "roll" }] },
      { journal: [{ seatId: "a", turn: 1, kind: "move" }] },
    );
    expect(merged.journal?.map((line) => line.kind)).toEqual(["roll", "move"]);
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

  /**
   * The poczekalnia sweep clears everybody it finds gone in one change, and it
   * gets there by folding one removal per departure together. Keeping only one
   * side's list would leave every player but one still sitting at a table they
   * had already left.
   */
  it("keeps both sides' seat removals", () => {
    const merged = merge({ seatsRemoved: ["seat-a"] }, { seatsRemoved: ["seat-b", "seat-c"] });
    expect(merged.seatsRemoved).toEqual(["seat-a", "seat-b", "seat-c"]);
  });

  it("does not invent a list of departures when nobody left", () => {
    // A changeset carrying `seatsRemoved: []` says a change touched the seats,
    // and a reader that believes it — a test, a log line, a future writer of
    // `commit` — is being told something that did not happen.
    expect(merge({ game: { turn: 4 } }, { journal: [] })).not.toHaveProperty("seatsRemoved");
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
    const after = apply(table, { seats: [{ id: "b", patch: { life: 1 } }] });
    expect(after.seats.map((s) => s.life)).toEqual([4, 1]);
  });

  /**
   * The only seat that ever leaves is one that never really arrived: 4.4 retires
   * a dead character rather than erasing it, so a row disappearing is the
   * poczekalnia's business alone — the wrong table joined, or a tab closed
   * before the game began.
   */
  it("takes a removed seat out of the table", () => {
    const table = aTable({
      seats: [aSeat({ id: "a", seat_index: 0 }), aSeat({ id: "b", seat_index: 1 })],
    });
    const after = apply(table, { seatsRemoved: ["b"] });
    expect(after.seats.map((seat) => seat.id)).toEqual(["a"]);
  });

  /**
   * The lobby writes both in one change whenever the player leaving is the one
   * holding the host role: that seat goes, and the role is handed to somebody
   * still sitting there. The seat that went stays gone — `commit` deletes
   * before it patches, and a step reading its own work must not be shown a row
   * the database is about to be told to drop.
   */
  it("lets the removal win over a patch to the same seat", () => {
    const table = aTable({
      seats: [aSeat({ id: "a", seat_index: 0, is_host: true }), aSeat({ id: "b", seat_index: 1, is_host: false })],
    });
    const after = apply(table, {
      seats: [
        { id: "a", patch: { player_name: "nikt" } },
        { id: "b", patch: { is_host: true } },
      ],
      seatsRemoved: ["a"],
    });
    expect(after.seats.map((seat) => seat.id)).toEqual(["b"]);
    // and the other seat in that same changeset is patched as asked
    expect(after.seats[0].is_host).toBe(true);
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
        { seatId: null, turn: 1, kind: "roll" },
        { seatId: null, turn: 1, kind: "move" },
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
    const table = aTable({ seats: [aSeat({ id: "a", life: 4, bridge_blocked_until_turn: null })] });
    const after = apply(table, {
      seats: [
        { id: "a", patch: { life: 3 } },
        { id: "a", patch: { bridge_blocked_until_turn: 9 } },
      ],
    });
    expect(after.seats[0].life).toBe(3);
    expect(after.seats[0].bridge_blocked_until_turn).toBe(9);
  });

  it("lets a later patch win on the same column", () => {
    const table = aTable({ seats: [aSeat({ id: "a", gold: 1 })] });
    const after = apply(table, {
      seats: [
        { id: "a", patch: { gold: 2 } },
        { id: "a", patch: { gold: 5 } },
      ],
    });
    expect(after.seats[0].gold).toBe(5);
  });

  it("does the same for holdings and effects", () => {
    const table = aTable({ holdings: [aHolding({ id: "h1", slot: null, ordinal: null })] });
    const after = apply(table, {
      holdings: {
        patch: [
          { id: "h1", patch: { slot: "head" } },
          { id: "h1", patch: { ordinal: 3 } },
        ],
      },
    });
    expect(after.holdings[0]).toMatchObject({ slot: "head", ordinal: 3 });
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

/* ---------------------------------------------------------------------------
 * A change that decided to do nothing.
 * ------------------------------------------------------------------------ */

/**
 * Deciding to do nothing is ordinary, and has to be told apart from failing.
 *
 * The poczekalnia sweep runs on every poll from every device and finds nobody
 * gone almost every time; a command may return `{}` rather than each of its
 * callers asking "is there anything to do here" first. What reads this is
 * `commit`, and what it does with the answer is write nothing at all — no
 * revision, no `last_played_at`, no traffic — so getting it wrong in either
 * direction is expensive: `false` for nothing wakes every browser at the table
 * on a poll, and `true` for something drops a real change in silence.
 */
describe("whether a changeset asks for anything", () => {
  it("asks for nothing when it says nothing", () => {
    expect(isEmpty({})).toBe(true);
  });

  /**
   * A command that builds its lists up front and fills them only if it finds
   * something hands back every key with nothing in it, which says exactly what
   * `{}` says. `seatsRemoved: []` is the sweep's own shape: it always has a
   * list of the departed, and almost always an empty one.
   */
  it("asks for nothing when every list it carries is empty", () => {
    expect(
      isEmpty({
        seats: [],
        seatsRemoved: [],
        holdings: { insert: [], patch: [], delete: [] },
        fieldCards: { insert: [], delete: [] },
        effects: { insert: [], patch: [], delete: [] },
        journal: [],
      }),
    ).toBe(true);
  });

  /**
   * One of every kind of write a changeset can hold.
   *
   * This is the list that has to grow when `Changeset` does, and the only way
   * this function rots is by not growing with it: a new key `isEmpty` has never
   * heard of makes a changeset asking only for the new thing look like a
   * changeset asking for nothing, and `commit` then drops it without a word.
   */
  const oneWrite: [string, Changeset][] = [
    ["a column on the games row", { game: { turn: 4 } }],
    ["a seat patched", { seats: [{ id: "seat-a", patch: { gold: 2 } }] }],
    ["a seat removed", { seatsRemoved: ["seat-a"] }],
    [
      "a card taken up",
      { holdings: { insert: [{ seat_id: "seat-a", card_id: "helm", kind: "item" }] } },
    ],
    ["a card moved", { holdings: { patch: [{ id: "held-1", patch: { slot: "head" } }] } }],
    ["a card let go", { holdings: { delete: ["held-1"] } }],
    ["a card left on a field", { fieldCards: { insert: [{ field_id: "kurhan", card_id: "smok" }] } }],
    ["a card picked up off a field", { fieldCards: { delete: ["field-1"] } }],
    [
      "an effect laid on somebody",
      {
        effects: {
          insert: [
            {
              seat_id: "seat-a",
              source: "kamien",
              label: "Zamieniony w Kamień",
              modifier: { kind: "frozen" },
              ends: { kind: "turns", turns: 3 },
            },
          ],
        },
      },
    ],
    [
      "an effect running down",
      { effects: { patch: [{ id: "eff-1", patch: { ends: { kind: "turns", turns: 2 } } }] } },
    ],
    ["an effect lifted", { effects: { delete: ["eff-1"] } }],
    ["a line owed to the journal", { journal: [{ seatId: "seat-a", turn: 3, kind: "roll" }] }],
  ];

  it.each(oneWrite)("counts %s as something", (_what, writes) => {
    expect(isEmpty(writes)).toBe(false);
  });
});
