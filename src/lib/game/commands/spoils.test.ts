import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFight } from "./spoils";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * 17.9 — "Zwycięzca ma prawo zmusić pokonanego do utraty jednego punktu Życia
 * … lub zabrać mu jeden Przedmiot (również Magiczny) albo Sztukę Złota."
 *
 * Three ways to end a duel; the app could only ever do the first, so a winner
 * who wanted the Magiczny Miecz off a beaten rival had no way to say so and the
 * referee was making the choice the rulebook gives the player.
 */
const duel = (over: { eqMode?: "slots" | "classic"; theirGold?: number } = {}) =>
  aTable({
    game: {
      active_seat: 0,
      eq_mode: over.eqMode ?? "classic",
      turn_state: {
        phase: "fight",
        fight: {
        cardId: "seat:1",
        cardName: "Ola",
        kind: "ordinary",
        enemyTotal: 2,
        playerTotal: 9,
        playerRoll: 6,
        enemyRoll: 1,
        result: { outcome: "wygrana" },
        fieldId: "wrzosowiska",
        draw: 0,
        drawn: [],
        fought: [],
        opponentSeat: 1,
        },
      } as unknown as TurnPhase,
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"), field_id: "wrzosowiska", gold: 1 }),
      aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"), field_id: "wrzosowiska", life: 4, gold: over.theirGold ?? 2 }),
    ],
    holdings: [aHolding({ id: "h1", seat_id: "seat-b", card_id: "miecz", kind: "item" })],
  });

const settle = async (table: ReturnType<typeof duel>, spoils?: Parameters<typeof resolveFight>[1]) =>
  apply(table, (await resolveFight(table, spoils, ports({ random: scriptedRandom([6, 6, 6, 6]) }))).writes);

const seat = (t: ReturnType<typeof apply>, id: string) => t.seats.find((one) => one.id === id);

describe("what the winner of a duel takes (17.9)", () => {
  it("takes the Życie when nothing else is named, as it always did", async () => {
    const after = await settle(duel());
    expect(seat(after, "seat-b")?.life).toBe(3);
  });

  it("takes a Sztuka Złota instead, and no Życie with it", async () => {
    const after = await settle(duel(), { spoils: { take: "zloto" } });
    expect(seat(after, "seat-b")?.gold).toBe(1);
    expect(seat(after, "seat-a")?.gold).toBe(2);
    // "lub" — an alternative to forcing the loss, not an addition to it.
    expect(seat(after, "seat-b")?.life).toBe(4);
  });

  it("refuses the gold the loser has not got", async () => {
    await expect(settle(duel({ theirGold: 0 }), { spoils: { take: "zloto" } })).rejects.toThrow(
      /17\.9/,
    );
  });

  /** The card changes hands rather than being destroyed, so 21.2's stock holds. */
  it("takes a Przedmiot, which moves rather than vanishing", async () => {
    const after = await settle(duel(), { spoils: { take: "przedmiot", holdingId: "h1" } });
    const moved = after.holdings.find((one) => one.id === "h1");
    expect(moved?.seat_id).toBe("seat-a");
    expect(seat(after, "seat-b")?.life).toBe(4);
  });

  /** It arrives the way anything arrives: worn if there is a place for it. */
  it("puts a won Przedmiot on the arm in slotowy", async () => {
    const after = await settle(duel({ eqMode: "slots" }), {
      spoils: { take: "przedmiot", holdingId: "h1" },
    });
    expect(after.holdings.find((one) => one.id === "h1")?.slot).toBe("main-hand");
  });

  it("refuses a Przedmiot the loser is not holding", async () => {
    await expect(
      settle(duel(), { spoils: { take: "przedmiot", holdingId: "nope" } }),
    ).rejects.toThrow(/17\.9/);
  });
});
