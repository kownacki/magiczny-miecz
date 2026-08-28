import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { EVENT_COPIES, decksOf } from "../decks";
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
  mode?: "points" | "cards";
} = {}) => {
  const cardId = over.cardId ?? "cyklop";
  return aTable({
    game: {
      active_seat: 0,
      trophy_mode: over.mode ?? "cards",
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

/** The refs of one card that have reached the stos zużytych. */
const returned = (t: ReturnType<typeof apply>, cardId: string) => {
  const copies = EVENT_COPIES.get(cardId) ?? [];
  const deck = decksOf(t.game).events;
  return deck.discard.filter((ref) => copies.includes(ref));
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

  /**
   * The „Punkty" variant. Same fights, same arithmetic; what changes is where
   * the answer is kept. See docs/TROFEA.md.
   *
   * Twenty-one hoardable Wrogowie is twenty-one Karty face up in front of
   * somebody, and a referee that can add is the one thing at this table that
   * does not need them lying there to remember what they were worth.
   */
  describe("in punkty mode", () => {
    it("scores the Wróg rather than keeping it", async () => {
      const after = await settle(won({ mode: "points" }));
      expect(trophies(after)).toEqual([]);
      // CYKLOP's printed Miecz, not the fight's totals.
      expect(after.seats[0].trophy_points).toBe(6);
    });

    it("adds a pack up", async () => {
      const pack = await settle(won({ mode: "points", fought: ["cyklop", "nobbin"] }));
      expect(pack.seats[0].trophy_points).toBe(6 + 2);
    });

    /**
     * The Karta itself is not kept anywhere, so it has to reach the stos
     * zużytych — a Wróg that vanished would shrink the deck a card per fight.
     */
    it("puts the Karta back on the used pile", async () => {
      const after = await settle(won({ mode: "points" }));
      // A pile holds refs, not ids — one Wróg has several copies (`decks.ts`).
      expect(returned(after, "cyklop")).toHaveLength(1);
    });

    /** A conjured Cyklop was never dealt, so it must not arrive on the pile. */
    it("returns nothing that the deck still holds", async () => {
      const after = await settle(won({ mode: "points", granted: true }));
      expect(after.seats[0].trophy_points).toBe(6);
      expect(returned(after, "cyklop")).toEqual([]);
    });

    it("scores nothing for a Wróg fought magically, as the Karta rule keeps none", async () => {
      const after = await settle(won({ mode: "points", cardId: "demon" }));
      expect(after.seats[0].trophy_points).toBe(0);
    });
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

  /**
   * "w dowolnym momencie mogą zostać wymienione" — the player picks which.
   *
   * The rule never says all of them at once, and the choice is worth real
   * points: holding 6, 2 and 5 and handing in the first two buys a Miecz for
   * eight, where handing in everything buys the same Miecz for thirteen.
   */
  it("hands in only the Karty that were named", () => {
    const table = holding("cyklop", "nobbin", "smok");
    const out = tradeTrophies(table, { seatId: "seat-a", cardIds: ["cyklop", "nobbin"] });
    const after = apply(table, out.writes);

    expect(out.result).toBe(1);
    expect(after.seats[0].sword_own).toBe(6);
    expect(trophies(after)).toEqual(["smok"]);
  });

  it("refuses a Karta the character is not holding", () => {
    expect(() =>
      tradeTrophies(holding("cyklop"), { seatId: "seat-a", cardIds: ["smok"] }),
    ).toThrow(/nie masz takiego trofeum/);
  });

  /** Two of the same Wróg are two cards, not one asked for twice. */
  it("matches one holding per name", () => {
    const table = holding("nobbin", "nobbin", "cyklop");
    const out = tradeTrophies(table, { seatId: "seat-a", cardIds: ["nobbin", "nobbin", "cyklop"] });
    expect(out.result).toBe(1);
    expect(trophies(apply(table, out.writes))).toEqual([]);
  });

  it("says how many points were actually offered when it refuses", () => {
    expect(() => tradeTrophies(holding("smok"), { seatId: "seat-a" })).toThrow(/masz 5/);
  });

  /** "Punkty ponad wielokrotność 7 są stracone" — naming nothing still means all. */
  it("pays one Miecz per seven and loses the remainder", () => {
    const table = holding("cyklop", "wilkolak");
    const out = tradeTrophies(table, { seatId: "seat-a" });
    const after = apply(table, out.writes);

    expect(out.result).toBe(2);
    expect(after.seats[0].sword_own).toBe(7);
    expect(trophies(after)).toEqual([]);
  });
});
