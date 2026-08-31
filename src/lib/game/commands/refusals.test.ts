import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable } from "../fixture";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { isStone, refuseAgainstStone, turnToStone, STONE_TURNS } from "./stone";
import { spendLife } from "./life";
import { refuseWhileBeastAwaits } from "./beast";
import { attackSeat } from "./fight";

/**
 * 20.3 and 20.5, which are two rows of the coverage table and one idea:
 * **stone is not a legal target.**
 *
 * "Postaci Zamienionej w Kamień nie można odebrać punktu Życia. Na taką Postać
 * nie można rzucać Zaklęć." (20.5) And 20.3's "nie może ich używać" of Miecz
 * and Magia is the same rule seen from inside — the only moment a statue would
 * use either is defending an attack, which is one of the things forbidden.
 */
const table = (over: { stoneUntil?: number | null; round?: number } = {}) =>
  aTable({
    game: {
      round: over.round ?? 1,
      active_seat: 0,
      turn_state: {
        phase: "field",
        fieldId: asFieldId("mokradla-1"),
        from: null,
        draw: 0,
        drawn: [],
      } as TurnPhase,
    },
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, field_id: "mokradla-1" }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        field_id: "mokradla-1",
        life: 4,
        stone_until_round: over.stoneUntil === undefined ? 4 : over.stoneUntil,
      }),
    ],
  });

describe("a Postać Zamieniona w Kamień", () => {
  it("is stone until the turn it becomes flesh again (20.1)", () => {
    expect(isStone(table({ stoneUntil: 4, round: 1 }), "seat-b")).toBe(true);
    expect(isStone(table({ stoneUntil: 4, round: 3 }), "seat-b")).toBe(true);
    // 20.1's three turns are up: `stone_until_round` is the turn it ends.
    expect(isStone(table({ stoneUntil: 4, round: 4 }), "seat-b")).toBe(false);
    expect(isStone(table({ stoneUntil: null }), "seat-b")).toBe(false);
  });

  /** The one door every loss comes through — a fight, a Karta, an Obszar. */
  it("cannot be made to lose a point of Życie (20.5)", () => {
    const at = table();
    const { writes, result } = spendLife(at, "seat-b", 1);
    expect(writes).toEqual({});
    expect(result).toBe(4);
    expect(apply(at, writes).seats.find((one) => one.id === "seat-b")?.life).toBe(4);
  });

  it("loses it again once it is flesh (20.1)", () => {
    const at = table({ round: 4 });
    expect(spendLife(at, "seat-b", 1).result).toBe(3);
  });

  /** Even a blow that would kill: it is not a lesser loss, it is no loss. */
  it("is not killed by a blow it cannot take", () => {
    const at = apply(table(), { seats: [{ id: "seat-b", patch: { life: 1 } }] });
    const { writes } = spendLife(at, "seat-b", 1);
    expect(writes).toEqual({});
    expect(apply(at, writes).seats.find((one) => one.id === "seat-b")?.eliminated).toBe(false);
  });

  it("cannot be attacked (17.6, 20.5)", () => {
    expect(() => attackSeat(table(), { targetSeatId: "seat-b" })).toThrow(/20\.5/);
  });

  it("can be attacked again once it is flesh", () => {
    expect(() => attackSeat(table({ round: 4 }), { targetSeatId: "seat-b" })).not.toThrow();
  });

  it("cannot be cast at (20.5)", () => {
    expect(() => refuseAgainstStone(table(), "seat-b", "spell")).toThrow(/Zaklęć/);
    expect(() => refuseAgainstStone(table({ round: 4 }), "seat-b", "spell")).not.toThrow();
  });

  /** 20.5 is explicit that the Zaklęcia stay, unlike everything else (20.2). */
  it("keeps its Zaklęcia through the change", () => {
    const at = aTable({
      game: { round: 1 },
      seats: [aSeat({ id: "seat-b", field_id: "mokradla-1" })],
      holdings: [
        { id: "s1", seat_id: "seat-b", card_id: "golem", kind: "spell", face: "hidden" },
      ] as never,
    });
    const after = apply(at, turnToStone(at, { seatId: "seat-b" }));
    expect(after.holdings.map((one) => one.kind)).toEqual(["spell"]);
    expect(after.seats[0].stone_until_round).toBe(1 + STONE_TURNS);
  });
});

/**
 * 10.5 / 14.7 — the Zamek is not a square you may walk away from.
 *
 * The declaration 10.5 speaks of is not modelled and should not be: at a table
 * it is a sentence somebody says out loud, and 14.7 states the same commitment
 * in cardboard — "nie może z niej zrezygnować jeśli posiada Tarczę Tolimana".
 */
describe("standing in the Zamek Bestii", () => {
  const atCastle = (cards: readonly string[], fieldId = "zamek-bestii") =>
    aTable({
      game: { round: 1, active_seat: 0, turn_state: { phase: "roll" } as TurnPhase },
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: asFieldId(fieldId) })],
      holdings: cards.map((cardId, at) =>
        aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
      ),
    });

  it("will not let a Postać with the Tarcza leave", () => {
    expect(() => refuseWhileBeastAwaits(atCastle(["tarcza-tolimana"]), "seat-a")).toThrow(
      /10\.5/,
    );
  });

  /** The Tarcza Boga Tolimana opens the same door, and closes it the same way. */
  it("treats the Tarcza Boga Tolimana as the same commitment", () => {
    expect(() =>
      refuseWhileBeastAwaits(atCastle(["tarcza-boga-tolimana"]), "seat-a"),
    ).toThrow(/14\.7/);
  });

  /**
   * Without it there is nothing to refuse. 14.7's parenthesis is the whole
   * condition — a character with no Tarcza was never committed.
   */
  it("lets a Postać without one carry on", () => {
    expect(() => refuseWhileBeastAwaits(atCastle(["miecz"]), "seat-a")).not.toThrow();
    expect(() => refuseWhileBeastAwaits(atCastle([]), "seat-a")).not.toThrow();
  });

  it("says nothing anywhere else on the board", () => {
    expect(() =>
      refuseWhileBeastAwaits(atCastle(["tarcza-tolimana"], "mokradla-1"), "seat-a"),
    ).not.toThrow();
  });
});

/**
 * The Krąg Płomieni's other half, which is 20.5's prohibition narrowed.
 *
 * „Ofiary nie można zaatakować, jednak można się jej wymknąć" — an attack and
 * only an attack. A Zaklęcie must still reach them, because the Władca Zaklęć
 * is how anybody gets out of the flames.
 */
describe("a Postać in the Krąg Płomieni", () => {
  const inFlames = () =>
    aTable({
      game: {
        round: 1,
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: asFieldId("mokradla-1"),
          from: null,
          draw: 0,
          drawn: [],
        } as TurnPhase,
      },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, field_id: "mokradla-1" }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "mokradla-1", life: 4 }),
      ],
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-b",
          source: "krag-plomieni",
          label: "Krąg Płomieni",
          modifier: { kind: "frozen", oprocz: ["wladca-zaklec"] },
          ends: { kind: "dispelled" },
        },
      ],
    });

  it("cannot be attacked", () => {
    expect(() => attackSeat(inFlames(), { targetSeatId: "seat-b" })).toThrow(
      /nie można zaatakować/,
    );
  });

  it("can still be spoken at, which is the way out", () => {
    expect(() => refuseAgainstStone(inFlames(), "seat-b", "spell")).not.toThrow();
  });
});

