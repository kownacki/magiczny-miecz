import { describe, expect, it } from "vitest";
import { aHolding, aSeat, aTable } from "../fixture";
import { STONE_TURNS, turnToStone } from "./stone";

const table = (holdings = [] as ReturnType<typeof aHolding>[], zloto = 0) =>
  aTable({
    game: { turn: 5 },
    seats: [aSeat({ id: "seat-a", zloto })],
    holdings,
  });

describe("Zamieniony w Kamień (20.1-20.5)", () => {
  it("lasts three turns, counted as turn numbers so a skip cannot drift it", () => {
    const writes = turnToStone(table(), { seatId: "seat-a" });
    expect(writes.seats?.[0].patch).toMatchObject({ stone_until_turn: 5 + STONE_TURNS });
  });

  /** 20.2: stone carries nothing. */
  it("leaves the Przedmioty lying on the Obszar for whoever passes (12.1)", () => {
    const writes = turnToStone(
      table([aHolding({ id: "h1", card_id: "helm", kind: "item" })]),
      { seatId: "seat-a" },
    );
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "helm" },
    ]);
    expect(writes.holdings?.delete).toContain("h1");
  });

  it("turns the purse into that many Sztuki Złota on the ground", () => {
    const writes = turnToStone(table([], 3), { seatId: "seat-a" });
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "1-sztuka-zlota" },
      { field_id: "mroczna-polana", card_id: "1-sztuka-zlota" },
      { field_id: "mroczna-polana", card_id: "1-sztuka-zlota" },
    ]);
    expect(writes.seats?.[0].patch).toMatchObject({ zloto: 0 });
  });

  /** The Przyjaciele leave and are not recoverable — they are not left lying. */
  it("sends the Przyjaciele away rather than dropping them", () => {
    const writes = turnToStone(
      table([aHolding({ id: "f1", card_id: "wilk", kind: "friend" })]),
      { seatId: "seat-a" },
    );
    expect(writes.holdings?.delete).toContain("f1");
    expect(writes.fieldCards?.insert ?? []).toEqual([]);
  });

  /** 20.5 is explicit: the character keeps them for when it is flesh again. */
  it("does not take the Zaklęcia", () => {
    const writes = turnToStone(
      table([aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })]),
      { seatId: "seat-a" },
    );
    expect(writes.holdings?.delete ?? []).not.toContain("s1");
  });

  it("does not take the trofea either", () => {
    const writes = turnToStone(
      table([aHolding({ id: "t1", card_id: "goblin", kind: "trophy" })]),
      { seatId: "seat-a" },
    );
    expect(writes.holdings?.delete ?? []).not.toContain("t1");
  });

  it("says what it cost", () => {
    const writes = turnToStone(
      table([aHolding({ id: "h1", kind: "item" }), aHolding({ id: "f1", card_id: "wilk", kind: "friend" })], 2),
      { seatId: "seat-a" },
    );
    expect(writes.journal?.[0]).toMatchObject({
      kind: "stone",
      payload: { until: 8, left: 1, zloto: 2, friendsLost: 1 },
    });
  });
});
