import { describe, expect, it } from "vitest";
import {
  allStatuses,
  fromColumns,
  markOf,
  afterEvent,
  afterFight,
  afterTurn,
  bonusFrom,
  describeEnd,
  dispel,
  forcedNature,
  frozen,
  movementCap,
  type Status,
} from "./status";

function status(over: Partial<Status> = {}): Status {
  return {
    id: "a",
    source: "eliksir-sily",
    label: "+2 Miecza",
    modifier: { kind: "points", miecz: 2 },
    ends: { kind: "turns", turns: 1 },
    ...over,
  };
}

const ids = (list: Status[]) => list.map((s) => s.id);

describe("what a character is under", () => {
  it("adds points up without touching own points", () => {
    // 1.2-1.5: only own Miecz and Magia are stored, and totals are worked out
    // at read time. A buff that wrote itself into miecz_own would outlive its
    // own expiry, because 1.3 forbids pushing own points back down.
    const under = [
      status({ modifier: { kind: "points", miecz: 2 } }),
      status({ id: "b", modifier: { kind: "points", miecz: 1, magia: 3 } }),
    ];
    expect(bonusFrom(under)).toEqual({ miecz: 3, magia: 3 });
  });

  it("counts nothing when nothing gives points", () => {
    expect(bonusFrom([status({ modifier: { kind: "frozen" } })])).toEqual({
      miecz: 0,
      magia: 0,
    });
  });

  it("takes the tightest movement cap in force", () => {
    // Mgła caps at one Obszar; Południca does too. Two caps do not add up, and
    // the stricter of them is the one being obeyed.
    const under = [
      status({ modifier: { kind: "move-max", pola: 2 } }),
      status({ id: "b", modifier: { kind: "move-max", pola: 1 } }),
    ];
    expect(movementCap(under)).toBe(1);
    expect(movementCap([])).toBeNull();
  });

  it("knows when the holder cannot act at all", () => {
    expect(frozen([status({ modifier: { kind: "frozen" } })])).toBe(true);
    expect(frozen([status()])).toBe(false);
  });

  it("reports a Natura being forced", () => {
    expect(forcedNature([status({ modifier: { kind: "nature", na: "zla" } })])).toBe("zla");
    expect(forcedNature([status()])).toBeNull();
  });
});

describe("what makes an effect stop", () => {
  it("counts down the holder's own turns, not the table's rounds", () => {
    // "Na 1 turę" on a card means one of yours. Measured in rounds it would
    // last longer at a table of six than at a table of two, which no card says.
    const three = [status({ ends: { kind: "turns", turns: 3 } })];
    const two = afterTurn(three);
    expect(two[0].ends).toEqual({ kind: "turns", turns: 2 });
    expect(ids(afterTurn(afterTurn(two)))).toEqual([]);
  });

  it("leaves everything that is not counting turns alone", () => {
    const under = [
      status({ id: "walka", ends: { kind: "fight" } }),
      status({ id: "fatum", ends: { kind: "dispelled" } }),
    ];
    expect(ids(afterTurn(under))).toEqual(["walka", "fatum"]);
  });

  it("ends a one-fight effect however the fight ended", () => {
    // 17.4 ends a fight the moment the dice are compared — win, lose or draw.
    const under = [status({ id: "magia-i-miecz", ends: { kind: "fight" } }), status({ id: "b" })];
    expect(ids(afterFight(under))).toEqual(["b"]);
  });

  it("ends an effect on the event it was waiting for, and no other", () => {
    const under = [
      status({ id: "poludnica", ends: { kind: "event", co: "crossing" } }),
      status({ id: "most", ends: { kind: "event", co: "bridge-entry" } }),
    ];
    expect(ids(afterEvent(under, "crossing"))).toEqual(["most"]);
    expect(ids(afterEvent(under, "death"))).toEqual(["poludnica", "most"]);
  });

  it("dispels only what was waiting to be dispelled", () => {
    // A countdown is not cancelled by being argued with.
    const under = [
      status({ id: "fatum", ends: { kind: "dispelled" } }),
      status({ id: "eliksir", ends: { kind: "turns", turns: 1 } }),
    ];
    expect(ids(dispel(under))).toEqual(["eliksir"]);
  });
});

describe("telling the player how long", () => {
  it("says what it is waiting for, in every case", () => {
    expect(describeEnd({ kind: "turns", turns: 1 })).toBe("do końca tej tury");
    expect(describeEnd({ kind: "turns", turns: 3 })).toContain("3");
    expect(describeEnd({ kind: "fight" })).toBe("do końca walki");
    expect(describeEnd({ kind: "event", co: "crossing" })).toContain("Trzęsawiska");
    expect(describeEnd({ kind: "dispelled" })).toContain("zdejmie");
  });

  it("never leaves a player without an answer", () => {
    // The point of a closed list of endings: every one of them can be said.
    const all = [
      { kind: "turns", turns: 2 },
      { kind: "fight" },
      { kind: "event", co: "bridge-entry" },
      { kind: "event", co: "death" },
      { kind: "dispelled" },
    ] as const;
    for (const ends of all) expect(describeEnd(ends).length).toBeGreaterThan(0);
  });
});

describe("the four ad-hoc columns, read as effects", () => {
  const none = {
    turnsLost: 0,
    stoneUntilTurn: null,
    bridgeBlockedUntilTurn: null,
    natureChangedTurn: null,
  };

  it("says nothing about a seat nothing is true of", () => {
    expect(fromColumns(none, 5)).toEqual([]);
  });

  it("counts a lost turn, and leaves the number to the duration", () => {
    expect(fromColumns({ ...none, turnsLost: 2 }, 5)[0]).toMatchObject({
      label: "Traci turę",
      ends: { kind: "turns", turns: 2 },
    });
  });

  it("measures Kamień from the turn it wears off on (20.1)", () => {
    // The column holds a turn number, not a countdown, so the remaining turns
    // are the difference — and it says nothing once that turn has arrived.
    expect(fromColumns({ ...none, stoneUntilTurn: 8 }, 5)[0].ends).toEqual({
      kind: "turns",
      turns: 3,
    });
    expect(fromColumns({ ...none, stoneUntilTurn: 5 }, 5)).toEqual([]);
  });

  it("shows the Most being barred without calling it a freeze (11.11)", () => {
    // A character barred from the bridge walks normally everywhere else.
    const [barred] = fromColumns({ ...none, bridgeBlockedUntilTurn: 6 }, 5);
    expect(barred.modifier).toEqual({ kind: "barred", place: "most" });
    expect(frozen([barred])).toBe(false);
  });

  it("mentions a Natura changed this turn, and only this turn (7.2)", () => {
    expect(fromColumns({ ...none, natureChangedTurn: 5 }, 5)).toHaveLength(1);
    expect(fromColumns({ ...none, natureChangedTurn: 4 }, 5)).toEqual([]);
  });

  it("puts both halves of the model in one list", () => {
    const stored = [status({ id: "eliksir" })];
    const all = allStatuses(stored, { ...none, turnsLost: 1 }, 5);
    expect(all.map((s) => s.id)).toEqual(["tura-stracona", "eliksir"]);
  });
});

describe("what a player sees on a name", () => {
  it("marks a bonus up and a penalty down", () => {
    expect(markOf(status({ modifier: { kind: "points", miecz: 2 } })).tone).toBe("dobry");
    expect(markOf(status({ modifier: { kind: "points", miecz: -2 } })).tone).toBe("zly");
  });

  it("says the whole thing, and how long, in the hover", () => {
    const mark = markOf(status({ label: "+2 Miecza", ends: { kind: "turns", turns: 1 } }));
    expect(mark.title).toBe("+2 Miecza — do końca tej tury");
  });

  it("has a mark for every modifier there is", () => {
    // A closed union with a mark each: a new kind that forgets one is a
    // compile error, not a blank space on somebody's name.
    const all: Status["modifier"][] = [
      { kind: "points", miecz: 1 },
      { kind: "move-max", pola: 1 },
      { kind: "frozen" },
      { kind: "nature", na: "zla" },
      { kind: "barred", place: "most" },
      { kind: "note" },
    ];
    for (const modifier of all) {
      expect(markOf(status({ modifier })).glyph.length).toBeGreaterThan(0);
    }
  });
});
