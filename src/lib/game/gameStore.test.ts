import { asTurnState, top } from "@/lib/engine/stack";
import { afterEach, describe, expect, it } from "vitest";
import { Conflict, apply } from "./change";
import { activeStore, memoryStore, resetStore, setStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import { rollForMove } from "./turnStore";

/**
 * The contract every `GameStore` owes, proved against the one that is not a
 * database.
 *
 * `commit.test.ts` proves the same properties by mocking the Supabase module,
 * which is a test-time trick; this file proves them through the runtime seam,
 * with nothing mocked and no network reachable. That difference is the whole
 * point of the port: if these pass, the rules can be *hosted* somewhere other
 * than Postgres, which is what docs/TERMINAL.md is built on.
 *
 * What is really under test is the handle. Both stores are `storeOver`, so the
 * commit logic is identical by construction and there is nothing to compare —
 * what could differ is whether a fake PostgREST loses a race the real one loses.
 * A fake that said yes to everything would pass every test that did not race.
 */

/** A table mid-turn: one character standing somewhere, waiting to roll. */
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
        journal_seq: 12,
        last_played_at: "2026-01-01T00:00:00Z",
        turn_state: { phase: "roll" },
        deck: null,
        characters_out: [],
      },
    ],
    seats: [
      {
        id: "s1",
        game_id: "g1",
        seat_index: 0,
        character_id: "goblin",
        field_id: "zaczarowane-wzgorza",
        life: 4,
        gold: 1,
        turns_lost: 0,
        eliminated: false,
        sword_own: 0,
        magic_own: 0,
      },
    ],
    users: [
      { id: "usra", game_id: "g1", name: "Michał", seat_index: 0, is_host: true, ready: true },
    ],
    holdings: [],
    seat_effects: [],
    field_cards: [],
    field_gold: [],
    moves: [{ id: "m0", game_id: "g1", seq: 12 }],
  };
}

afterEach(() => resetStore());

describe("a game kept somewhere that is not Postgres", () => {
  it("plays a real command end to end, with no database anywhere", async () => {
    const tables = seed();
    setStore(memoryStore(tables));

    // Not a fixture and not a hand-written changeset: the same function the
    // HTTP route calls, through the same `change()`, against the same rules.
    await rollForMove("g1", 4);

    const game = tables.games[0] as Record<string, unknown>;
    expect(game.revision).toBe(8);
    expect(top(asTurnState(game.turn_state)).phase).toBe("move");
    // The roll was recorded, numbered from where the snapshot found the mark.
    expect(tables.moves.map((row) => row.seq)).toEqual([12, 13]);
    expect(tables.moves[1]).toMatchObject({ kind: "roll", payload: { roll: 4, manual: true } });
  });

  it("hands back everything a change may read", async () => {
    const tables = seed();
    const store = memoryStore(tables);
    const snapshot = await store.load("g1");

    expect(snapshot.game.id).toBe("g1");
    expect(snapshot.seats).toHaveLength(1);
    expect(snapshot.users).toHaveLength(1);
    // Off the games row rather than a sixth query — the thing that closed the
    // gap two changes used to meet in.
    expect(snapshot.journalSeq).toBe(12);
  });

  /**
   * The property the offline store exists to keep rather than skip.
   *
   * One terminal has no second writer, so this looks like ceremony — it is not.
   * The moment an in-memory game is allowed a cheaper commit there are two sets
   * of rules to keep honest, which is the argument that parked companion mode.
   */
  it("refuses a stale write, and writes none of it", async () => {
    const tables = seed();
    const store = memoryStore(tables);
    const snapshot = await store.load("g1");

    // Somebody else got there first.
    (tables.games[0] as Record<string, unknown>).revision = 8;

    await expect(
      store.commit(snapshot, {
        game: { round: 99 },
        seats: [{ id: "s1", patch: { life: 1 } }],
        journal: [{ seatId: "s1", round: 3, kind: "roll", payload: {} }],
      }),
    ).rejects.toBeInstanceOf(Conflict);

    // Not "the games row was left alone" — *nothing* was written. A commit that
    // gave up halfway would leave a seat on 1 Życie and no line saying why.
    expect(tables.games[0]).toMatchObject({ round: 3, revision: 8 });
    expect(tables.seats[0]).toMatchObject({ life: 4 });
    expect(tables.moves).toHaveLength(1);
  });

  it("writes nothing at all for a changeset that asks for nothing", async () => {
    const tables = seed();
    const store = memoryStore(tables);
    const snapshot = await store.load("g1");

    const at = await store.commit(snapshot, {});

    // Not even the revision: the counter is how other devices learn something
    // happened, and nothing did.
    expect(at).toBe(7);
    expect(tables.games[0]).toMatchObject({ revision: 7 });
  });

  it("is the store the rules actually reach for", async () => {
    const tables = seed();
    const store = memoryStore(tables);
    setStore(store);
    expect(activeStore()).toBe(store);

    // And `apply` still describes what a commit would do, so a command can read
    // its own writes without either half knowing where the game is kept.
    const snapshot = await store.load("g1");
    expect(apply(snapshot, { game: { round: 4 } }).game.round).toBe(4);
  });
});
