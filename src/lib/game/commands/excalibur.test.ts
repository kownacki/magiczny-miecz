import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFight } from "./fight";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * "Po każdej zwycięskiej walce Postać zyskuje także 1 punkt Życia (zabierając
 * ten punkt pokonanemu przeciwnikowi)."
 *
 * The parenthesis is bookkeeping and not flavour, which is the only interesting
 * decision here: a duel really does move the point, so losing one to Excalibur
 * costs two.
 */

const fight = (over: {
  outcome?: string;
  opponentSeat?: number;
  raid?: boolean;
  eqMode?: "slots" | "classic";
  slot?: string | null;
  blade?: string;
  theirLife?: number;
  myLife?: number;
} = {}) =>
  aTable({
    game: {
      active_seat: 0,
      eq_mode: over.eqMode ?? "classic",
      turn_state: {
        phase: "fight",
        fight: {
          cardId: "cyklop",
          cardName: "CYKLOP",
          kind: "ordinary",
          enemyTotal: 6,
          playerTotal: 20,
          playerRoll: 6,
          enemyRoll: 1,
          result: { outcome: over.outcome ?? "wygrana" },
          fieldId: "wrzosowiska",
          draw: 1,
          drawn: [{ cardId: "cyklop", cardClass: "foe" }],
          fought: ["cyklop"],
          ...(over.opponentSeat !== undefined ? { opponentSeat: over.opponentSeat } : {}),
          ...(over.raid ? { raid: { cardId: "poszukiwacz-przygod" } } : {}),
        },
      } as unknown as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"),
        field_id: "wrzosowiska", sword_own: 9, life: over.myLife ?? 2,
      }),
      aSeat({
        id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"),
        field_id: "wrzosowiska", life: over.theirLife ?? 4,
      }),
    ],
    holdings: [
      aHolding({
        id: "h1",
        seat_id: "seat-a",
        card_id: over.blade ?? "excalibur",
        kind: "item",
        ...(over.slot !== undefined ? { slot: over.slot } : {}),
      }),
    ],
  });

const settle = async (table: ReturnType<typeof fight>) => {
  const out = await resolveFight(table, undefined as never, ports({ random: scriptedRandom([1, 1, 1, 1]) }));
  return apply(table, out.writes);
};

const lifeOf = (t: ReturnType<typeof apply>, id: string) =>
  t.seats.find((one) => one.id === id)?.life;

describe("Excalibur's point of Życie", () => {
  it("is gained on a win against a Wróg", async () => {
    expect(lifeOf(await settle(fight()), "seat-a")).toBe(3);
  });

  it("is not gained on a loss", async () => {
    const after = await settle(fight({ outcome: "przegrana" }));
    // Two down to one for losing, and nothing added.
    expect(lifeOf(after, "seat-a")).toBe(1);
  });

  /**
   * 4.6, not 4.7: a point won is not healing, so the ceiling of four that
   * `HEAL_CEILING` applies to a Uzdrowiciel does not apply here.
   */
  it("is not capped at four, because it is a gain rather than healing", async () => {
    expect(lifeOf(await settle(fight({ myLife: 4 })), "seat-a")).toBe(5);
  });

  it("does nothing for a blade that does not steal", async () => {
    expect(lifeOf(await settle(fight({ blade: "miecz" })), "seat-a")).toBe(2);
  });

  /**
   * The duel, where the parenthesis is literal: the loser pays one for losing
   * (17.9) and another to Excalibur.
   */
  it("really is taken off a beaten Postać", async () => {
    const after = await settle(fight({ opponentSeat: 1, theirLife: 4 }));
    expect(lifeOf(after, "seat-a")).toBe(3);
    expect(lifeOf(after, "seat-b")).toBe(2);
  });

  /** And it can be the second one's last, which is 4.4's business, not this rule's. */
  it("can be the blow that kills them", async () => {
    const after = await settle(fight({ opponentSeat: 1, theirLife: 2 }));
    expect(lifeOf(after, "seat-b")).toBe(0);
    expect(after.seats.find((one) => one.id === "seat-b")?.eliminated).toBe(true);
  });

  /**
   * Not on a raid. The Poszukiwacz fights on his own account and the Excalibur
   * is in your pack, not in his hand — the reading `missionDone` and
   * `trophiesFrom` already take.
   */
  it("is not won by a friend raiding for you", async () => {
    expect(lifeOf(await settle(fight({ raid: true })), "seat-a")).toBe(2);
  });

  /** Slotowy: an Excalibur in the Plecak wins nothing, as it lends nothing. */
  it("needs the blade to be in hand in slotowy", async () => {
    expect(lifeOf(await settle(fight({ eqMode: "slots", slot: null })), "seat-a")).toBe(2);
    expect(lifeOf(await settle(fight({ eqMode: "slots", slot: "main-hand" })), "seat-a")).toBe(3);
  });
});
