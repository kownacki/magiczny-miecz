import { top } from "@/lib/engine/stack";
import { describe, expect, it } from "vitest";
import { aSeat, aTable } from "../fixture";
import { asFieldId } from "@/lib/engine/board";
import { hasExplored, hasMet, refuseAgainst13_2 } from "./turn";
import { attackSeat } from "./fight";
import { drawCard } from "./draw";
import { endFight, startFight } from "@/lib/engine/turn";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * 13.2 — "Postać musi dokonać wyboru między spotkaniem z inną Postacią
 * znajdującą się na tym samym Obszarze, a badaniem samego Obszaru."
 *
 * One or the other. The app offered both, so a character could attack a rival
 * and then work through the Obszar's own instruction on the same turn — two
 * turns' worth of one square.
 */
const HERE = asFieldId("mokradla-1")!;

const onField = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: HERE,
        from: null,
        draw: 1,
        drawn: [],
        ...over,
      } as TurnPhase,
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: HERE }),
      aSeat({ id: "seat-b", seat_index: 1, field_id: HERE }),
    ],
  });

describe("meeting or exploring, not both (13.2)", () => {
  it("counts a drawn Karta as having explored", () => {
    expect(hasExplored(onField())).toBe(false);
    expect(hasExplored(onField({ drawn: [{ cardId: "mgla", cardClass: "encounter" }] as never }))).toBe(true);
  });

  /** The Obszar's own offer counts too — 13.5 lists both as exploring. */
  it("counts a resolved offer as having explored", () => {
    expect(hasExplored(onField({ resolved: ["karczma"] }))).toBe(true);
  });

  it("refuses an attack on an Obszar already explored", () => {
    const explored = onField({ drawn: [{ cardId: "mgla", cardClass: "encounter" }] as never });
    expect(() => attackSeat(explored, { targetSeatId: "seat-b" })).toThrow(/13\.2/);
  });

  it("allows the attack when nothing has been explored", () => {
    expect(() => attackSeat(onField(), { targetSeatId: "seat-b" })).not.toThrow();
  });

  it("refuses a draw once the turn has been spent meeting", () => {
    const met = onField({ met: true });
    expect(hasMet(met)).toBe(true);
    expect(() => drawCard(met, { shuffle: (cards: readonly string[]) => [...cards] } as never)).toThrow(/13\.2/);
  });

  /**
   * The mark has to survive the duel, because by the time it matters the fight
   * is over and nothing else remembers it happened.
   */
  it("keeps the mark through the fight and back out again", () => {
    const started = startFight(
      top(onField().game.turn_state),
      { cardId: "seat:1", cardName: "Ola", miecz: 2, opponentSeat: 1 },
      { miecz: 9, magia: 1 },
    );
    expect(started.phase).toBe("fight");
    const back = endFight(started);
    expect(back.phase === "field" && back.met).toBe(true);
  });

  /** A fight with a Karta is not a meeting, and must not spend the turn. */
  it("does not mark a fight with a Wróg", () => {
    const started = startFight(
      top(onField().game.turn_state),
      { cardId: "cyklop", cardName: "CYKLOP", miecz: 6 },
      { miecz: 9, magia: 1 },
    );
    const back = endFight(started);
    expect(back.phase === "field" && back.met).toBeFalsy();
  });

  it("says which way round it was asked", () => {
    expect(() => refuseAgainst13_2(onField({ met: true }), "explore")).toThrow(/spotkanie/);
    expect(() =>
      refuseAgainst13_2(onField({ resolved: ["x"] }), "meet"),
    ).toThrow(/zbadany/);
  });
});
