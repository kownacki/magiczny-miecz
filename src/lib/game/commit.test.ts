import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Tables } from "./fakeDb";

/**
 * The claims this file exists to prove.
 *
 * Everything else about a command can be tested against a literal snapshot, but
 * three properties are the commit's and only show up against a database: that a
 * losing writer writes nothing, that it re-decides against what is actually
 * there, and that the journal numbers itself from one place instead of racing.
 */

let tables: Tables;
let beforeWrite: (() => void) | undefined;
let handle: ReturnType<typeof fakeDb>;

// One handle per test, not one per property read: the interloper hook is
// one-shot, and rebuilding the fake on every `db.` access would re-arm it on
// every single write — which looks exactly like a bug in the code under test.
vi.mock("@/lib/supabase", () => ({
  get db() {
    return handle;
  },
}));

const { change, commit, loadSnapshot, Conflict } = await import("./change");
const { scriptedRandom } = await import("@/lib/engine/ports");

function seed(): Tables {
  return {
    games: [
      {
        id: "g1",
        join_code: "ABCD",
        mode: "simulation",
        eq_mode: "classic",
        die_source: "app",
        status: "playing",
        active_seat: 0,
        turn: 3,
        revision: 7,
        // The high-water mark lives on this row now, and the one line already
        // in `moves` is where it stands.
        journal_seq: 12,
        turn_state: { phase: "roll" },
        deck: null,
      },
    ],
    seats: [
      { id: "s1", game_id: "g1", seat_index: 0, life: 4, gold: 1, turns_lost: 0 },
    ],
    holdings: [],
    seat_effects: [],
    field_cards: [],
    moves: [{ id: "m0", game_id: "g1", seq: 12 }],
  };
}

beforeEach(() => {
  tables = seed();
  beforeWrite = undefined;
  handle = fakeDb(tables, () => beforeWrite?.());
});

const game = () =>
  tables.games[0] as unknown as { revision: number; turn: number; journal_seq: number };

describe("committing a change", () => {
  it("advances the revision by exactly one", async () => {
    await change("g1", () => ({
      writes: { seats: [{ id: "s1", patch: { gold: 5 } }] },
      result: undefined,
    }), undefined);
    expect(game().revision).toBe(8);
    expect(tables.seats[0].gold).toBe(5);
  });

  /**
   * The journal used to read `max(seq)` per line and throw the insert's error
   * away, so a line that lost a race simply vanished — from the one artefact
   * whose whole job is being believed afterwards.
   */
  it("numbers a whole command's journal from the snapshot, in one go", async () => {
    await change("g1", () => ({
      writes: {
        journal: [
          { seatId: "s1", turn: 3, kind: "roll" },
          { seatId: "s1", turn: 3, kind: "move" },
          { seatId: "s1", turn: 3, kind: "card" },
        ],
      },
      result: undefined,
    }), undefined);
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13, 14, 15]);
    expect(tables.moves.slice(1).map((m) => m.kind)).toEqual([
      "roll",
      "move",
      "card",
    ]);
  });

  it("refuses a snapshot somebody has already written past", async () => {
    const snapshot = await loadSnapshot("g1");
    game().revision = 9; // somebody else got there first
    await expect(commit(snapshot, { seats: [{ id: "s1", patch: { gold: 3 } }] })).rejects.toThrow(
      Conflict,
    );
  });

  /** The games row is taken first, so a loser has written nothing at all. */
  it("writes nothing else when it loses the row", async () => {
    const snapshot = await loadSnapshot("g1");
    game().revision = 9;
    await expect(
      commit(snapshot, {
        seats: [{ id: "s1", patch: { gold: 99 } }],
        journal: [{ seatId: "s1", turn: 3, kind: "roll" }],
      }),
    ).rejects.toThrow(Conflict);
    expect(tables.seats[0].gold).toBe(1);
    expect(tables.moves).toHaveLength(1);
  });
});

describe("losing the race", () => {
  it("re-runs the command against what is actually there", async () => {
    const seen: number[] = [];
    // Somebody else commits in the gap between our read and our write, once.
    // Strikes once, in the gap between our read and our write.
    beforeWrite = () => {
      beforeWrite = undefined;
      game().revision = 8;
      game().turn = 4;
    };

    await change("g1", (snap) => {
      seen.push(snap.game.turn);
      return { writes: { seats: [{ id: "s1", patch: { gold: 2 } }] }, result: undefined };
    }, undefined);

    // First attempt read turn 3 and lost; the retry read the turn the other
    // writer left behind.
    expect(seen).toEqual([3, 4]);
    expect(game().revision).toBe(9);
    expect(tables.seats[0].gold).toBe(2);
  });

  /**
   * A retry must not re-roll.
   *
   * Nothing was written and no answer went out, so re-running is safe —
   * re-throwing the dice would be the app deciding a fight on which attempt
   * happened to win the race.
   */
  it("throws the same dice on the retry", async () => {
    beforeWrite = () => {
      beforeWrite = undefined;
      game().revision = 8;
    };
    const rolled: number[] = [];

    await change(
      "g1",
      async (snap, _cmd, ports) => {
        const die = await ports.random.rollD6("walka");
        rolled.push(die);
        return { writes: { seats: [{ id: "s1", patch: { life: die } }] }, result: undefined };
      },
      undefined,
      { random: scriptedRandom([6, 1]) },
    );

    expect(rolled).toEqual([6, 6]);
    expect(tables.seats[0].life).toBe(6);
  });

  it("gives up rather than spinning forever", async () => {
    // Somebody who never stops writing.
    beforeWrite = () => {
      game().revision += 1;
    };
    let calls = 0;
    await expect(
      change("g1", () => {
        calls += 1;
        return { writes: {}, result: undefined };
      }, undefined),
    ).rejects.toThrow(Conflict);
    expect(calls).toBeGreaterThan(1);
  });
});

describe("a command that refuses", () => {
  it("leaves the table exactly as it was", async () => {
    await expect(
      change("g1", () => {
        throw new Error("Za mało złota.");
      }, undefined),
    ).rejects.toThrow(/Za mało złota/);
    expect(game().revision).toBe(7);
    expect(tables.moves).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------
 * Two changes, one line number.
 * ------------------------------------------------------------------------ */

/**
 * The bug this describes reached somebody typing at a table.
 *
 *   > magic 1 1
 *   commit(moves): duplicate key value violates unique constraint
 *   "moves_game_id_seq_key"
 *
 * The games row is the lock for a change and it is released the moment it is
 * updated — but the journal line is written last, after the seats and the
 * holdings. So a second change can read the table, win the lock and reach the
 * journal while the first is still working, and both think the next line is the
 * same line. The parameter had already moved by then; what was lost was the
 * line saying so, which is the one thing the journal must never lose.
 */
describe("two changes reaching the journal at once", () => {
  /**
   * The bug this describes reached somebody typing at a table.
   *
   *   > magic 1 1
   *   commit(moves): duplicate key value violates unique constraint
   *   "moves_game_id_seq_key"
   *
   * The line numbers came off `max(seq)` at snapshot time and the line was
   * written last, after the seats and the holdings — so a second change could
   * read the table, win the games row and reach the journal while the first was
   * still working, both holding the same number. It cannot happen now: the
   * range is claimed in the same statement that wins the row, and a writer that
   * does not win that statement writes nothing at all.
   */
  it("hands the whole range to whoever wins the row", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, {
      journal: [
        { seatId: "s1", turn: 3, kind: "roll" },
        { seatId: "s1", turn: 3, kind: "move" },
      ],
    });
    // Two lines taken, and the counter says so — which is what the next reader
    // of this row will start from.
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13, 14]);
    expect(game().journal_seq).toBe(14);
  });

  it("gives the loser no line numbers at all", async () => {
    const snapshot = await loadSnapshot("g1");
    // Somebody else commits in the gap — properly, taking the row and the two
    // numbers with it, which is the only way a line can be written.
    beforeWrite = () => {
      beforeWrite = undefined;
      game().revision = 8;
      game().journal_seq = 14;
      tables.moves.push({ id: "m-other", game_id: "g1", seq: 13, kind: "move" });
      tables.moves.push({ id: "m-other-2", game_id: "g1", seq: 14, kind: "card" });
    };

    await expect(
      commit(snapshot, { journal: [{ seatId: "s1", turn: 3, kind: "roll" }] }),
    ).rejects.toThrow(Conflict);

    // Nothing of ours was written, so nothing of ours could have collided.
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13, 14]);
  });

  it("numbers the retry from where the winner left off", async () => {
    beforeWrite = () => {
      beforeWrite = undefined;
      game().revision = 8;
      game().journal_seq = 13;
      tables.moves.push({ id: "m-other", game_id: "g1", seq: 13, kind: "move" });
    };

    await change("g1", () => ({
      writes: { journal: [{ seatId: "s1", turn: 3, kind: "roll" }] },
      result: undefined,
    }), undefined);

    // The first attempt lost the row and wrote nothing; the retry read the
    // counter the other writer left behind and took the line after it.
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13, 14]);
    expect(tables.moves.find((m) => m.seq === 14)?.kind).toBe("roll");
  });
});
