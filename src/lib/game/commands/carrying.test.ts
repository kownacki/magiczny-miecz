import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { overCarried, refuseWhileOverCarried } from "./seat";
import { rollForMove } from "./movement";
import { dropCard } from "./holdings";

/**
 * 5.6, in the direction nothing watched.
 *
 * Taking a fifth Przedmiot is refused, so the limit holds where it would be
 * broken. The other way round it was not: lose the transport and the limit
 * falls under what is already in the pack. "Postać, która zdobyła więcej niż 4
 * Przedmioty i nie dysponuje żadnym środkiem transportu musi natychmiast
 * odrzucić Przedmioty, których nie jest w stanie unieść."
 *
 * The app does not choose which — 5.4 gives that to the player, "zależy
 * wyłącznie od decyzji gracza" — so it stops the game instead and says how many
 * have to go.
 */
const PACK = ["helm", "zbroja", "miecz", "sztylet", "tarcza"];

const carrying = (cards: readonly string[]) =>
  aTable({
    game: { active_seat: 0, turn_state: { phase: "roll" } },
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "mokradla-1" })],
    holdings: cards.map((cardId, at) =>
      aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
    ),
  });

describe("carrying more than you can", () => {
  it("is not over the limit while the Koń is in the pack", () => {
    // Base four plus the Koń's eight is twelve, and six is under it.
    expect(overCarried(carrying([...PACK, "kon"]), "seat-a")).toBeNull();
  });

  it("is over it the moment the Koń goes", () => {
    expect(overCarried(carrying(PACK), "seat-a")).toEqual({ carried: 5, limit: 4 });
  });

  it("says how many have to go, and whose choice it is", () => {
    expect(() => refuseWhileOverCarried(carrying(PACK), "seat-a")).toThrow(/odrzuć 1/);
    expect(() => refuseWhileOverCarried(carrying(PACK), "seat-a")).toThrow(/5\.6/);
    // Polish counts: five takes the genitive plural.
    expect(() => refuseWhileOverCarried(carrying(PACK), "seat-a")).toThrow(/5 Przedmiotów/);
  });

  /** The turn does not begin until the rule has been obeyed. */
  it("will not let the turn start", async () => {
    await expect(
      rollForMove(carrying(PACK), {} as never, ports({ random: scriptedRandom([4]) })),
    ).rejects.toThrow(/5\.6/);
  });

  it("lets the turn start once the pack is legal again", async () => {
    const table = carrying(PACK);
    const after = apply(table, dropCard(table, { holdingId: "h4" }).writes);
    expect(overCarried(after, "seat-a")).toBeNull();
    await expect(
      rollForMove(after, {} as never, ports({ random: scriptedRandom([4]) })),
    ).resolves.toBeTruthy();
  });

  /**
   * Dropping is the way out and must never be the thing refused, or a seat over
   * the limit would have no move that fixes it.
   */
  it("never blocks the one thing that resolves it", () => {
    const table = carrying(PACK);
    expect(() => dropCard(table, { holdingId: "h0" })).not.toThrow();
  });
});
