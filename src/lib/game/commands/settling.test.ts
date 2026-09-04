import { describe, expect, it } from "vitest";
import type { TurnPhase } from "@/lib/engine/turn";
import { top, type TurnState } from "@/lib/engine/stack";
import { aSeat, aTable } from "../fixture";
import { endGame, settleFight } from "./settling";

/** A fight in progress, unsettled — the state `settle` is asked to close. */
const fighting = (rolls: { playerRoll: number | null; enemyRoll: number | null } = {
  playerRoll: null,
  enemyRoll: null,
}) =>
  aTable({
    game: {
      active_seat: 0,
      turn_state: {
        phase: "fight",
        fight: {
          cardId: "seat:1",
          cardName: "Wilkołak",
          kind: "ordinary",
          enemyTotal: 8,
          playerTotal: 9,
          playerRoll: rolls.playerRoll,
          enemyRoll: rolls.enemyRoll,
          result: null,
          fieldId: "mroczna-polana",
          draw: 0,
          drawn: [],
          fought: [],
        },
      } as unknown as TurnPhase,
    },
    seats: [aSeat({ id: "seat-a", seat_index: 0 })],
  });

const table = (over: Parameters<typeof aSeat>[0] = {}) =>
  aTable({ game: { active_seat: 0 }, seats: [aSeat({ seat_index: 0, ...over })] });

describe("settle (17.4, for the test console)", () => {
  it("writes a win without rolling for it", () => {
    const { writes, result } = settleFight(fighting(), { outcome: "wygrana" });
    expect(result).toBe("Wilkołak");
    const state = top(writes.game?.turn_state as TurnState);
    if (state.phase !== "fight") throw new Error("expected a fight");
    expect(state.fight.result).toEqual({
      outcome: "wygrana",
      kind: "ordinary",
      winner: "Postać",
      loser: "Wilkołak",
    });
    // Everything downstream reads a settled fight as one that was rolled.
    expect(state.fight.playerRoll).toBe(0);
    expect(state.fight.enemyRoll).toBe(0);
  });

  it("writes a loss the other way round", () => {
    const { writes } = settleFight(fighting(), { outcome: "przegrana" });
    const state = top(writes.game?.turn_state as TurnState);
    if (state.phase !== "fight") throw new Error("expected a fight");
    expect(state.fight.result).toEqual({
      outcome: "przegrana",
      kind: "ordinary",
      winner: "Wilkołak",
      loser: "Postać",
    });
  });

  it("writes a draw with no winner or loser named", () => {
    const { writes } = settleFight(fighting(), { outcome: "remis" });
    const state = top(writes.game?.turn_state as TurnState);
    if (state.phase !== "fight") throw new Error("expected a fight");
    expect(state.fight.result).toEqual({ outcome: "remis", kind: "ordinary" });
  });

  it("keeps dice already rolled rather than overwriting them", () => {
    const { writes } = settleFight(fighting({ playerRoll: 6, enemyRoll: 1 }), {
      outcome: "wygrana",
    });
    const settled = top(writes.game?.turn_state as TurnState);
    if (settled.phase !== "fight") throw new Error("expected a fight");
    expect(settled.fight.playerRoll).toBe(6);
    expect(settled.fight.enemyRoll).toBe(1);
  });

  it("refuses when there is no fight to settle", () => {
    expect(() => settleFight(table(), { outcome: "wygrana" })).toThrow(/No fight/);
  });
});

describe("endgame (14.7, 22, for the test console)", () => {
  it("wins the game outright against the Bestia", () => {
    const { writes } = endGame(table(), { seatId: "seat-a", won: true });
    expect(writes.game).toMatchObject({ status: "finished" });
    const state = top(writes.game?.turn_state as TurnState);
    expect(state).toEqual({ phase: "end" });
    expect(writes.journal).toEqual([
      expect.objectContaining({
        kind: "victory",
        payload: { kind: "ordinary", beastTotal: 0 },
      }),
    ]);
  });

  it("loses two Życia, not one, and neither ends the game nor closes the fight", () => {
    const { writes } = endGame(table({ life: 4 }), { seatId: "seat-a", won: false });
    expect(writes.game).toBeUndefined();
    expect(writes.journal?.map((line) => line.kind)).toEqual(["beast-loss", "override"]);
    expect(writes.journal?.[0]).toMatchObject({ payload: { kind: "ordinary", beastTotal: 0 } });
    expect(writes.journal?.[1]).toMatchObject({
      kind: "override",
      manual: true,
      payload: { stat: "life", delta: -2, from: 4, to: 2 },
    });
    // Both entries land on the same seat as one changeset — the two writes
    // the console verb used to make as separate `change()` calls are one now.
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { life: 2 } }]);
  });

  it("kills a character who cannot afford the two, same as losing to the Bestia for real", () => {
    const { writes } = endGame(table({ life: 2 }), { seatId: "seat-a", won: false });
    const kinds = writes.journal?.map((line) => line.kind);
    expect(kinds?.slice(0, 2)).toEqual(["beast-loss", "override"]);
    expect(kinds).toContain("death");
    expect(writes.seats).toContainEqual({
      id: "seat-a",
      patch: { eliminated: true, trophy_points: 0, trophy_beaten: [] },
    });
  });
});
