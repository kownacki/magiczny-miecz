import { describe, expect, it } from "vitest";
import { aHolding, aSeat, aTable, NOW, ports } from "../fixture";
import { FLOOR_MS, claimFloor, floorOf, releaseFloor } from "./spellFloor";
import type { Fight, TurnPhase } from "@/lib/engine/turn";

const fighting = (over: Partial<Fight> = {}): TurnPhase => ({
  phase: "fight",
  fight: {
    cardId: "goblin",
    cardName: "GOBLIN",
    kind: "zwykla",
    enemyTotal: 3,
    playerTotal: 4,
    playerRoll: null,
    enemyRoll: null,
    result: null,
    fieldId: "step-1",
    draw: 0,
    drawn: [],
    ...over,
  } as Fight,
});

/** A Zaklęcie that can be spoken before the dice. */
const spell = aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" });

const table = (over: Partial<Fight> = {}, holdings = [spell]) =>
  aTable({
    game: { active_seat: 0, turn_state: fighting(over) },
    seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
    holdings,
  });

describe("claiming the floor (17.3)", () => {
  it("takes it for thirty seconds", () => {
    const { writes } = claimFloor(table(), { seatId: "seat-a" }, ports());
    const state = writes.game?.turn_state as Extract<TurnPhase, { phase: "fight" }>;
    expect(state.fight.caster).toEqual({ seat: 0, until: NOW + FLOOR_MS });
  });

  it("refuses when somebody else is holding it", () => {
    const taken = table({ caster: { seat: 1, until: NOW + 1000 } });
    expect(() => claimFloor(taken, { seatId: "seat-a" }, ports())).toThrow(/poczekaj/);
  });

  /**
   * A claim lapses rather than sticking.
   *
   * Only testable at all because the clock is a port: the moment is handed in
   * rather than read, so "thirty-one seconds later" is a value and not a wait.
   */
  it("lets the next person in once the last claim has lapsed", () => {
    const stale = table({ caster: { seat: 1, until: NOW - 1 } });
    expect(() => claimFloor(stale, { seatId: "seat-a" }, ports())).not.toThrow();
  });

  it("is the same seat's to renew", () => {
    const mine = table({ caster: { seat: 0, until: NOW + 1000 } });
    expect(() => claimFloor(mine, { seatId: "seat-a" }, ports())).not.toThrow();
  });

  /** 17.4 ends the fight at the dice, so there is nothing left to react to. */
  it("refuses once the fight is settled", () => {
    const done = table({ result: { outcome: "wygrana", winner: "Postać", loser: "Wróg", kind: "zwykla" } });
    expect(() => claimFloor(done, { seatId: "seat-a" }, ports())).toThrow(/rozstrzygnięta/);
  });

  it("refuses a hand with nothing speakable in it", () => {
    const empty = table({}, []);
    expect(() => claimFloor(empty, { seatId: "seat-a" }, ports())).toThrow(/Nie masz Zaklęcia/);
  });

  it("refuses a dead Postać (4.4)", () => {
    const dead = aTable({
      game: { active_seat: 0, turn_state: fighting() },
      seats: [aSeat({ id: "seat-a", seat_index: 0, eliminated: true })],
      holdings: [spell],
    });
    expect(() => claimFloor(dead, { seatId: "seat-a" }, ports())).toThrow(/Zmarła/);
  });

  it("refuses when there is no fight", () => {
    expect(() => claimFloor(aTable(), { seatId: "seat-a" }, ports())).toThrow(/Nie ma walki/);
  });
});

describe("giving it up", () => {
  it("clears the claim", () => {
    const mine = table({ caster: { seat: 0, until: NOW + 1000 } });
    const { writes } = releaseFloor(mine, { seatId: "seat-a" }, ports());
    const state = writes.game?.turn_state as Extract<TurnPhase, { phase: "fight" }>;
    expect(state.fight.caster).toBeNull();
  });

  it("is not somebody else's to drop", () => {
    const theirs = table({ caster: { seat: 1, until: NOW + 1000 } });
    expect(releaseFloor(theirs, { seatId: "seat-a" }, ports()).writes).toEqual({});
  });

  it("does nothing quietly when there is no fight", () => {
    expect(releaseFloor(aTable(), { seatId: "seat-a" }, ports()).writes).toEqual({});
  });
});

describe("floorOf", () => {
  it("is nobody when the claim has run out", () => {
    expect(floorOf({ caster: { seat: 1, until: NOW } }, NOW)).toBeNull();
    expect(floorOf({ caster: { seat: 1, until: NOW + 1 } }, NOW)).toEqual({ seat: 1, until: NOW + 1 });
  });

  it("is nobody when nobody ever claimed it", () => {
    expect(floorOf({}, NOW)).toBeNull();
    expect(floorOf({ caster: null }, NOW)).toBeNull();
  });
});
