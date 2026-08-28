import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { EVENT_COPIES, decksOf } from "../decks";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { resolveFight } from "./fight";
import { tradeTrophies, TROPHY_RATE } from "./shop";
import { setTrophyMode } from "./lobby";
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

/**
 * The one conversion allowed once the game is running (docs/TROFEA.md).
 *
 * A table may decide mid-game that hoarding is not worth the table space, and
 * nobody loses by it: every held Karta has its Miecz printed on it. The other
 * direction cannot be done at all — the Wrogowie are on the pile by then.
 */
describe("switching to punkty mid-game", () => {
  const playing = (holdings: ReturnType<typeof aHolding>[]) =>
    aTable({
      game: { status: "playing", trophy_mode: "cards" },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, trophy_points: 1 }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
      holdings,
    });

  const trophy = (id: string, seat: string, cardId: string, granted = false) =>
    aHolding({ id, seat_id: seat, card_id: cardId, kind: "trophy", granted });

  it("turns every held Karta into the number printed on it", () => {
    const table = playing([
      trophy("t0", "seat-a", "cyklop"),
      trophy("t1", "seat-a", "nobbin"),
      trophy("t2", "seat-b", "smok"),
    ]);
    const after = apply(table, setTrophyMode(table, { mode: "points" }).writes);

    expect(after.game.trophy_mode).toBe("points");
    expect(after.holdings.filter((h) => h.kind === "trophy")).toEqual([]);
    // Added to what the seat already had, not replacing it.
    expect(after.seats.find((s) => s.id === "seat-a")?.trophy_points).toBe(1 + 6 + 2);
    expect(after.seats.find((s) => s.id === "seat-b")?.trophy_points).toBe(5);
  });

  /** The Karty are nobody's now, so they have to reach the stos zużytych. */
  it("sends the Karty to the used pile", () => {
    const table = playing([trophy("t0", "seat-a", "cyklop")]);
    const after = apply(table, setTrophyMode(table, { mode: "points" }).writes);
    expect(returned(after, "cyklop")).toHaveLength(1);
  });

  /** A conjured Cyklop scores and returns nothing: the deck holds its own copy. */
  it("returns nothing the deck still holds", () => {
    const table = playing([trophy("t0", "seat-a", "cyklop", true)]);
    const after = apply(table, setTrophyMode(table, { mode: "points" }).writes);
    expect(after.seats[0].trophy_points).toBe(1 + 6);
    expect(returned(after, "cyklop")).toEqual([]);
  });

  it("says so per seat, and once for the table", () => {
    const table = playing([trophy("t0", "seat-a", "cyklop")]);
    const said = setTrophyMode(table, { mode: "points" }).writes.journal ?? [];
    expect(said).toContainEqual(
      expect.objectContaining({ seatId: "seat-a", payload: { what: "trophy-mode", points: 6, cards: 1 } }),
    );
    expect(said).toContainEqual(
      expect.objectContaining({ seatId: null, payload: { what: "trophy-mode" } }),
    );
  });

  it("refuses to go back, there being nothing to hand out", () => {
    const table = aTable({ game: { status: "playing", trophy_mode: "points" } });
    expect(() => setTrophyMode(table, { mode: "cards" })).toThrow(/nie ma czego rozdać/);
  });

  /** Nobody holding anything is not an error — it is the ordinary case. */
  it("moves the rule even when nothing is held", () => {
    const table = playing([]);
    const after = apply(table, setTrophyMode(table, { mode: "points" }).writes);
    expect(after.game.trophy_mode).toBe("points");
  });

  it("is free in the poczekalnia, both ways", () => {
    const lobby = aTable({ game: { status: "lobby", trophy_mode: "points" } });
    expect(apply(lobby, setTrophyMode(lobby, { mode: "cards" }).writes).game.trophy_mode).toBe("cards");
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

  /**
   * Asking for an outcome instead of naming Karty.
   *
   * The engine finds the cheapest set (`offersFor`); this is the command
   * spending what it found, and the case that matters is the one where the
   * obvious choice is wrong.
   */
  describe("by how many Miecze you want", () => {
    it("spends the set that wastes nothing, not the biggest cards", () => {
      // 6, 5, 2 — one Miecz is 5+2 exactly. Taking the biggest first would
      // spend 6+5 and burn four for the same sword.
      const table = holding("cyklop", "smok", "nobbin");
      const { writes, result } = tradeTrophies(table, { seatId: "seat-a", swords: 1 });
      expect(result).toBe(1);
      expect(writes.holdings?.delete).toHaveLength(2);
      expect(writes.journal?.[0]).toMatchObject({
        payload: { points: 7, gained: 1, lost: 0 },
      });
    });

    it("spends everything when that is what the count needs", () => {
      // 6, 5, 2, 2 — fifteen, so two Miecze take the lot and burn one.
      const table = holding("cyklop", "smok", "nobbin", "nobbin");
      expect(tradeTrophies(table, { seatId: "seat-a", swords: 1 }).writes.holdings?.delete)
        .toHaveLength(2);
      expect(tradeTrophies(table, { seatId: "seat-a", swords: 2 }).writes.holdings?.delete)
        .toHaveLength(4);
    });

    it("says what the hand can buy rather than only that it cannot", () => {
      const table = holding("cyklop", "smok", "nobbin", "nobbin");
      expect(() => tradeTrophies(table, { seatId: "seat-a", swords: 3 })).toThrow(
        /najwyżej 2/,
      );
    });

    /** A named list is an explicit answer and outranks a computed one. */
    it("prefers the Karty you name over the count", () => {
      const table = holding("cyklop", "smok", "nobbin");
      const { writes } = tradeTrophies(table, {
        seatId: "seat-a",
        swords: 1,
        cardIds: ["cyklop", "smok"],
      });
      expect(writes.holdings?.delete).toHaveLength(2);
      expect(writes.journal?.[0]).toMatchObject({ payload: { points: 11, lost: 4 } });
    });
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
