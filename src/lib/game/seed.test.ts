import { afterEach, describe, expect, it } from "vitest";
import { emptyTables, memoryHandle, memoryStore, resetStore, setStore } from "./gameStore";
import { createGame } from "./store";
import { setReady } from "./lobbyStore";
import { startGame, takeNewCharacter } from "./turnStore";
import { shuffleFor } from "./decks";
import { streamFor } from "@/lib/engine/prng";

/**
 * The same game, dealt twice.
 *
 * This is what replay stands on. A command is a pure function of its snapshot,
 * its inputs and its randomness — dice were always recoverable, and the order a
 * shuffled pile came back in was not, because it came from `Math.random`. With
 * a seed on the game and the revision in the key, running the same commands
 * against the same seed reaches the same table.
 */

afterEach(() => resetStore());

/** A table opened, a Postać chosen, the game started. Everything shuffled. */
async function dealt(seed: string) {
  const tables = emptyTables();
  const { game } = await createGame("Michał", "simulation", "slots", null, memoryHandle(tables));
  (tables.games[0] as Record<string, unknown>).seed = seed;

  const store = memoryStore(tables);
  setStore(store);
  const seat = tables.seats[0].id as string;
  await takeNewCharacter(game.id, seat, "goblin", seat);
  await setReady(game.id, (tables.users[0] as { id: string }).id, true);
  await startGame(game.id);

  const snapshot = await store.load(game.id);
  const deck = snapshot.game.deck as { events: { draw: unknown[] }; spells: { draw: unknown[] } };
  return {
    events: deck.events.draw,
    spells: deck.spells.draw,
    // 9.5 deals the GOBLIN's opening Zaklęcie off the shuffled pile, at a later
    // revision than the shuffle that built it — so this is the part that would
    // break if the revision were not in the key.
    held: snapshot.holdings.map((one) => one.card_id),
  };
}

describe("a game that can be dealt again", () => {
  it("reaches the same table from the same seed", async () => {
    const first = await dealt("ten-sam");
    const second = await dealt("ten-sam");

    expect(second.events).toEqual(first.events);
    expect(second.spells).toEqual(first.spells);
    expect(second.held).toEqual(first.held);
    // And it is a real shuffle rather than the printed order coming back.
    expect(first.events.length).toBeGreaterThan(50);
  });

  it("reaches a different one from a different seed", async () => {
    const first = await dealt("ten-sam");
    const other = await dealt("zupelnie-inny");

    expect(other.events).not.toEqual(first.events);
  });

  /**
   * Two piles turned over at different moments in one game must not come back
   * the same way — which is why the revision is in the key and not just the
   * seed. Without it, every reshuffle in a game would deal the same order.
   */
  it("gives a different order at every moment of the same game", () => {
    const at = (revision: number) =>
      shuffleFor({ seed: "ten-sam", revision })(["a", "b", "c", "d", "e", "f", "g", "h"]);

    expect(at(12)).not.toEqual(at(3));
    // And the same moment, asked twice, is the same answer — the whole point.
    expect(at(12)).toEqual(at(12));
  });

  it("falls back to unrepeatable randomness for a game with no seed", () => {
    const order = () => shuffleFor({ seed: null, revision: 1 })([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Not a claim that two draws differ — they might not — only that nothing
    // here is derived from the game, which is what makes those tables
    // unreplayable and is why they cannot be migrated.
    expect(order()).toHaveLength(10);
  });

  it("is the same stream on any machine", () => {
    // Pinned to actual numbers rather than compared with itself, because the
    // property worth guarding is that *these* values never change: a different
    // generator would silently invalidate every save that could be replayed,
    // and a test that checks the stream against itself would not notice.
    const stream = streamFor("magiczny-miecz", 1);
    expect([stream(), stream(), stream()].map((n) => Math.floor(n * 1e6))).toEqual([
      706212, 381212, 267116,
    ]);
  });
});
