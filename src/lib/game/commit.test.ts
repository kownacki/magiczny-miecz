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

const { change, commit, loadSnapshot, statementsFor, Conflict } = await import("./change");
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
        round: 3,
        revision: 7,
        // The high-water mark lives on this row now, and the one line already
        // in `moves` is where it stands.
        journal_seq: 12,
        // When the table was last actually played, which is what a list of
        // tables sorts by — so a test can tell a change that touched the row
        // from one that left it alone.
        last_played_at: "2026-01-01T00:00:00Z",
        turn_state: { phase: "roll" },
        deck: null,
      },
    ],
    seats: [
      { id: "s1", game_id: "g1", seat_index: 0, life: 4, gold: 1, turns_lost: 0 },
      { id: "s2", game_id: "g1", seat_index: 1, life: 4, gold: 1, turns_lost: 0 },
    ],
    // The people driving them, which is a different table with a different
    // lifetime: seats stay put and players come and go past them.
    users: [
      { id: "usra", game_id: "g1", name: "Michał", seat_index: 0, is_host: true, ready: true },
      { id: "usrb", game_id: "g1", name: "Ola", seat_index: 1, is_host: false, ready: true },
    ],
    holdings: [],
    seat_effects: [],
    field_cards: [],
    field_gold: [],
    moves: [{ id: "m0", game_id: "g1", seq: 12 }],
  };
}

beforeEach(() => {
  tables = seed();
  beforeWrite = undefined;
  handle = fakeDb(tables, () => beforeWrite?.());
});

const game = () =>
  tables.games[0] as unknown as {
    revision: number;
    round: number;
    journal_seq: number;
    last_played_at: string;
  };

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
          { seatId: "s1", round: 3, kind: "roll" },
          { seatId: "s1", round: 3, kind: "move" },
          { seatId: "s1", round: 3, kind: "card" },
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
        journal: [{ seatId: "s1", round: 3, kind: "roll" }],
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
      game().round = 4;
    };

    await change("g1", (snap) => {
      seen.push(snap.game.round);
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
        // Something, rather than nothing: an empty changeset is not committed
        // at all and so can never lose a race. See `isEmpty`.
        return { writes: { seats: [{ id: "s1", patch: { life: 3 } }] }, result: undefined };
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
        { seatId: "s1", round: 3, kind: "roll" },
        { seatId: "s1", round: 3, kind: "move" },
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
      commit(snapshot, { journal: [{ seatId: "s1", round: 3, kind: "roll" }] }),
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
      writes: { journal: [{ seatId: "s1", round: 3, kind: "roll" }] },
      result: undefined,
    }), undefined);

    // The first attempt lost the row and wrote nothing; the retry read the
    // counter the other writer left behind and took the line after it.
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13, 14]);
    expect(tables.moves.find((m) => m.seq === 14)?.kind).toBe("roll");
  });
});

/* ---------------------------------------------------------------------------
 * A seat leaving the poczekalnia.
 * ------------------------------------------------------------------------ */

/**
 * The one row in the schema a change is allowed to delete.
 *
 * Nothing else about a seat is ever removed — 4.4 retires a dead character and
 * the journal keeps `seat_id` references to everything that seat ever did — so
 * the only departure is from the lobby: the wrong table joined, or a tab closed
 * before the game started. What has to hold is that `apply` and `commit` mean
 * the same thing by it, because the lobby cascades through `apply` and then
 * hands the whole changeset here.
 */
/**
 * The failure that made a commit one statement, on 2026-09-03.
 *
 * A player took a Tarcza Tolimana off a Nieznajomy. The Tarcza moved, the turn
 * advanced, and then the journal insert was refused: `moves_kind_check` in the
 * live database was two kinds behind the code. The state had happened and the
 * record of it had not, which is the one failure the journal must not have —
 * and the compare-and-swap had nothing to say about it, because this writer had
 * *won*. It is statement nineteen of nineteen failing, not somebody else moving
 * first.
 */
describe("a statement the database refuses", () => {
  /** The journal line is numbered 13, and something is already sitting there. */
  const alreadyTaken = () => {
    tables.moves.push({ id: "m-taken", game_id: "g1", seq: 13, kind: "roll" });
  };

  it("takes back everything the same change had already written", async () => {
    alreadyTaken();
    const snapshot = await loadSnapshot("g1");

    await expect(
      commit(snapshot, {
        game: { round: 4 },
        seats: [{ id: "s1", patch: { gold: 99 } }],
        journal: [{ seatId: "s1", round: 3, kind: "taken" }],
      }),
    ).rejects.toThrow(/duplicate key/);

    // The Tarcza does not move without the line that says it moved.
    expect(game().revision).toBe(7);
    expect(game().round).toBe(3);
    expect(game().journal_seq).toBe(12);
    expect(tables.seats[0].gold).toBe(1);
    expect(tables.moves.map((m) => m.seq)).toEqual([12, 13]);
  });

  /**
   * And it is told once. A `Conflict` is re-decided against what is actually
   * there, because nothing was written and the table has simply moved on; a
   * refusal is not that, and re-running it four times would be four attempts to
   * write something the database has already said no to.
   */
  it("is not retried the way losing a race is", async () => {
    alreadyTaken();
    let calls = 0;

    await expect(
      change("g1", () => {
        calls += 1;
        return {
          writes: { journal: [{ seatId: "s1", round: 3, kind: "taken" as const }] },
          result: undefined,
        };
      }, undefined),
    ).rejects.toThrow(/duplicate key/);

    expect(calls).toBe(1);
  });
});

describe("removing a seat", () => {
  it("deletes the row and leaves the others sitting there", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, { seatsRemoved: ["s2"] });
    expect(tables.seats.map((seat) => seat.id)).toEqual(["s1"]);
  });

  /**
   * The sweep's own shape: the chairs of the people who went are dropped and
   * whatever the same change says about the ones that stay still lands. Both in
   * one write, because two would show the table a state neither of them meant.
   */
  it("patches the seats that stayed", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, {
      seatsRemoved: ["s1"],
      seats: [{ id: "s2", patch: { gold: 4 } }],
    });
    expect(tables.seats.map((seat) => seat.id)).toEqual(["s2"]);
    expect(tables.seats[0].gold).toBe(4);
  });

  /**
   * A changeset that patches the same seat it removes leaves the same table
   * behind either way round, so the order is only visible from inside the
   * commit — and it is the order that has to match `apply`, which folds the
   * removals first. Patch first and a cascade would be reading a snapshot the
   * database disagrees with.
   *
   * Read off the statement list rather than watched going past. It used to be
   * proved by pushing the seats table onto an array before every write and
   * counting three of them, which is as close as anybody could get while a
   * commit was nineteen calls in a row. A commit is now one call over a list
   * that was decided before anything was touched, so the order is a value —
   * which is both stronger evidence and the same evidence the transaction on
   * the other side is handed.
   */
  it("orders the delete before any patch, as `apply` folds them", async () => {
    const snapshot = await loadSnapshot("g1");
    const statements = statementsFor(snapshot, {
      seatsRemoved: ["s1"],
      seats: [{ id: "s1", patch: { gold: 99 } }],
    });

    expect(statements.map((one) => `${one.op} ${one.table}`)).toEqual([
      // The games row first, which is the lock and the compare-and-swap.
      "update games",
      "delete seats",
      "update seats",
    ]);

    // And it lands that way round: by the time the patch is reached there is
    // nothing left for it to hit.
    await commit(snapshot, {
      seatsRemoved: ["s1"],
      seats: [{ id: "s1", patch: { gold: 99 } }],
    });
    expect(tables.seats.map((seat) => seat.id)).toEqual(["s2"]);
  });

  /** The removal is a write like any other, so it takes the row and the revision. */
  it("counts as a change the other devices are told about", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, { seatsRemoved: ["s2"] });
    expect(game().revision).toBe(8);
  });
});

/* ---------------------------------------------------------------------------
 * A change that decided to do nothing.
 * ------------------------------------------------------------------------ */

/**
 * Where the empty changeset comes from, and why it must cost nothing.
 *
 * The poczekalnia sweep runs on every poll from every device and finds nobody
 * gone almost every time. `revision` exists to wake the other browsers and
 * `last_played_at` to say when the table was last played; a change that did
 * nothing did neither, and bumping anyway would have six devices refetching a
 * table nothing had happened to, several times a second, and re-sorting the
 * list of games while they were at it.
 */
describe("committing nothing", () => {
  it("leaves the revision where it was", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, {});
    expect(game().revision).toBe(7);
  });

  it("hands back the revision the caller already had", async () => {
    const snapshot = await loadSnapshot("g1");
    // Not `base + 1`: whoever is about to send this number to a browser would
    // be telling it to refetch a table that has not moved.
    await expect(commit(snapshot, {})).resolves.toBe(7);
  });

  it("does not say the table was played", async () => {
    const snapshot = await loadSnapshot("g1");
    await commit(snapshot, {});
    expect(game().last_played_at).toBe("2026-01-01T00:00:00Z");
  });

  it("owes the journal nothing", async () => {
    const snapshot = await loadSnapshot("g1");
    // Every key present and every one of them empty, which is what a command
    // that builds its lists before it knows whether it will fill them hands
    // back — the sweep's own shape, and still not a change.
    await commit(snapshot, { seatsRemoved: [], seats: [], journal: [] });
    expect(tables.moves).toHaveLength(1);
    expect(game().journal_seq).toBe(12);
    expect(game().revision).toBe(7);
  });

  /**
   * A sweep that ran while somebody else was playing must not raise a
   * `Conflict` — it would be reported as a failure to the device that polled,
   * and `change` would spend its four attempts re-deciding to do nothing.
   * Nothing is written, so there is no row to lose and no race to be in.
   */
  it("cannot lose a race it never entered", async () => {
    const snapshot = await loadSnapshot("g1");
    // Somebody else, writing in the gap between the read and the write — which
    // never comes, so this never fires.
    beforeWrite = () => {
      game().revision = 8;
    };

    await expect(commit(snapshot, {})).resolves.toBe(7);
    expect(game().revision).toBe(7);
  });
});

/**
 * `seat_effects.seat_id` went nullable so a row can be held by a Karta lying
 * on an Obszar instead of by a seat — see the migration and `EffectRow`'s own
 * comment. Nothing in the app writes one of these yet; this is the fake's
 * apply_change path proving the shape lands, ahead of the card that will.
 */
describe("a status held by a Karta rather than a seat", () => {
  it("writes seat_id null and field_card_id set, through the same door as any other effect", async () => {
    tables.field_cards.push({
      id: "fc-1",
      game_id: "g1",
      field_id: "krag-ognia",
      card_id: "cyklop",
    });
    await change("g1", () => ({
      writes: {
        effects: {
          insert: [
            {
              seat_id: null,
              field_card_id: "fc-1",
              source: "krag-plomieni",
              label: "Krąg Płomieni",
              modifier: { kind: "frozen" },
              ends: { kind: "dispelled" },
            },
          ],
        },
      },
      result: undefined,
    }), undefined);
    expect(tables.seat_effects).toHaveLength(1);
    expect(tables.seat_effects[0]).toMatchObject({
      seat_id: null,
      field_card_id: "fc-1",
      source: "krag-plomieni",
    });
  });
});
