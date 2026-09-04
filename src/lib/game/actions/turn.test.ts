import { describe, expect, it } from "vitest";
import { TURN, decisionsFrom } from "./turn";
import { TURN_ACTIONS } from "../requests";
import type { ActionContext } from "./shape";

/**
 * What each action reads off the body — the one place a body is read.
 *
 * `run` is the store's and tested where the commands are; what is pinned here
 * is the coercion, which used to be a `switch` nothing could reach.
 */

const ctx = (over: Partial<ActionContext> = {}): ActionContext =>
  ({ game: { id: "g1" }, user: { id: "u1" }, seat: { id: "s1" }, tableScreen: false, ...over }) as ActionContext;

describe("the turn's vocabulary", () => {
  it("has an entry for every action the client may name, and no other", () => {
    expect(Object.keys(TURN).sort()).toEqual([...TURN_ACTIONS].sort());
  });
});

describe("what is read off the body", () => {
  it("fights one Wróg or several at once (17.5)", () => {
    expect(TURN.fight.from({ cardId: "wilk" }, ctx())).toEqual(["wilk"]);
    expect(TURN.fight.from({ cardIds: ["wilk", "cyklop"] }, ctx())).toEqual(["wilk", "cyklop"]);
  });

  it("draws one named Karta at a physical table, and the whole deal in simulation", () => {
    expect(TURN.draw.from({}, ctx())).toBeNull();
    expect(TURN.draw.from({ cardId: "wilk", cardClass: "foe" }, ctx())).toEqual({ cardId: "wilk", cardClass: "foe" });
  });

  it("lets the shared screen flee as whoever is fleeing, and a player only as themselves", () => {
    expect(TURN.escape.from({ succeeded: true }, ctx())).toEqual({ succeeded: true, seatId: "s1" });
    expect(TURN.escape.from({}, ctx({ tableScreen: true }))).toEqual({ succeeded: null, seatId: null });
  });

  it("tells an ask's answer from a suspended Karta's by what the body names", () => {
    expect(TURN.answer.from({ choice: 1 }, ctx())).toEqual({ ask: true, choice: 1, seatId: "s1" });
    expect(TURN.answer.from({ choices: [0, 2] }, ctx())).toEqual({ ask: false, decided: { choices: [0, 2] } });
  });

  it("reads only numbers and a field id as decisions, never an effect", () => {
    expect(decisionsFrom({ choices: [1, -1, "x" as never, 2.5], destination: "karczma" })).toEqual({
      choices: [1],
      destination: "karczma",
    });
    expect(decisionsFrom({ destination: "nie-ma-takiego" })).toEqual({});
  });

  it("takes the Życie when the spoils are not one of the other two (17.9)", () => {
    expect(TURN["fight-done"].from({ spoils: "zloto" }, ctx())).toEqual({ take: "zloto" });
    expect(TURN["fight-done"].from({ spoils: "przedmiot", spoilsHoldingId: "h1" }, ctx())).toEqual({
      take: "przedmiot",
      holdingId: "h1",
    });
    expect(TURN["fight-done"].from({ spoils: "cokolwiek" }, ctx())).toBeUndefined();
  });

  it("reads a crossing's outcome as one of the three, defaulting to success", () => {
    expect(TURN.cross.from({ outcome: "nieudana", dice: [3, 4] }, ctx())).toEqual({ outcome: "nieudana", dice: [3, 4] });
    expect(TURN.cross.from({ outcome: "hm" }, ctx())).toEqual({ outcome: "udana", dice: null });
    expect(TURN.bridge.from({ outcome: "porazka" }, ctx())).toBe("porazka");
    expect(TURN.bridge.from({}, ctx())).toBe("wygrana");
  });

  it("takes a die the table reports, and null where the app is to throw it", () => {
    expect(TURN.roll.from({ value: 4 }, ctx())).toBe(4);
    expect(TURN.roll.from({}, ctx())).toBeNull();
    expect(TURN["fight-roll"].from({ side: "enemy", value: null }, ctx())).toEqual({ side: "enemy", value: null });
    expect(TURN["fight-roll"].from({ side: "x" as never }, ctx())).toEqual({ side: "player", value: null });
  });
});
