import { afterEach, describe, expect, it } from "vitest";
import { activeStore, emptyTables, memoryStore, resetStore, setStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import { takeCard, takeFromField } from "./turnStore";

/**
 * A Karta that resolves on being taken lands in one Commit with the take.
 *
 * A Sztuka Złota lifts off the Obszar and turns into a coin. Those used to be
 * two `change()` calls — the take, then `applyEffect` — so a Conflict between
 * them left the card gone and the coin unpaid. The revision is the witness: one
 * change advances it by exactly one, and the coin is there when it has.
 */

function seed(drawn: { cardId: string }[], lying: { id: string; card_id: string }[] = []): Tables {
  return {
    ...emptyTables(),
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
        turn_state: {
          stack: [{ phase: "field", fieldId: "kurhan", from: null, draw: 0, drawn }],
        },
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
    users: [],
    field_cards: lying.map((row) => ({ ...row, game_id: "g1", field_id: "kurhan", granted: false })),
  } as unknown as Tables;
}

afterEach(resetStore);

describe("a take that resolves", () => {
  it("pays the coin in the same revision as the take", async () => {
    setStore(memoryStore(seed([{ cardId: "1-sztuka-zlota" }])));
    await takeCard("g1", "s1", "1-sztuka-zlota");
    const after = await activeStore().load("g1");
    expect(after.game.revision).toBe(8);
    expect(after.seats[0].gold).toBe(2);
    // Two lines — the take and the coin — numbered in one go.
    expect(after.journalSeq).toBe(14);
  });

  it("does the same off the Obszar", async () => {
    setStore(memoryStore(seed([], [{ id: "fc1", card_id: "1-sztuka-zlota" }])));
    await takeFromField("g1", "s1", "fc1");
    const after = await activeStore().load("g1");
    expect(after.game.revision).toBe(8);
    expect(after.seats[0].gold).toBe(2);
    expect(after.fieldCards).toHaveLength(0);
  });
});
