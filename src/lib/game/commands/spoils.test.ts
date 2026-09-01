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

/**
 * 16.2: "Karty pokonanych Wrogów tego rodzaju można zachować" — a beaten Wróg's
 * Karta is *kept*, which is the opposite of left lying.
 *
 * Nothing took him off the Obszar. `trophiesFrom` put his Karta in the winner's
 * pack and `leaveCardsBehind` wrote the same Karta back onto the square at the
 * end of the turn, so a beaten Wilk was a trophy in a pack *and* a live
 * creature on the board, waiting for whoever stopped there next. Found at a
 * real table on Płaskowyż Mgieł: two Wrogowie beaten together under 17.5, both
 * still standing in the Obszar's window afterwards.
 */
describe("a beaten Wróg leaves the Obszar (16.2)", () => {
  const won = (over: { cardId?: string; fought?: string[]; drawn?: unknown[] } = {}) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "wrzosowiska",
          from: null,
          draw: 0,
          drawn: over.drawn ?? [
            { cardId: "wilk", cardClass: "foe" },
            { cardId: "helm", cardClass: "item" },
          ],
        },
        stack: undefined,
      } as never,
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: "wrzosowiska" })],
    });

  /** Built as a fight pushed over that field, which is what an ordinary one is. */
  const fighting = (fought: string[]) => {
    const table = won();
    const field = (table.game.turn_state as { stack: unknown[] }).stack[0];
    return {
      ...table,
      game: {
        ...table.game,
        turn_state: {
          stack: [
            field,
            {
              phase: "fight",
              fight: {
                cardId: fought[0],
                cardName: fought[0].toUpperCase(),
                kind: "ordinary",
                enemyTotal: 2,
                playerTotal: 9,
                playerRoll: 6,
                enemyRoll: 1,
                result: { outcome: "wygrana" },
                fieldId: "wrzosowiska",
                draw: 0,
                drawn: (field as { drawn: unknown[] }).drawn,
                fought,
              },
            },
          ],
        },
      },
    } as typeof table;
  };

  it("takes the beaten creature out of the turn's Karty", async () => {
    const { writes } = await resolveFight(fighting(["wilk"]), undefined, ports({ random: scriptedRandom([]) }));
    const after = apply(fighting(["wilk"]), writes);
    const state = (after.game.turn_state as { stack: { drawn?: { cardId: string }[] }[] }).stack[0];
    expect(state.drawn?.map((one) => one.cardId)).toEqual(["helm"]);
  });

  /** 17.5 settles a pack as one, so all of it leaves together. */
  it("takes the whole pack when they were fought as one (17.5)", async () => {
    const table = fighting(["wilk", "niedzwiedz"]);
    const { writes } = await resolveFight(table, undefined, ports({ random: scriptedRandom([]) }));
    const state = (apply(table, writes).game.turn_state as {
      stack: { drawn?: { cardId: string }[] }[];
    }).stack[0];
    expect(state.drawn?.map((one) => one.cardId)).toEqual(["helm"]);
  });
});
