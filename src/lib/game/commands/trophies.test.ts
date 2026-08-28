import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFight } from "./fight";
import { tradeTrophies, TROPHY_RATE } from "./shop";
import { asSeatCharacter } from "@/lib/engine/characters";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * Trophies, and the gap between having the machinery and having the rule.
 *
 * `tradeTrophies` has counted sevens since it was written, death has put them
 * back on the pile, the Bagna could take one and the console could list them —
 * and nothing anywhere turned a beaten Wróg into one. The whole of 1.4's
 * economy was unreachable in an ordinary game.
 */

const won = (over: {
  cardId?: string;
  fought?: string[];
  opponentSeat?: number;
  granted?: boolean;
  outcome?: string;
} = {}) => {
  const cardId = over.cardId ?? "cyklop";
  return aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "fight",
        fight: {
          cardId,
          cardName: cardId.toUpperCase(),
          kind: "ordinary",
          enemyTotal: 6,
          playerTotal: 20,
          playerRoll: 6,
          enemyRoll: 1,
          result: { outcome: over.outcome ?? "wygrana" },
          fieldId: "wrzosowiska",
          draw: 1,
          drawn: [{ cardId, cardClass: "foe", ...(over.granted ? { granted: true } : {}) }],
          fought: over.fought ?? [cardId],
          ...(over.opponentSeat !== undefined ? { opponentSeat: over.opponentSeat } : {}),
        },
      } as unknown as TurnPhase,
    },
    seats: [
      aSeat({
        id: "seat-a", seat_index: 0, character_id: asSeatCharacter("awanturnik"),
        field_id: "wrzosowiska", sword_own: 5,
      }),
      aSeat({
        id: "seat-b", seat_index: 1, character_id: asSeatCharacter("elf"),
        field_id: "wrzosowiska",
      }),
    ],
  });
};

const settle = async (table: ReturnType<typeof won>) => {
  const out = await resolveFight(table, undefined as never, ports({ random: scriptedRandom([1, 1, 1, 1]) }));
  return apply(table, out.writes);
};

const trophies = (t: ReturnType<typeof apply>) =>
  t.holdings.filter((h) => h.kind === "trophy").map((h) => h.card_id);

describe("keeping a beaten Wróg (16.2)", () => {
  it("banks the Karta when the fight is won", async () => {
    expect(trophies(await settle(won()))).toEqual(["cyklop"]);
  });

  it("banks nothing when the fight is lost", async () => {
    expect(trophies(await settle(won({ outcome: "przegrana" })))).toEqual([]);
  });

  /** 17.5 settles a pack as one, and each creature is its own trophy. */
  it("banks every creature of a pack", async () => {
    const pack = await settle(won({ cardId: "cyklop", fought: ["cyklop", "nobbin"] }));
    expect(trophies(pack).sort()).toEqual(["cyklop", "nobbin"]);
  });

  /**
   * "Wrogami (mającymi określony parametr Miecza)" — a Demon is fought
   * magically and carries a Magia, so it is beaten and gone. The seven-point
   * arithmetic never has to price a Magia in Miecze.
   */
  it("keeps no Karta for a Wróg fought magically", async () => {
    expect(trophies(await settle(won({ cardId: "demon" })))).toEqual([]);
  });

  /** 17.9 pays the winner of a duel in Życie, Przedmiot or gold — not in cards. */
  it("keeps no Karta from a duel", async () => {
    expect(trophies(await settle(won({ opponentSeat: 1 })))).toEqual([]);
  });

  /**
   * The mark travels onto the holding: a conjured Cyklop must not reach a pile
   * the deck still holds its own copy of.
   */
  it("carries the granted mark onto the trophy", async () => {
    const staged = await settle(won({ granted: true }));
    expect(staged.holdings.find((h) => h.kind === "trophy")?.granted).toBe(true);
  });
});

describe("cashing them in (1.4)", () => {
  const holding = (...foes: string[]) =>
    aTable({
      seats: [aSeat({ id: "seat-a", sword_own: 5 })],
      holdings: foes.map((cardId, at) =>
        aHolding({ id: `t${at}`, seat_id: "seat-a", card_id: cardId, kind: "trophy" }),
      ),
    });

  it("refuses below the rate", () => {
    // A Cyklop is 6, and 1.4 wants seven.
    expect(() => tradeTrophies(holding("cyklop"), { seatId: "seat-a" })).toThrow(
      new RegExp(`${TROPHY_RATE} punktów`),
    );
  });

  /** "Punkty ponad wielokrotność 7 są stracone" — 6 + 10 buys two, not two and a bit. */
  it("pays one Miecz per seven and loses the remainder", () => {
    const table = holding("cyklop", "wilkolak");
    const out = tradeTrophies(table, { seatId: "seat-a" });
    const after = apply(table, out.writes);

    expect(out.result).toBe(2);
    expect(after.seats[0].sword_own).toBe(7);
    expect(trophies(after)).toEqual([]);
  });
});
