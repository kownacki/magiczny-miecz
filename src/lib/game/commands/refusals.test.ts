import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable, ports } from "../fixture";
import { scriptedRandom } from "@/lib/engine/ports";
import { asSeatCharacter } from "@/lib/engine/characters";
import { resolveDrawnCard } from "./resolving";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import {
  freeFromStone,
  isStone,
  refuseAgainstStone,
  turnToStone,
  STONE_TURNS,
} from "./stone";
import { spendLife } from "./life";
import { refuseWhileBeastAwaits } from "./beast";
import { refuseWhileHeld } from "./seat";
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

  /**
   * The other half of 20.5, which the app had never enforced.
   *
   * „Ona pozostawia swoje Zaklęcia. Będzie je mogła użyć **po odczarowaniu z
   * Kamienia, czyli po 3 turach**", and the Karta says it outright: „nie może
   * też używać swoich Zaklęć". Keeping them and using them are two things, and
   * only the keeping was ever true here.
   *
   * `refuseWhileHeld` is the door — `castSpell` and `moveTo` are its callers.
   * Moving was safe by accident, because a statue never gets a turn to spend;
   * a Zaklęcie is not turn-gated, so nothing stopped one being spoken.
   */
  it("cannot speak a Zaklęcie of its own until it is flesh again (20.5)", () => {
    expect(() => refuseWhileHeld(table(), "seat-b")).toThrow(/Kamień/);
    // With a card named, too: `oprocz` is the Krąg Płomieni's escape hatch and
    // Kamień prints none, so naming one changes nothing.
    expect(() => refuseWhileHeld(table(), "seat-b", "wladca-zaklec")).toThrow(/Kamień/);
    // And it lifts on the turn it is meant to.
    expect(() => refuseWhileHeld(table({ round: 4 }), "seat-b")).not.toThrow();
    // Everybody else is untouched.
    expect(() => refuseWhileHeld(table(), "seat-a")).not.toThrow();
  });

  /**
   * The same door, for the status that *does* have a row.
   *
   * Both halves of the model reach it now, and this is the half that always
   * did — kept as a test so a future reader can see that widening it took
   * nothing away.
   */
  it("still refuses a seat frozen by a stored effect, and honours its escape", () => {
    const flames = apply(table({ stoneUntil: null }), {
      effects: {
        insert: [
          {
            seat_id: "seat-b",
            field_card_id: null,
            source: "Krąg Płomieni",
            label: "Krąg Płomieni",
            modifier: { kind: "frozen", oprocz: ["wladca-zaklec"] },
            ends: { kind: "dispelled" },
          },
        ],
      },
    });
    expect(() => refuseWhileHeld(flames, "seat-b")).toThrow(/Krąg Płomieni/);
    expect(() => refuseWhileHeld(flames, "seat-b", "wladca-zaklec")).not.toThrow();
  });

  /**
   * The undo, which the console had no word for.
   *
   * `stone` could inflict three rounds and nothing could give them back short
   * of destroying the character — the asymmetry CLAUDE.md's "a referee you
   * cannot correct is worse than no referee" names.
   */
  it("can be lifted by hand before the three turns are up", () => {
    const at = table();
    expect(isStone(at, "seat-b")).toBe(true);
    const writes = freeFromStone(at, { seatId: "seat-b" });
    expect(isStone(apply(at, writes), "seat-b")).toBe(false);
    // Null, not a round already past: the column means "the round this wears
    // off in", and a Postać that is not stone has no such round.
    expect(
      apply(at, writes).seats.find((one) => one.id === "seat-b")?.stone_until_round,
    ).toBeNull();
    // Filed as somebody overruling the referee, because that is what it is —
    // 20.1 says what turns a Postać to stone and no rule takes it back early.
    expect(writes.journal?.[0]).toMatchObject({
      kind: "override",
      manual: true,
      payload: { what: "unstone", until: 4 },
    });
  });

  it("refuses to lift a Kamień that is not there", () => {
    expect(() => freeFromStone(table({ stoneUntil: null }), { seatId: "seat-b" })).toThrow(
      /Ta Postać nie jest Zamieniona w Kamień/,
    );
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
          field_card_id: null,
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


/**
 * A Karta is dealt with once, and so is an Obszar's own table.
 *
 * The copy lookup used to fall back to a settled one — „the first that is not
 * resolved, or else any of them" — which reads as a safe default and is a way
 * to resolve a Karta twice. The UROCZA DIABLICA showed it: a „Rzuć kostką"
 * still standing on a screen that had not caught up threw a second die and
 * applied a second row.
 */
describe("resolving something twice", () => {
  /**
   * `nth` on every copy, the way a frame written today has it: `resolved` names
   * a *copy*, and a frame carrying no numbers cannot tell two of one Karta
   * apart — which is why `listed` reads a bare id as naming all of them.
   */
  const onWrzosowiska = (drawn: string[], resolved: string[] = []) =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: {
          phase: "field",
          fieldId: "wrzosowiska",
          from: null,
          draw: 0,
          drawn: drawn.map((cardId, at) => ({
            cardId,
            cardClass: "stranger" as const,
            nth: at + 1,
          })),
          resolved,
        } as TurnPhase,
      },
      seats: [
        aSeat({
          id: "seat-a",
          seat_index: 0,
          character_id: asSeatCharacter("krasnolud"),
          field_id: "wrzosowiska",
        }),
      ],
    });

  const asIs = <T,>(items: readonly T[]): T[] => [...items];

  it("refuses a Karta already struck off this turn", async () => {
    const table = onWrzosowiska(["urocza-diablica"], ["urocza-diablica#1"]);
    await expect(
      resolveDrawnCard(
        table,
        { cardId: "urocza-diablica", decided: {}, shuffle: asIs },
        ports({ random: scriptedRandom([3]) }),
      ),
    ).rejects.toThrow(/już rozpatrzona/);
  });

  /** Two of one Karta are two Karty: settling one leaves the other. */
  it("still reaches the second copy of a Karta drawn twice", async () => {
    const table = onWrzosowiska(
      ["urocza-diablica", "urocza-diablica"],
      ["urocza-diablica#1"],
    );
    await expect(
      resolveDrawnCard(
        table,
        { cardId: "urocza-diablica", decided: {}, shuffle: asIs },
        ports({ random: scriptedRandom([3]) }),
      ),
    ).resolves.toMatchObject({ result: { face: 3 } });
  });

  it("says a Karta that is not here is not here", async () => {
    await expect(
      resolveDrawnCard(
        onWrzosowiska([]),
        { cardId: "urocza-diablica", decided: {}, shuffle: asIs },
        ports(),
      ),
    ).rejects.toThrow(/Tej Karty tu nie ma/);
  });
});
