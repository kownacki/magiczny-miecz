import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { only } from "@/lib/engine/stack";
import { aSeat, aTable } from "../fixture";
import { leaveCardsBehind, passTurn, tickEffects } from "./turn";

const two = (over: Partial<Parameters<typeof aTable>[0]> = {}) =>
  aTable({
    game: { active_seat: 0, round: 3, ...(over.game ?? {}) },
    seats: over.seats ?? [
      aSeat({ id: "seat-a", seat_index: 0 }),
      aSeat({ id: "seat-b", seat_index: 1 }),
    ],
    ...(over.effects ? { effects: over.effects } : {}),
  });

describe("passing the turn (10.1)", () => {
  it("hands play to the next seat and starts them at the roll", () => {
    const writes = passTurn(two());
    expect(writes.game).toMatchObject({ active_seat: 1, round: 3, turn_state: only({ phase: "roll" }) });
  });

  /** 20.1 counts the round, so it has to advance when play comes back round. */
  it("advances the round counter on the way past the first seat", () => {
    const writes = passTurn(two({ game: { active_seat: 1, round: 3 } }));
    expect(writes.game).toMatchObject({ active_seat: 0, round: 4 });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "turn-end",
      payload: { next: 0, wrapped: true, turnAfter: 4 },
    });
  });

  /**
   * Formuła Czasu: „wykorzystanie 3 kolejnych tur zamiast jednej."
   *
   * The turn does not move, and everything else the pass does still happens —
   * which is what makes it a turn rather than a longer one.
   */
  it("hands the turn back to the same seat while the Formuła holds", () => {
    const again = two({
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-a",
          source: "FORMUŁA CZASU",
          label: "Formuła Czasu",
          modifier: { kind: "znowu" },
          ends: { kind: "turns", turns: 2 },
        },
      ],
    });
    const writes = passTurn(again);
    expect(writes.game).toMatchObject({ active_seat: 0, turn_state: only({ phase: "roll" }) });
    // The status counts the extra turns out, so the third pass moves on.
    expect(writes.effects?.patch).toEqual([{ id: "eff-1", patch: { ends: { kind: "turns", turns: 1 } } }]);
    expect(writes.journal?.[0]).toMatchObject({ payload: { next: 0, again: true } });
  });

  it("does not advance the round while the turn stays where it is", () => {
    const again = two({
      game: { active_seat: 1, round: 3 },
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-b",
          source: "FORMUŁA CZASU",
          label: "Formuła Czasu",
          modifier: { kind: "znowu" },
          ends: { kind: "turns", turns: 2 },
        },
      ],
    });
    const writes = passTurn(again);
    // 20.1 counts rounds, and a seat taking three turns has not been round.
    expect(writes.game).toMatchObject({ active_seat: 1, round: 3 });
  });

  it("skips a seat that owes a turn, and spends one of what it owes", () => {
    const writes = passTurn(
      two({
        seats: [
          aSeat({ id: "seat-a", seat_index: 0 }),
          aSeat({ id: "seat-b", seat_index: 1, turns_lost: 2 }),
        ],
      }),
    );
    expect(writes.game?.active_seat).toBe(0);
    expect(writes.seats).toContainEqual({ id: "seat-b", patch: { turns_lost: 1 } });
  });

  /**
   * Burza Siedmiu Słońc: "Wszystkie Postacie tracą 1 turę".
   *
   * One pass finds nobody, and the game used to stop there for good — an
   * `active_seat` of null with no way to press anything, including the thing
   * that would have spent those lost turns.
   */
  it("keeps passing when the whole table owes a turn, rather than stopping", () => {
    const writes = passTurn(
      two({
        seats: [
          aSeat({ id: "seat-a", seat_index: 0, turns_lost: 1 }),
          aSeat({ id: "seat-b", seat_index: 1, turns_lost: 1 }),
        ],
      }),
    );
    expect(writes.game?.active_seat).not.toBeNull();
    expect(writes.seats).toEqual(
      expect.arrayContaining([
        { id: "seat-a", patch: { turns_lost: 0 } },
        { id: "seat-b", patch: { turns_lost: 0 } },
      ]),
    );
  });

  it("leaves an untaken card lying on the Obszar (16.8)", () => {
    const table = two({
      game: {
        active_seat: 0,
        round: 3,
        turn_state: {
          phase: "field",
          fieldId: asFieldId("mroczna-polana")!,
          from: null,
          draw: 1,
          drawn: [{ cardId: "helm", cardClass: "item" }],
        },
      },
    });
    const writes = passTurn(table);
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "helm", granted: false },
    ]);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["left-behind", "turn-end"]);
  });

  /**
   * The mark travels onto the field with the card.
   *
   * A Wróg the test console staged is one the deck never gave up. Left lying
   * here without the flag it becomes a real card the moment somebody picks it
   * up, and a phantom on the used pile the moment they put it down — which is
   * the whole reason `granted` exists.
   */
  it("carries a granted card's mark onto the Obszar with it", () => {
    const table = two({
      game: {
        active_seat: 0,
        round: 3,
        turn_state: {
          phase: "field",
          fieldId: asFieldId("mroczna-polana")!,
          from: null,
          draw: 1,
          drawn: [{ cardId: "wilkolak", cardClass: "foe", granted: true }],
        },
      },
    });
    expect(passTurn(table).fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "wilkolak", granted: true },
    ]);
  });
});

describe("effects counting down", () => {
  const withEffect = (turns: number) =>
    aTable({
      seats: [aSeat({ id: "seat-a" })],
      effects: [
        {
          id: "e1",
          seat_id: "seat-a",
          source: "Eliksir",
          label: "+1 Miecza",
          modifier: { kind: "points", miecz: 1 },
          ends: { kind: "turns", turns },
        },
      ],
    });

  it("takes one turn off a countdown", () => {
    expect(tickEffects(withEffect(2), "seat-a").effects).toEqual({
      patch: [{ id: "e1", patch: { ends: { kind: "turns", turns: 1 } } }],
    });
  });

  it("removes it when the last turn runs out", () => {
    expect(tickEffects(withEffect(1), "seat-a").effects).toEqual({ delete: ["e1"] });
  });

  it("leaves alone what is not counting turns", () => {
    const table = aTable({
      seats: [aSeat({ id: "seat-a" })],
      effects: [
        {
          id: "e2",
          seat_id: "seat-a",
          source: "Tarcza",
          label: "osłona",
          modifier: { kind: "frozen" },
          ends: { kind: "fight" },
        },
      ],
    });
    expect(tickEffects(table, "seat-a")).toEqual({});
  });
});

/**
 * 16.8 leaves what nobody took lying face up on the Obszar — with one exception
 * the card prints itself.
 */
describe("what is left on the Obszar at the end of a turn", () => {
  const leaving = (...cardIds: string[]) =>
    leaveCardsBehind(aTable({ seats: [aSeat({ id: "seat-a" })] }), {
      fieldId: "przelecz-wichrow",
      seatId: "seat-a",
      round: 3,
      remaining: cardIds.map((cardId) => ({ cardId, cardClass: "friend" }) as never),
    });

  it("leaves an unpaid Najemnik lying there, because he says he waits", () => {
    // "Jeśli odmówisz zapłaty, będzie czekał tu na bardziej hojną Postać."
    const writes = leaving("najemnik");
    expect(writes.fieldCards?.insert?.map((row) => row.card_id)).toEqual(["najemnik"]);
  });

  it("sends an unpaid Tragarz to the stos zużytych instead", () => {
    // "Jeśli mu nie zapłacisz, odejdzie na stos użytych Kart" — the one friend
    // who does not wait to be picked up.
    const writes = leaving("tragarz");
    expect(writes.fieldCards?.insert ?? []).toEqual([]);
    expect(writes.journal?.map((line) => line.kind) ?? []).not.toContain("left-behind");
  });

  it("tells the two apart in the same handful", () => {
    const writes = leaving("najemnik", "tragarz", "pasterz");
    expect(writes.fieldCards?.insert?.map((row) => row.card_id)).toEqual(["najemnik", "pasterz"]);
  });
});
