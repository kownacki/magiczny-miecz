import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { beginFight, castSpell, fightRoll } from "./fight";
import { takeCard } from "./holdings";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * Four abilities that were written into the registry, rendered in the hover
 * text, and read by nothing at all — so the cards carrying them did whatever
 * the app would have done without them, silently.
 */

const held = (cards: string[]) =>
  cards.map((cardId, at) =>
    aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
  );

const inFight = (kind: "ordinary" | "magical", cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "fight",
        fight: {
          cardId: "cyklop",
          cardName: "CYKLOP",
          kind,
          enemyTotal: 6,
          playerTotal: 3,
          playerRoll: null,
          enemyRoll: null,
          result: null,
          fieldId: "mroczna-polana",
          draw: 1,
          drawn: [],
          fought: [],
        },
      } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a" })],
    holdings: held(cards),
  });

const facing = (foe: string, cards: string[] = []) =>
  aTable({
    game: {
      turn_state: {
        phase: "field",
        fieldId: "mroczna-polana",
        from: null,
        draw: 1,
        drawn: [{ cardId: foe, cardClass: "foe" }],
      } as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", sword_own: 5, magic_own: 3, nature: "good" })],
    holdings: held(cards),
  });

const rolled = async (table: ReturnType<typeof inFight>, side: "player" | "enemy" = "player") => {
  const out = await fightRoll(table, { side }, ports({ random: scriptedRandom([3]) }));
  return (out.writes.journal?.[0] as unknown as { payload: { roll: number } }).payload.roll;
};

const totalIn = (writes: { game?: { turn_state?: unknown } }) =>
  (writes.game?.turn_state as { fight: { playerTotal: number } }).fight.playerTotal;

describe("the Talizmany, which shift the die and not the total", () => {
  /** "pozwala dodać 1 do wyniku rzutu kostką podczas walki (lecz nie magicznej)" */
  it("adds one to an ordinary fight's roll", async () => {
    expect(await rolled(inFight("ordinary"))).toBe(3);
    expect(await rolled(inFight("ordinary", ["talizman-ognia"]))).toBe(4);
  });

  it("keeps the Ognia out of a magical fight, where its own text excludes it", async () => {
    expect(await rolled(inFight("magical", ["talizman-ognia"]))).toBe(3);
    expect(await rolled(inFight("magical", ["talizman-powietrza"]))).toBe(4);
  });

  /** The Wróg is not carrying anybody's Talizman. */
  it("does nothing for the other side of the fight", async () => {
    expect(await rolled(inFight("ordinary", ["talizman-ognia"]), "enemy")).toBe(3);
  });
});

describe("a bonus that changes against a named Wróg", () => {
  /**
   * "dodaje właścicielowi 1 punkt Miecza, a w walce z Wilkołakiem - 2 punkty
   * Miecza" — the second figure replaces the first. Two, not three.
   */
  it("replaces the standing bonus rather than stacking on it", () => {
    expect(totalIn(beginFight(facing("cyklop"), { cardIds: ["cyklop"] }).writes)).toBe(5);
    expect(totalIn(beginFight(facing("cyklop", ["arondight"]), { cardIds: ["cyklop"] }).writes)).toBe(6);
    expect(
      totalIn(beginFight(facing("wilkolak", ["arondight"]), { cardIds: ["wilkolak"] }).writes),
    ).toBe(7);
  });

  it("does the same for the Topór, which prints the same clause", () => {
    expect(
      totalIn(
        beginFight(facing("wilkolak", ["topor-swiatla-i-ciemnosci"]), { cardIds: ["wilkolak"] })
          .writes,
      ),
    ).toBe(7);
  });
});

describe("the Relikwiarz, which beats Demons without fighting them", () => {
  it("takes the Demon as a trophy and opens no fight", () => {
    const table = facing("demon", ["relikwiarz"]);
    const out = beginFight(table, { cardIds: ["demon"] });
    const after = apply(table, out.writes);

    expect((out.writes.game?.turn_state as { phase?: string } | undefined)?.phase).not.toBe("fight");
    expect(after.holdings.some((h) => h.kind === "trophy" && h.card_id === "demon")).toBe(true);
  });

  it("reaches the Książę Demonów too, and stops at anything else", () => {
    const ksiaze = beginFight(facing("ksiaze-demonow", ["relikwiarz"]), {
      cardIds: ["ksiaze-demonow"],
    });
    expect((ksiaze.writes.game?.turn_state as { phase?: string } | undefined)?.phase).not.toBe("fight");

    const cyklop = beginFight(facing("cyklop", ["relikwiarz"]), { cardIds: ["cyklop"] });
    expect((cyklop.writes.game?.turn_state as { phase?: string }).phase).toBe("fight");
  });
});

describe("the Magiczny Miecz, which cannot be had in the Dolny Krąg", () => {
  const standingOn = (field: string) =>
    aTable({ seats: [aSeat({ id: "seat-a", field_id: field as never })] });

  it("refuses the card there", () => {
    // Karczma is a Dolny Krąg Obszar.
    expect(() =>
      takeCard(standingOn("karczma"), { seatId: "seat-a", cardId: "magiczny-miecz" }),
    ).toThrow(/Dolnego Kręgu/);
  });

  it("allows it anywhere else", () => {
    expect(() =>
      takeCard(standingOn("mroczna-polana"), { seatId: "seat-a", cardId: "magiczny-miecz" }),
    ).not.toThrow();
  });
});

describe("the Kryształ Magów, whose owner gives up magic", () => {
  it("refuses to speak a Zaklęcie", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a" })],
      holdings: [
        aHolding({ id: "h0", seat_id: "seat-a", card_id: "krysztal-magow", kind: "item" }),
        aHolding({ id: "h1", seat_id: "seat-a", card_id: "wladca-gromu", kind: "spell" }),
      ],
    });
    expect(() => castSpell(table, { seatId: "seat-a", holdingId: "h1" }, ports())).toThrow(
      /Kryształu Magów/,
    );
  });
});
