import { describe, expect, it } from "vitest";
import { projectQueue, turnsUntil, type QueueEntry } from "./turnQueue";
import { nextSeat, type TurnOrderSeat } from "./turn";

function seat(index: number, over: Partial<TurnOrderSeat> = {}): TurnOrderSeat {
  return { index, eliminated: false, turnsLost: 0, stoneUntilTurn: null, ...over };
}

/** Just the seats that actually get to act, in order. */
const acting = (queue: QueueEntry[]) =>
  queue.filter((entry) => entry.status !== "skipped").map((entry) => entry.seatIndex);

const skips = (queue: QueueEntry[]) => queue.filter((entry) => entry.status === "skipped");

describe("projectQueue", () => {
  it("walks the table clockwise and wraps", () => {
    const queue = projectQueue([seat(0), seat(1), seat(2)], 0, 1, 5);
    expect(acting(queue)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(skips(queue)).toHaveLength(0);
  });

  it("counts depth in turns taken, not entries", () => {
    // Two seats sitting out must not eat into the ten turns being forecast.
    const seats = [seat(0), seat(1, { turnsLost: 1 }), seat(2, { turnsLost: 1 })];
    const queue = projectQueue(seats, 0, 1, 4);
    expect(queue.filter((entry) => entry.status === "upcoming")).toHaveLength(4);
  });

  it("advances the turn counter only when play comes back round", () => {
    const queue = projectQueue([seat(0), seat(1), seat(2)], 0, 7, 3);
    expect(queue.map((entry) => entry.turn)).toEqual([7, 7, 7, 8]);
  });

  it("spends one lost turn per trip round the table", () => {
    const queue = projectQueue([seat(0), seat(1, { turnsLost: 2 }), seat(2)], 0, 1, 6);
    // Seat 1 sits out twice, then rejoins — "tracisz 2 tury" costs exactly two
    // trips, not two consecutive entries.
    expect(acting(queue)).toEqual([0, 2, 0, 2, 0, 1, 2]);
    expect(skips(queue).map((entry) => entry.seatIndex)).toEqual([1, 1]);
    expect(skips(queue).map((entry) => entry.remaining)).toEqual([2, 1]);
  });

  it("puts a skipped slot in the round it would have been played", () => {
    // Two seats, the active one owed a turn. Seat 0 plays Tura 1, and the turn
    // it loses is its slot in Tura 2 — not a second entry back in Tura 1
    // alongside the one it is playing right now.
    const queue = projectQueue([seat(0, { turnsLost: 1 }), seat(1)], 0, 1, 3);
    expect(queue).toEqual([
      { seatIndex: 0, turn: 1, status: "active" },
      { seatIndex: 1, turn: 1, status: "upcoming" },
      { seatIndex: 0, turn: 2, status: "skipped", reason: "lost", remaining: 1 },
      { seatIndex: 1, turn: 2, status: "upcoming" },
      { seatIndex: 0, turn: 3, status: "upcoming" },
    ]);
  });

  it("keeps a skip in the current round when no wrap happened", () => {
    // Seat 2 is passed over on the way from seat 0 to seat 1... but seat 2 is
    // above seat 0, so no wrap occurred and the slot is still this round.
    const queue = projectQueue([seat(0), seat(1, { turnsLost: 1 }), seat(2)], 0, 4, 1);
    const skip = queue.find((entry) => entry.status === "skipped");
    expect(skip).toEqual({
      seatIndex: 1,
      turn: 4,
      status: "skipped",
      reason: "lost",
      remaining: 1,
    });
  });

  it("reports the reason and how long is left", () => {
    const queue = projectQueue([seat(0), seat(1, { stoneUntilTurn: 4 })], 0, 1, 4);
    const frozen = skips(queue);
    expect(frozen[0].reason).toBe("stone");
    // Counts down as the clock runs, so the bar can say how much longer.
    expect(frozen.map((entry) => entry.remaining)).toEqual([3, 2, 1]);
    // Seat 1 sits out turns 1-3 and rejoins on 4, when stoneUntilTurn stops
    // being greater than the counter (20.1). Seat 0 takes every turn until then,
    // which is why four turns of lookahead are needed to see the thaw at all.
    expect(acting(queue)).toEqual([0, 0, 0, 0, 1]);
  });

  it("calls a seat that is both frozen and owed a turn frozen", () => {
    // nextSeat tests stone first, so the label has to agree with it.
    const queue = projectQueue([seat(0), seat(1, { stoneUntilTurn: 9, turnsLost: 1 })], 0, 1, 2);
    expect(skips(queue)[0].reason).toBe("stone");
  });

  it("leaves eliminated seats out entirely", () => {
    const queue = projectQueue([seat(0), seat(1, { eliminated: true }), seat(2)], 0, 1, 4);
    expect(acting(queue)).toEqual([0, 2, 0, 2, 0]);
    expect(skips(queue)).toHaveLength(0);
  });

  it("stops when nobody can act", () => {
    // Everyone frozen: finishTurn parks active_seat at null, so the forecast
    // must not invent turns past that point.
    const seats = [seat(0, { stoneUntilTurn: 99 }), seat(1, { stoneUntilTurn: 99 })];
    const queue = projectQueue(seats, 0, 1, 5);
    expect(queue.filter((entry) => entry.status === "upcoming")).toHaveLength(0);
    expect(skips(queue).length).toBeGreaterThan(0);
  });

  it("returns nothing when there are no seats", () => {
    expect(projectQueue([], null, 1, 5)).toEqual([]);
  });

  it("marks exactly one entry active, and it is the current seat", () => {
    const queue = projectQueue([seat(0), seat(1)], 1, 3, 4);
    const active = queue.filter((entry) => entry.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].seatIndex).toBe(1);
  });
});

describe("projectQueue agrees with nextSeat", () => {
  // The forecast must never contradict what finishTurn will actually do; a bar
  // that is confidently wrong is worse than no bar.
  const cases: Array<{ name: string; seats: TurnOrderSeat[]; from: number; turn: number }> = [
    { name: "clean table", seats: [seat(0), seat(1), seat(2)], from: 0, turn: 1 },
    {
      name: "one sitting out",
      seats: [seat(0), seat(1, { turnsLost: 1 }), seat(2)],
      from: 0,
      turn: 1,
    },
    {
      name: "one frozen",
      seats: [seat(0), seat(1, { stoneUntilTurn: 5 }), seat(2)],
      from: 2,
      turn: 3,
    },
    {
      name: "everyone owed a turn",
      seats: [seat(0), seat(1, { turnsLost: 1 }), seat(2, { turnsLost: 1 })],
      from: 0,
      turn: 4,
    },
  ];

  for (const { name, seats, from, turn } of cases) {
    it(`first forecast turn matches nextSeat — ${name}`, () => {
      const queue = projectQueue(seats, from, turn, 1);
      const first = queue.find((entry) => entry.status === "upcoming");
      expect(first?.seatIndex).toBe(nextSeat(seats, from, turn).seat);
    });

    it(`reports the same skips as nextSeat — ${name}`, () => {
      const queue = projectQueue(seats, from, turn, 1);
      const upTo = queue.findIndex((entry) => entry.status === "upcoming");
      const forecast = queue
        .slice(0, upTo === -1 ? undefined : upTo)
        .filter((entry) => entry.status === "skipped")
        .map((entry) => entry.seatIndex);
      expect(forecast).toEqual(nextSeat(seats, from, turn).skipped);
    });
  }

  it("does not mutate the seats it was given", () => {
    const seats = [seat(0), seat(1, { turnsLost: 3 })];
    projectQueue(seats, 0, 1, 8);
    expect(seats[1].turnsLost).toBe(3);
  });
});

describe("turnsUntil", () => {
  it("counts how many turns a player is waiting", () => {
    const queue = projectQueue([seat(0), seat(1), seat(2)], 0, 1, 5);
    expect(turnsUntil(queue, 1)).toBe(0);
    expect(turnsUntil(queue, 2)).toBe(1);
  });

  it("looks past seats that are sitting out", () => {
    const queue = projectQueue([seat(0), seat(1, { turnsLost: 1 }), seat(2)], 0, 1, 5);
    expect(turnsUntil(queue, 2)).toBe(0);
  });

  it("is null for a seat that never comes up in the window", () => {
    const queue = projectQueue([seat(0), seat(1, { eliminated: true })], 0, 1, 3);
    expect(turnsUntil(queue, 1)).toBeNull();
  });
});
