import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { aSeat, aTable } from "../fixture";
import { passTurn, tickEffects } from "./turn";

const two = (over: Partial<Parameters<typeof aTable>[0]> = {}) =>
  aTable({
    game: { active_seat: 0, turn: 3, ...(over.game ?? {}) },
    seats: over.seats ?? [
      aSeat({ id: "seat-a", seat_index: 0 }),
      aSeat({ id: "seat-b", seat_index: 1 }),
    ],
    ...(over.effects ? { effects: over.effects } : {}),
  });

describe("passing the turn (10.1)", () => {
  it("hands play to the next seat and starts them at the roll", () => {
    const writes = passTurn(two());
    expect(writes.game).toMatchObject({ active_seat: 1, turn: 3, turn_state: { phase: "rzut" } });
  });

  /** 20.1 counts the round, so it has to advance when play comes back round. */
  it("advances the round counter on the way past the first seat", () => {
    const writes = passTurn(two({ game: { active_seat: 1, turn: 3 } }));
    expect(writes.game).toMatchObject({ active_seat: 0, turn: 4 });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "koniec-tury",
      payload: { next: 0, wrapped: true, turnAfter: 4 },
    });
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
        turn: 3,
        turn_state: {
          phase: "pole",
          fieldId: asFieldId("mroczna-polana")!,
          from: null,
          draw: 1,
          drawn: [{ cardId: "helm", cardClass: "przedmiot" }],
        },
      },
    });
    const writes = passTurn(table);
    expect(writes.fieldCards?.insert).toEqual([
      { field_id: "mroczna-polana", card_id: "helm" },
    ]);
    expect(writes.journal?.map((line) => line.kind)).toEqual(["zostawienie", "koniec-tury"]);
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
          modifier: { kind: "punkty", miecz: 1 },
          ends: { kind: "tur", turns },
        },
      ],
    });

  it("takes one turn off a countdown", () => {
    expect(tickEffects(withEffect(2), "seat-a").effects).toEqual({
      patch: [{ id: "e1", patch: { ends: { kind: "tur", turns: 1 } } }],
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
          modifier: { kind: "bez-ruchu" },
          ends: { kind: "walka" },
        },
      ],
    });
    expect(tickEffects(table, "seat-a")).toEqual({});
  });
});
