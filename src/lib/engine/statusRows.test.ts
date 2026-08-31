import { describe, expect, it } from "vitest";
import { allStatuses, fromColumns, type Status, type TimedColumns } from "./status";
import { foldStatuses, lapsesOn, stackingOf, whenSaid } from "./statusRows";
import { projectQueue } from "./turnQueue";

const none: TimedColumns = {
  turnsLost: 0,
  stoneUntilRound: null,
  bridgeBlockedUntilRound: null,
  natureChangedRound: null,
};

/** Four seats, none of them in any trouble, seat 0 playing in round 5. */
function table(over: Partial<Record<number, { turnsLost?: number; stoneUntilRound?: number }>> = {}) {
  return [0, 1, 2, 3].map((index) => ({
    index,
    eliminated: false,
    turnsLost: over[index]?.turnsLost ?? 0,
    stoneUntilRound: over[index]?.stoneUntilRound ?? null,
  }));
}

const buff = (turns: number, over: Partial<Status> = {}): Status => ({
  id: `eliksir-${turns}`,
  source: "eliksir-sily",
  label: "Eliksir Siły",
  modifier: { kind: "points", miecz: 1 },
  ends: { kind: "turns", turns },
  ...over,
});

describe("lapsesOn: a countdown becomes a date only by walking the order", () => {
  it("names the round a countdown runs out in, counting the holder's own turns", () => {
    const queue = projectQueue(table(), 0, 5, 12);
    // Seat 1 plays later in round 5, then again in 6, then 7. A two-turn buff
    // on them survives the first of those and lapses after the second.
    expect(lapsesOn(buff(2), queue, 1)).toEqual({
      round: 6,
      certainty: "prognoza",
      onOwnTurn: true,
    });
  });

  it("counts the active seat's turn in progress as the first of them", () => {
    const queue = projectQueue(table(), 0, 5, 12);
    // "do końca tej tury" — and this one is seat 0's, happening now.
    expect(lapsesOn(buff(1), queue, 0)).toMatchObject({ round: 5, onOwnTurn: true });
  });

  it("does not tick on a turn the holder never takes", () => {
    // Seat 1 owes two turns, so their next three goes fall in rounds 7, 8, 9 —
    // not 5, 6, 7. Adding the countdown to the current round would date this
    // buff two rounds early, and it is exactly the debuffed seats that carry
    // effects worth showing.
    const queue = projectQueue(table({ 1: { turnsLost: 2 } }), 0, 5, 20);
    expect(lapsesOn(buff(1), queue, 1)).toMatchObject({ round: 7 });
    expect(lapsesOn(buff(3), queue, 1)).toMatchObject({ round: 9 });
  });

  it("reads a stored round deadline off the effect, with no forecast in it", () => {
    const [kamien] = fromColumns({ ...none, stoneUntilRound: 8 }, 5);
    expect(lapsesOn(kamien, projectQueue(table(), 0, 5, 12), 0)).toEqual({
      round: 8,
      certainty: "pewne",
      onOwnTurn: false,
    });
  });

  it("ends a lost-turn debt on the first turn that actually happens", () => {
    // The debt's `turns` counts goes taken away, not goes survived. Seat 1 owes
    // two, is passed over in rounds 6 and 7, and is themselves again in 8 —
    // read like an ordinary countdown it would have said 9.
    const queue = projectQueue(table({ 1: { turnsLost: 2 } }), 0, 5, 12);
    const [debt] = fromColumns({ ...none, turnsLost: 2 }, 5);
    expect(lapsesOn(debt, queue, 1)).toEqual({
      round: 7,
      certainty: "prognoza",
      onOwnTurn: false,
    });
  });

  it("says nothing at all about an effect that is not a time", () => {
    const queue = projectQueue(table(), 0, 5, 12);
    for (const ends of [
      { kind: "fight" } as const,
      { kind: "dispelled" } as const,
      { kind: "roll", upTo: 3 } as const,
      { kind: "event", what: "crossing" } as const,
    ]) {
      expect(lapsesOn(buff(1, { ends }), queue, 0)).toBeNull();
    }
  });

  it("says nothing rather than guessing past the end of the forecast", () => {
    const queue = projectQueue(table(), 0, 5, 3);
    expect(lapsesOn(buff(9), queue, 2)).toBeNull();
  });
});

describe("whenSaid", () => {
  const queue = projectQueue(table(), 0, 5, 12);

  it("puts the round on the end of a countdown, and says when inside it", () => {
    const status = buff(2);
    expect(whenSaid(status, lapsesOn(status, queue, 1), true)).toBe(
      "jeszcze 2 tury — mija w rundzie 6, po twojej turze",
    );
    expect(whenSaid(status, lapsesOn(status, queue, 1), false)).toBe(
      "jeszcze 2 tury — mija w rundzie 6, po turze Postaci",
    );
  });

  it("does not say the round twice for a date that already names one", () => {
    const [kamien] = fromColumns({ ...none, stoneUntilRound: 8 }, 5);
    expect(whenSaid(kamien, lapsesOn(kamien, queue, 0), true)).toBe("mija na początku rundy 8");
  });

  it("says a debt in the words a debt needs", () => {
    const debt = fromColumns({ ...none, turnsLost: 2 }, 5)[0];
    const at = projectQueue(table({ 1: { turnsLost: 2 } }), 0, 5, 12);
    // Not "do końca tej tury", which is what the generic countdown words would
    // have made of a single lost turn.
    expect(whenSaid(fromColumns({ ...none, turnsLost: 1 }, 5)[0], null, true)).toBe("jeszcze 1 tura");
    expect(whenSaid(debt, lapsesOn(debt, at, 1), true)).toBe("jeszcze 2 tury — wraca w rundzie 7");
  });

  it("leaves an effect with no date saying only what lifts it", () => {
    const fatum = buff(1, { source: "fatum", label: "Fatum", ends: { kind: "dispelled" } });
    expect(whenSaid(fatum, null, true)).toBe("dopóki ktoś tego nie zdejmie");
  });
});

describe("stackingOf: the four columns answer for themselves", () => {
  it("separates a debt from a sentence though both read as frozen", () => {
    const [debt] = fromColumns({ ...none, turnsLost: 1 }, 5);
    const [kamien] = fromColumns({ ...none, stoneUntilRound: 8 }, 5);
    expect(debt.modifier).toEqual(kamien.modifier);
    expect(stackingOf(debt)).toBe("queues");
    expect(stackingOf(kamien)).toBe("refreshes");
  });

  it("goes by the modifier for everything else", () => {
    expect(stackingOf(buff(1))).toBe("sums");
    expect(stackingOf(buff(1, { modifier: { kind: "frozen" }, source: "krag-plomieni" }))).toBe(
      "exclusive",
    );
    expect(stackingOf(buff(1, { modifier: { kind: "ocalenie" }, source: "ocalony" }))).toBe(
      "queues",
    );
    expect(stackingOf(buff(1, { modifier: { kind: "znowu" }, source: "formula-czasu" }))).toBe(
      "refreshes",
    );
  });
});

describe("foldStatuses", () => {
  const queue = projectQueue(table(), 0, 5, 12);
  const at = { queue, seatIndex: 0, mine: true };

  it("never folds two buffs together, because they expire on different turns", () => {
    const rows = foldStatuses([buff(1), { ...buff(3), id: "eliksir-b" }], at);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.count)).toEqual([1, 1]);
    expect(rows.map((row) => row.lapse?.round)).toEqual([5, 7]);
  });

  it("folds a state that a second copy does nothing to, and counts the copies", () => {
    const held = (id: string, turns: number): Status => ({
      id,
      source: "krag-plomieni",
      label: "Krąg Płomieni",
      modifier: { kind: "frozen" },
      ends: { kind: "turns", turns },
    });
    const [row, ...rest] = foldStatuses([held("a", 1), held("b", 3)], at);
    expect(rest).toEqual([]);
    expect(row.count).toBe(2);
    // The row stops being true when the longer of them does, not the first.
    expect(row.lapse?.round).toBe(7);
  });

  it("lets an effect with no end outlast any date it is folded with", () => {
    const forever: Status = {
      id: "b",
      source: "krag-plomieni",
      label: "Krąg Płomieni",
      modifier: { kind: "frozen" },
      ends: { kind: "dispelled" },
    };
    const timed: Status = { ...forever, id: "a", ends: { kind: "turns", turns: 2 } };
    for (const order of [[timed, forever], [forever, timed]]) {
      const [row] = foldStatuses(order, at);
      expect(row.count).toBe(2);
      expect(row.lapse).toBeNull();
      expect(row.when).toBe("dopóki ktoś tego nie zdejmie");
    }
  });

  it("keeps one card's two different effects apart", () => {
    const source = "poludnica";
    const rows = foldStatuses(
      [
        { id: "a", source, label: "Południca", modifier: { kind: "move-max", fields: 1 }, ends: { kind: "event", what: "crossing" } },
        { id: "b", source, label: "Południca", modifier: { kind: "points", miecz: -1 }, ends: { kind: "event", what: "crossing" } },
      ],
      at,
    );
    expect(rows).toHaveLength(2);
  });

  it("works with no projection at all, and simply has no dates", () => {
    const rows = foldStatuses(allStatuses([buff(2)], { ...none, turnsLost: 1 }, 5));
    expect(rows.map((row) => row.lapse)).toEqual([null, null]);
    expect(rows[0].when).toBe("jeszcze 1 tura");
  });

  it("puts the whole of a seat's trouble into rows a panel can draw", () => {
    // A seat that owes a turn, is standing in Kamień, and is carrying a buff:
    // three rows, three different clocks, one list.
    const stored = [buff(2)];
    const columns = { ...none, turnsLost: 1, stoneUntilRound: 8 };
    const rows = foldStatuses(allStatuses(stored, columns, 5), {
      queue: projectQueue(table({ 0: { turnsLost: 1, stoneUntilRound: 8 } }), 1, 5, 16),
      seatIndex: 0,
      mine: false,
    });
    expect(rows.map((row) => [row.label, row.stacking, row.lapse?.certainty ?? null])).toEqual([
      ["Traci turę", "queues", "prognoza"],
      ["Zamieniony w Kamień", "refreshes", "pewne"],
      ["Eliksir Siły", "sums", "prognoza"],
    ]);
  });
});
