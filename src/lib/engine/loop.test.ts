import { describe, expect, it } from "vitest";
import {
  advanceLoop,
  closeLoopFrame,
  loopBeneath,
  openLoop,
  roundFinishes,
  roundOf,
  settleExposedLoop,
  type LoopFrame,
} from "./loop";
import { only, push, top } from "./stack";
import type { Fight, TurnPhase } from "./turn";
import { roundsOf } from "./cards";

const SMOK = "trogglowy-smok";

/** One head: an ordinary Wróg of Miecz 2, which is what the card prints. */
const head: Fight = {
  cardId: SMOK,
  cardName: "TRÓJGŁOWY SMOK",
  kind: "ordinary",
  enemyTotal: 2,
  playerTotal: 5,
  playerRoll: null,
  enemyRoll: null,
  result: null,
  fieldId: "plaskowyz-mgiel",
  draw: 3,
  drawn: [],
};

const loop = (patch: Partial<LoopFrame> = {}): LoopFrame => ({
  phase: "loop",
  seatId: "seat-a",
  of: head,
  times: 3,
  done: 0,
  round: "głowa",
  settles: [SMOK],
  ...patch,
});

const field: TurnPhase = {
  phase: "field",
  fieldId: "plaskowyz-mgiel",
  from: null,
  draw: 3,
  drawn: [],
};

describe("the card says how many fights it is", () => {
  it("the Smok is three, and they are heads", () => {
    expect(roundsOf(SMOK)).toEqual({ times: 3, round: "głowa" });
  });

  it("every other Wróg is one fight and says nothing", () => {
    expect(roundsOf("wilkolak")).toBeNull();
  });
});

describe("a round", () => {
  it("is the head's own fight, named by which one it is", () => {
    const round = roundOf(loop());
    expect(round.phase).toBe("fight");
    expect(round.fight.enemyTotal).toBe(2);
    expect(round.fight.cardName).toBe("TRÓJGŁOWY SMOK (głowa 1 z 3)");
    expect(roundOf(loop({ done: 2 })).fight.cardName).toBe("TRÓJGŁOWY SMOK (głowa 3 z 3)");
  });

  /** 17.4 is one comparison, so a round cannot start holding the last one's. */
  it("opens with no dice and an empty floor", () => {
    const before = loop({
      of: { ...head, playerRoll: 6, enemyRoll: 1, result: { outcome: "wygrana", winner: "a", loser: "b", kind: "ordinary" }, caster: { seat: 1, until: 1 } },
      done: 1,
    });
    const round = roundOf(before).fight;
    expect(round.playerRoll).toBeNull();
    expect(round.enemyRoll).toBeNull();
    expect(round.result).toBeNull();
    expect(round.caster).toBeNull();
  });

  /**
   * What keeps the settle from paying out three times. `trophiesFrom` reads
   * this list, and a head is not a trophy.
   */
  it("settles nothing until the last one, which settles the creature", () => {
    expect(roundOf(loop({ done: 0 })).fight.fought).toEqual([]);
    expect(roundOf(loop({ done: 1 })).fight.fought).toEqual([]);
    expect(roundOf(loop({ done: 2 })).fight.fought).toEqual([SMOK]);
  });
});

describe("opening a loop", () => {
  it("puts the count under the first round, never on screen by itself", () => {
    const state = openLoop(only(field), loop());
    expect(state.stack.map((frame) => frame.phase)).toEqual(["field", "loop", "fight"]);
    expect(top(state).phase).toBe("fight");
  });

  it("a round knows which loop it belongs to", () => {
    const state = openLoop(only(field), loop());
    expect(loopBeneath(state)?.phase).toBe("loop");
    expect(loopBeneath(push(only(field), roundOf(loop())))).toBeNull();
  });
});

describe("what a settled round does to the count", () => {
  it("a win cuts a head and the next one steps up", () => {
    expect(advanceLoop(loop(), "wygrana")).toEqual({ go: "again", loop: loop({ done: 1 }) });
  });

  it("the third head is the creature", () => {
    expect(advanceLoop(loop({ done: 2 }), "wygrana")).toEqual({ go: "won" });
  });

  /** "Jeśli przegra, głowy, które odcięła odrastają." */
  it("a loss regrows everything cut", () => {
    expect(advanceLoop(loop({ done: 2 }), "przegrana")).toEqual({ go: "over", regrown: 2 });
  });

  /**
   * 17.10 costs nothing and 17.4 still ends the fight, so the attempt is over
   * with nothing to show for it — see the frame's own note on why the cut
   * heads cannot be kept for a later turn.
   */
  it("a draw ends the attempt the same way", () => {
    expect(advanceLoop(loop({ done: 1 }), "remis")).toEqual({ go: "over", regrown: 1 });
  });

  it("only the winning last round is the kill", () => {
    expect(roundFinishes(loop({ done: 2 }), "wygrana")).toBe(true);
    expect(roundFinishes(loop({ done: 1 }), "wygrana")).toBe(false);
    expect(roundFinishes(loop({ done: 2 }), "przegrana")).toBe(false);
  });
});

describe("closing a loop", () => {
  it("tells the field the creature was fought this turn (17.4)", () => {
    const state = closeLoopFrame(push(only(field), loop()), loop());
    expect(state.stack).toHaveLength(1);
    const back = top(state);
    expect(back.phase === "field" && back.fought).toEqual([SMOK]);
  });

  it("keeps what the field had already settled", () => {
    const busy: TurnPhase = { ...field, fought: ["wilk"] } as TurnPhase;
    const state = closeLoopFrame(push(only(busy), loop()), loop());
    const back = top(state);
    expect(back.phase === "field" && back.fought).toEqual(["wilk", SMOK]);
  });

  /** Over a card mid-sentence there is no field to tell; the script's business. */
  it("over anything but a field it is only a pop", () => {
    const script: TurnPhase = {
      phase: "script",
      seatId: "seat-a",
      cardId: SMOK,
      reason: "SMOK",
      effect: { op: "nic" },
      cursor: [],
    };
    const state = closeLoopFrame(push(only(script), loop()), loop());
    expect(state.stack.map((f) => f.phase)).toEqual(["script"]);
  });

  /**
   * The invariant: a loop is never left on screen. An escape (19.1) or the
   * test hatch pops the round and exposes it, and it closes on the spot.
   */
  it("an exposed loop settles itself", () => {
    const exposed = push(only(field), loop({ done: 2 }));
    const back = top(settleExposedLoop(exposed));
    expect(back.phase === "field" && back.fought).toEqual([SMOK]);
  });

  it("leaves any other top alone", () => {
    const state = push(only(field), roundOf(loop()));
    expect(settleExposedLoop(state)).toBe(state);
  });
});
