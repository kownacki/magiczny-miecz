import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { only, top } from "@/lib/engine/stack";
import { aHolding, aSeat, aTable } from "../fixture";
import { apply } from "../change";
import { finishTurn, leaveCardsBehind, passTurn, tickEffects } from "./turn";

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
      { field_id: "mroczna-polana", card_id: "helm", granted: false, pool: null },
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
      { field_id: "mroczna-polana", card_id: "wilkolak", granted: true, pool: null },
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

  /**
   * 16.7's three wells, whose count belongs to the Karta and not to anybody.
   *
   * Nothing subtracted from these before: `disposition` said `zostaje-z-pula`
   * from the day they were transcribed, `describeDisposition` printed a
   * sentence about four points, and no code anywhere took one away — so four
   * players could drink from one Drzewo forever and it never withered.
   */
  describe("a Miejsce with a pool (16.7)", () => {
    const pooled = (cardId: string, pool?: number | null) =>
      leaveCardsBehind(aTable({ seats: [aSeat({ id: "seat-a" })] }), {
        fieldId: "przelecz-wichrow",
        seatId: "seat-a",
        round: 3,
        remaining: [{ cardId, cardClass: "place", ...(pool === undefined ? {} : { pool }) } as never],
      });

    it("lays out four points beside a well nobody has drunk from yet", () => {
      // "Po znalezieniu Drzewa, połóż przy nim 4 punkty Życia."
      expect(pooled("drzewo-zycia").fieldCards?.insert).toEqual([
        { field_id: "przelecz-wichrow", card_id: "drzewo-zycia", granted: false, pool: 4 },
      ]);
    });

    it("writes back what the visitor left, not a fresh four", () => {
      expect(pooled("jezioro-magiczne", 2).fieldCards?.insert?.[0]).toMatchObject({ pool: 2 });
    });

    /** "Po wykorzystaniu 4 punktów, Drzewo usycha, należy odłożyć jego Kartę." */
    it("sends a well that has run dry to the stos zużytych rather than back", () => {
      const writes = pooled("zaklete-zrodlo", 0);
      expect(writes.fieldCards?.insert ?? []).toEqual([]);
      // Not left behind either: it goes the way the Tragarz does, onto the pile.
      expect(writes.journal?.map((line) => line.kind) ?? []).not.toContain("left-behind");
    });

    it("leaves a Miejsce with no pool exactly as it was", () => {
      // "Labirynt pozostanie tu do końca rozgrywki" — nothing beside it to count.
      expect(pooled("labirynt").fieldCards?.insert?.[0]).toMatchObject({
        card_id: "labirynt",
        pool: null,
      });
    });
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

/**
 * `endturn force`: the test console handing the turn on over a rule.
 *
 * Every refusal below is right for a game and wrong for a table being built by
 * hand — a surplus dealt in, a Tarcza put on, a Karta half-resolved by a script
 * nobody wants to finish. Without the flag the only way past them was to undo
 * what had just been set up, which is the setup happening twice.
 */
describe("handing the turn on anyway (the test console's `force`)", () => {
  /** Klasyczny counts everything and 5.4's limit is four; five is one over. */
  const FIVE = ["helm", "zbroja", "miecz", "sztylet", "latarnia"];

  const overloaded = (over: Partial<Parameters<typeof aTable>[0]> = {}) =>
    aTable({
      game: {
        active_seat: 0,
        round: 3,
        eq_mode: "classic",
        turn_state: only({
          phase: "field",
          fieldId: asFieldId("mroczna-polana")!,
          from: null,
          draw: 0,
          drawn: [],
        }),
        ...(over.game ?? {}),
      },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0, character_id: "goblin" }),
        aSeat({ id: "seat-b", seat_index: 1, character_id: "elf" }),
      ],
      holdings: (over.holdings ?? FIVE).map((card, at) =>
        typeof card === "string"
          ? aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: card })
          : card,
      ),
    });

  it("holds the turn on a surplus, as 5.6 asks", () => {
    const outcome = finishTurn(overloaded());
    expect(outcome.result).toBe("held");
    expect(top(apply(overloaded(), outcome.writes).game.turn_state)).toMatchObject({
      phase: "overflow",
      seatId: "seat-a",
    });
  });

  it("passes over the surplus when forced, and leaves no frame behind", () => {
    const at = overloaded();
    const outcome = finishTurn(at, { force: true });
    expect(outcome.result).toBe("passed");
    const after = apply(at, outcome.writes);
    expect(after.game.active_seat).toBe(1);
    // The whole stack is written over by the pass, so the surplus is not
    // waiting under the next seat's turn.
    expect(after.game.turn_state.stack).toEqual([{ phase: "roll" }]);
  });

  /**
   * The frame already up is the same answer.
   *
   * A table that has been sitting in the surplus is the state somebody is most
   * likely to be typing `force` at — it is what the refusal in the screenshot
   * was — and `refuseWhileOverflow` throws rather than returning, so this is a
   * different code path from the one above.
   */
  it("passes over a surplus frame that is already waiting", () => {
    const at = overloaded({
      game: {
        turn_state: only({ phase: "overflow", seatId: "seat-a", what: "przedmioty" }),
      },
    });
    expect(() => finishTurn(at)).toThrow(/limitu/);
    expect(finishTurn(at, { force: true }).result).toBe("passed");
  });

  /**
   * A Karta half-resolved, which has no verb of its own.
   *
   * `endfight` drops a fight, so the fight phase always had a way out. A
   * `script` frame and a question owed had none: the console refused the turn
   * and offered nothing else, which is the deadlock `resolve.ts` describes.
   */
  it("passes over a Karta the turn never finished", () => {
    // Inside 5.4's four, so the only thing in the way is the frame.
    const at = overloaded({
      holdings: [],
      game: {
        turn_state: only({
          phase: "script",
          seatId: "seat-a",
          cardId: "targowisko",
          reason: "TARGOWISKO",
          effect: { op: "kup", towar: [{ co: "helm", cena: 1 }] },
          cursor: [],
        }),
      },
    });
    expect(() => finishTurn(at)).toThrow(/TARGOWISKO/);
    const after = apply(at, finishTurn(at, { force: true }).writes);
    expect(after.game.active_seat).toBe(1);
  });
});
