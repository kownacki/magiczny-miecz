import { asTurnState, top } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { memoryStore, resetStore, setStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import { adjust, takeNewCharacter } from "./turnStore";

/**
 * The last Postać at the table dies, and its player starts again (4.4).
 *
 * Written after the state was found in the wild: a sole player died, took a new
 * Karta, and the game sat there. `killSeat` hands the turn on, `nextSeat` looks
 * round a table of one eliminated seat and comes back with nobody, and
 * `active_seat` goes null — after which every action is refused for want of an
 * active seat, including the ones that would move the game on. So the new
 * character was standing on its MGR with its kit and „To nie twoja tura (10.1)"
 * for everything it tried.
 *
 * The whole sequence rather than the command, because that is where it went
 * wrong: each half was doing what it says, and the state between them was the
 * bug. Nothing mocked — the same functions the routes call, through the same
 * `change`, against a game kept in a `Map`.
 */

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
        trophy_mode: "points",
      },
    ],
    seats: [
      {
        id: "s1",
        game_id: "g1",
        seat_index: 0,
        character_id: "goblin",
        field_id: "kurhan",
        life: 2,
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

const game = (tables: Tables) => tables.games[0] as Record<string, unknown>;
const seat = (tables: Tables) => tables.seats[0] as Record<string, unknown>;

describe("the only Postać dies and its player takes another (4.4)", () => {
  it("leaves nobody to play, and then gives the turn to whoever arrives", async () => {
    const tables = seed();
    setStore(memoryStore(tables));

    // Through the door a lost fight goes through, so the whole of 4.4 happens.
    await adjust("g1", "s1", "life", -2, null);
    expect(seat(tables).eliminated).toBe(true);
    // The table has stopped: this is the state the bug was found sitting in.
    expect(game(tables).active_seat).toBeNull();

    await takeNewCharacter("g1", "s1", "zdobywca", "s1");

    expect(seat(tables)).toMatchObject({ character_id: "zdobywca", eliminated: false, life: 4 });
    // Standing on its MGR *and* able to play: it is turn one of the rest of
    // the game, not a figure on a board nobody may touch.
    expect(game(tables).active_seat).toBe(0);
    expect(top(asTurnState(game(tables).turn_state))).toMatchObject({ phase: "roll" });
    // The dead Karta stays out of the game (4.4), which is what stops it being
    // picked again by the very seat that overwrote it.
    expect(game(tables).characters_out).toEqual(["goblin"]);
    resetStore();
  });

  it("does not take the turn from a table that still has somebody in it", async () => {
    const tables = seed();
    tables.seats.push({
      id: "s2",
      game_id: "g1",
      seat_index: 1,
      character_id: "kaplanka",
      field_id: "uroczysko",
      life: 4,
      gold: 1,
      turns_lost: 0,
      eliminated: false,
      sword_own: 0,
      magic_own: 0,
    });
    setStore(memoryStore(tables));

    await adjust("g1", "s1", "life", -2, null);
    // The turn went to the seat that is still playing, as it always did.
    expect(game(tables).active_seat).toBe(1);

    await takeNewCharacter("g1", "s1", "zdobywca", "s1");

    // And the new arrival waits for it, rather than helping itself.
    expect(game(tables).active_seat).toBe(1);
    resetStore();
  });
});
