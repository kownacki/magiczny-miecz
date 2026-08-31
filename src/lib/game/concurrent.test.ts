import { describe, expect, it } from "vitest";
import { memoryStore, resetStore, setStore } from "./gameStore";
import type { Tables } from "./fakeDb";
import { takeFromField } from "./turnStore";

/**
 * Several hands reaching for one Obszar at once.
 *
 * 12.1 puts what is lying on a field within reach of whoever's move ends there,
 * and „Leży tutaj" offers a „weź" under every card at once — so the presses can
 * overlap, and each is a separate question with its own answer. What must not
 * happen is any of the ways that could go wrong quietly: the same card taken
 * twice, a card that vanishes without arriving anywhere, or 5.4's limit stepped
 * over because two takes each read a pack with room in it.
 *
 * Nothing here is mocked. These are the same functions the route calls, through
 * the same `change` — the queue and the compare-and-swap included — against a
 * game kept in a `Map` rather than in Postgres. See `gameStore.test.ts` for why
 * that is a fair test of the real thing.
 */

const HERE = "kurhan";

function seed(lying: string[]): Tables {
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
        // 12.1's window: the move ended here, and the Obszar owes nothing.
        turn_state: { phase: "field", fieldId: HERE, draw: 0, drawn: [], fought: [], from: null },
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
        field_id: HERE,
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
    field_cards: lying.map((cardId, at) => ({
      id: `fc${at + 1}`,
      game_id: "g1",
      field_id: HERE,
      card_id: cardId,
      granted: false,
    })),
    moves: [{ id: "m0", game_id: "g1", seq: 12 }],
  };
}

/** What the seat is holding, by card, in whatever order it ended up. */
const packed = (tables: Tables) =>
  tables.holdings.map((row) => String((row as Record<string, unknown>).card_id)).sort();

describe("two cards taken off one Obszar at the same time", () => {
  it("lands both, once each", async () => {
    const tables = seed(["helm", "miecz"]);
    setStore(memoryStore(tables));

    // Started together and not awaited in turn: this is two presses inside one
    // round trip, which is exactly what a „weź" per card allows.
    await Promise.all([takeFromField("g1", "s1", "fc1"), takeFromField("g1", "s1", "fc2")]);

    expect(packed(tables)).toEqual(["helm", "miecz"]);
    expect(tables.field_cards).toHaveLength(0);
    // Two changes, two revisions: neither was folded into the other's write.
    expect((tables.games[0] as Record<string, unknown>).revision).toBe(9);
    resetStore();
  });

  it("gives the same card to one of them and refuses the other", async () => {
    const tables = seed(["helm"]);
    setStore(memoryStore(tables));

    const answers = await Promise.allSettled([
      takeFromField("g1", "s1", "fc1"),
      takeFromField("g1", "s1", "fc1"),
    ]);

    expect(answers.map((one) => one.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = answers.find((one) => one.status === "rejected");
    expect(String((refused as PromiseRejectedResult).reason)).toContain("Tej Karty już tam nie ma");
    // The half that matters: one card, one holding. A second copy would be a
    // Przedmiot the box does not have.
    expect(packed(tables)).toEqual(["helm"]);
    expect(tables.field_cards).toHaveLength(0);
    resetStore();
  });

  it("keeps 5.4's four when five are grabbed at once", async () => {
    const tables = seed(["helm", "miecz", "zbroja", "sztylet", "rekawice"]);
    setStore(memoryStore(tables));

    const answers = await Promise.allSettled(
      ["fc1", "fc2", "fc3", "fc4", "fc5"].map((id) => takeFromField("g1", "s1", id)),
    );

    // Four in the pack and one refusal — not five, which is what happens if two
    // takes are decided against the same snapshot.
    expect(tables.holdings).toHaveLength(4);
    expect(answers.filter((one) => one.status === "rejected")).toHaveLength(1);
    // The refused card is still lying there, whole: a take that fails writes
    // nothing at all, so it cannot leave the field without arriving.
    expect(tables.field_cards).toHaveLength(1);
    resetStore();
  });
});
