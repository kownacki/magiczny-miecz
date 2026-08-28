import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptedRandom } from "@/lib/engine/ports";
import type { Fight, TurnPhase } from "@/lib/engine/turn";
import type { DeckState } from "@/lib/engine/deck";
import { aHolding, aSeat, aTable, aUser, NOW, ports } from "../fixture";
import { pointsOf } from "./seat";
import {
  attackSeat,
  beginFight,
  castSpell,
  escape,
  fightRoll,
  setFightPlayerTotal,
  shieldSaves,
} from "./fight";

/** A character standing where its move ended, with cards turned over in front of it. */
const pole = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: "mroczna-polana",
  from: null,
  draw: 1,
  drawn: [{ cardId: "cyklop", cardClass: "foe" }],
  ...over,
});

/** A fight already open, so the things that happen inside one can be asked about. */
/**
 * The two people in a duel, seat 0 and seat 1.
 *
 * Ala is a *person's* name, which is why she is here and not on a seat row.
 * What a fight against another Postać is called on screen is whoever is driving
 * it — `nameOfSeat` — and a chair with nobody behind it is "miejsce 2".
 */
const duellists = () => [
  aUser({ id: "usra", name: "Michał", seat_index: 0 }),
  aUser({ id: "usrb", name: "Ala", seat_index: 1, is_host: false }),
];

const walka = (over: Partial<Fight> = {}): TurnPhase => ({
  phase: "fight",
  fight: {
    cardId: "cyklop",
    cardName: "CYKLOP",
    kind: "ordinary",
    enemyTotal: 6,
    playerTotal: 3,
    playerRoll: null,
    enemyRoll: null,
    result: null,
    fieldId: "mroczna-polana",
    draw: 1,
    drawn: [{ cardId: "cyklop", cardClass: "foe" }],
    fought: ["cyklop"],
    ...over,
  } as Fight,
});

const fightIn = (writes: { game?: { turn_state?: unknown } }) =>
  (writes.game?.turn_state as Extract<TurnPhase, { phase: "fight" }>).fight;

const fieldIn = (writes: { game?: { turn_state?: unknown } }) =>
  writes.game?.turn_state as Extract<TurnPhase, { phase: "field" }>;

const pileIn = (writes: { game?: { deck?: unknown } }, which: "events" | "spells") =>
  (writes.game?.deck as Record<"events" | "spells", DeckState>)[which];

/* --------------------------------------------------------------------------
 * Opening one.
 * ----------------------------------------------------------------------- */

describe("otwarcie walki (17.4, 17.5)", () => {
  /**
   * Wrzosowiska rather than the fixture's Mroczna Polana, because six Obszary
   * make every Wróg met on them stronger and the Polana is one of them: "Każdy
   * Wróg ... dodaje 1 punkt do swojej Magii lub Miecza." These are tests about
   * combat arithmetic and not about the ground, so they stand somewhere the
   * ground does nothing.
   */
  const table = (over: Partial<TurnPhase> = {}, holdings = [aHolding()], nature = "good") =>
    aTable({
      game: {
        active_seat: 0,
        turn_state: { ...pole(), fieldId: "wrzosowiska", ...over } as TurnPhase,
      },
      seats: [
        aSeat({ sword_own: 2, magic_own: 1, nature, field_id: asFieldId("wrzosowiska") }),
      ],
      holdings,
    });

  it("weighs the character with everything it is carrying (1.5)", () => {
    // Zła, because the Miecz Chaosu is one of the three cards 5.3 keeps from a
    // Natura — and a card its holder may not hold lends nothing (`inEffect`).
    // The fixture was Dobra and counted the two points anyway, which is the
    // bug that rule was written to catch.
    const armed = table({}, [aHolding({ id: "h-1", card_id: "miecz-chaosu" })], "evil");
    const { writes } = beginFight(armed, { cardIds: ["cyklop"] });
    // Miecz 2 of its own plus the 2 the Miecz Chaosu lends, against the Cyklop's 6.
    expect(fightIn(writes)).toMatchObject({ playerTotal: 4, enemyTotal: 6, kind: "ordinary" });
  });

  it("tells the table what it is fighting", () => {
    const { writes } = beginFight(table(), { cardIds: ["cyklop"] });
    expect(writes.journal).toEqual([
      expect.objectContaining({
        kind: "fight-start",
        payload: { cardIds: ["cyklop"], enemyTotal: 6, together: false },
      }),
    ]);
  });

  /** 17.3's window opens empty: nobody is polled and nobody is named. */
  it("leaves the floor for whoever wants it", () => {
    const { writes } = beginFight(table(), { cardIds: ["cyklop"] });
    expect(fightIn(writes).caster).toBeUndefined();
  });

  it("sums several creatures into one opponent (17.5)", () => {
    const two = table({ drawn: [
      { cardId: "cyklop", cardClass: "foe" },
      { cardId: "nobbin", cardClass: "foe" },
    ] });
    const { writes } = beginFight(two, { cardIds: ["cyklop", "nobbin"] });
    expect(fightIn(writes)).toMatchObject({ enemyTotal: 8, cardName: "CYKLOP + NOBBIN" });
    expect(writes.journal?.[0].payload).toMatchObject({ together: true });
  });

  it("refuses to let a Wróg and a magiczny Wróg attack together (17.5)", () => {
    expect(() => beginFight(table(), { cardIds: ["cyklop", "demon"] })).toThrow(
      /nie atakują razem/,
    );
  });

  it("reads Magia against a magiczny Wróg (18.2)", () => {
    const magical = table({ drawn: [{ cardId: "demon", cardClass: "foe" }] });
    const { writes } = beginFight(magical, { cardIds: ["demon"] });
    expect(fightIn(writes)).toMatchObject({ kind: "magical", enemyTotal: 6, playerTotal: 1 });
  });

  it("will not fight the same creature twice in one turn (17.4)", () => {
    const done = table({ fought: ["cyklop"] });
    expect(() => beginFight(done, { cardIds: ["cyklop"] })).toThrow(/CYKLOP już się/);
  });

  it("refuses a card that is not a Wróg", () => {
    expect(() => beginFight(table(), { cardIds: ["helm"] })).toThrow(/HEŁM nie jest Wrogiem/);
  });

  it("refuses with nobody to fight, and off the field", () => {
    expect(() => beginFight(table(), { cardIds: [] })).toThrow(/Nie ma z kim/);
    const rolling = aTable({ game: { active_seat: 0, turn_state: { phase: "roll" } } });
    expect(() => beginFight(rolling, { cardIds: ["cyklop"] })).toThrow(/Nie czas na walkę/);
  });

  /** A staged fight is one the deck never dealt, and the sheet says so. */
  it("carries the staged mark through from the stack", () => {
    const staged = table({
      drawn: [{ cardId: "cyklop", cardClass: "foe", granted: true }],
    });
    const { writes } = beginFight(staged, { cardIds: ["cyklop"] });
    expect(fightIn(writes).granted).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Speaking into one.
 * ----------------------------------------------------------------------- */

describe("rzucenie Zaklęcia (9.6, 9.7, 17.3)", () => {
  const casting = (
    over: { cardId?: string; state?: TurnPhase; fieldId?: string } = {},
  ) =>
    aTable({
      game: { active_seat: 0, turn_state: over.state ?? pole() },
      seats: [
        aSeat({
          id: "seat-a",
          seat_index: 0,
          ...(over.fieldId ? { field_id: over.fieldId as never } : {}),
        }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
      users: duellists(),
      holdings: [
        aHolding({
          id: "s-1",
          seat_id: "seat-a",
          card_id: over.cardId ?? "wladca-gromu",
          kind: "spell",
          face: "hidden",
        }),
      ],
    });

  it("puts the spoken card on the used pile (9.6)", () => {
    const { writes } = castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(writes.holdings?.delete).toEqual(["s-1"]);
    expect(pileIn(writes, "spells").discard).toHaveLength(1);
  });

  it("says what was cast, and what the table now has to do", () => {
    const { result } = castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(result.spell).toBe("WŁADCA GROMU");
    expect(result.effect).toMatch(/sparaliżowane/);
  });

  it("journals the card, whom it was aimed at and what was said", () => {
    const { writes } = castSpell(
      casting(),
      { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1, note: "na Cyklopa" } },
      ports(),
    );
    expect(writes.journal?.[0]).toMatchObject({
      kind: "spell",
      payload: { cardId: "wladca-gromu", name: "WŁADCA GROMU", target: "Ala", note: "na Cyklopa" },
    });
  });

  it("refuses a card the Postać is not holding", () => {
    expect(() =>
      castSpell(casting(), { seatId: "seat-b", holdingId: "s-1" }, ports()),
    ).toThrow(/nie ma tego Zaklęcia/);
    expect(() =>
      castSpell(casting(), { seatId: "seat-z", holdingId: "s-1" }, ports()),
    ).toThrow(/Nie ma takiego gracza/);
  });

  /** 9.7: nothing works on the creatures of the Kamienny Most, nor on the Bestia. */
  it("refuses a Zaklęcie aimed at what stands on the Kamienny Most", () => {
    const onTheBridge = casting({ cardId: "krag-plomieni", fieldId: "pulapka" });
    expect(() =>
      castSpell(onTheBridge, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).toThrow(/9\.7/);
  });

  it("lets a Zaklęcie that touches nothing there be spoken on the bridge anyway", () => {
    // WŁADCA GROMU is aimed at an Obszar, not at the creatures on it.
    const onTheBridge = casting({ fieldId: "pulapka" });
    expect(() =>
      castSpell(onTheBridge, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).not.toThrow();
  });

  it("refuses a Zaklęcie whose moment has not come (9.1)", () => {
    const wrongMoment = casting({ cardId: "kamien-filozoficzny" });
    expect(() =>
      castSpell(wrongMoment, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).toThrow(/Nie ta chwila/);
  });

  it("refuses in a fight until the floor has been asked for (17.3)", () => {
    const fighting = casting({ state: walka() });
    expect(() =>
      castSpell(fighting, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).toThrow(/Najpierw zgłoś/);
  });

  it("refuses while somebody else is speaking", () => {
    const theirs = casting({ state: walka({ caster: { seat: 1, until: NOW + 1000 } }) });
    expect(() =>
      castSpell(theirs, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).toThrow(/poczekaj na swoją kolej/);
  });

  /**
   * 17.3 has the spells before the roll, so a spell spoken into a fight puts it
   * back where it started and hands the floor back to the table.
   */
  it("clears the dice and the floor once it has been spoken", () => {
    const mine = casting({
      state: walka({
        caster: { seat: 0, until: NOW + 1000 },
        playerRoll: 5,
        enemyRoll: 2,
        result: { outcome: "wygrana", winner: "Postać", loser: "CYKLOP", kind: "ordinary" },
      }),
    });
    const { writes } = castSpell(mine, { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(fightIn(writes)).toMatchObject({
      caster: null,
      playerRoll: null,
      enemyRoll: null,
      result: null,
    });
  });

  it("leaves the turn state alone outside a fight", () => {
    const { writes } = castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(writes.game?.turn_state).toBeUndefined();
  });

  /**
   * The one spell that empties a hand, and the one place two writes reach for
   * `game.deck` in the same breath.
   *
   * Every card taken has to arrive on the used pile — the caster's Władca
   * Czarów and both of the victim's — because 9.5 refills the spell deck from
   * exactly that pile. Merged side by side rather than chained, one of the two
   * writes would be dropped without a word and the discard would be short.
   */
  it("puts the caster's card and the whole hand it took on the pile (Władca Czarów)", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: pole() },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
      users: duellists(),
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "wladca-czarow", kind: "spell" }),
        aHolding({ id: "s-2", seat_id: "seat-b", card_id: "olsnienie", kind: "spell" }),
        aHolding({ id: "s-3", seat_id: "seat-b", card_id: "wladca-gromu", kind: "spell" }),
      ],
    });

    const { writes } = castSpell(
      table,
      { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1 } },
      ports(),
    );

    expect(writes.holdings?.delete).toEqual(["s-1", "s-2", "s-3"]);
    expect(pileIn(writes, "spells").discard).toHaveLength(3);
    expect(writes.journal?.[0].payload).toMatchObject({
      took: ["olsnienie", "wladca-gromu"],
    });
  });

  it("will not empty a hand nobody pointed at", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: pole() },
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "wladca-czarow", kind: "spell" }),
      ],
    });
    expect(() => castSpell(table, { seatId: "seat-a", holdingId: "s-1" }, ports())).toThrow(
      /Wskaż Postać/,
    );
  });

  /** "zdjąć z planszy jedną odkrytą Kartę Zdarzeń" — off the board, onto the pile. */
  it("takes a face-up Karta off the board and files it (Siewca Spustoszenia)", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: pole() },
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "siewca-spustoszenia", kind: "spell" }),
      ],
      fieldCards: [
        { id: "fc-1", field_id: "mroczna-polana", card_id: "cyklop", granted: false },
      ],
    });

    const { writes } = castSpell(
      table,
      { seatId: "seat-a", holdingId: "s-1", target: { fieldCardId: "fc-1" } },
      ports(),
    );
    expect(writes.fieldCards?.delete).toEqual(["fc-1"]);
    expect(pileIn(writes, "events").discard).toHaveLength(1);
    expect(pileIn(writes, "spells").discard).toHaveLength(1);
  });
});

/* --------------------------------------------------------------------------
 * The numbers and the dice.
 * ----------------------------------------------------------------------- */

describe("kostki w walce (17.3, 17.4)", () => {
  const table = (over: Partial<Fight> = {}) =>
    aTable({
      game: { active_seat: 0, turn_state: walka(over) },
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
      users: duellists(),
    });

  it("records the die and says whose it was", async () => {
    const { writes } = await fightRoll(
      table(),
      { side: "player" },
      ports({ random: scriptedRandom([4]) }),
    );
    expect(fightIn(writes).playerRoll).toBe(4);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "fight-roll",
      payload: { side: "player", roll: 4 },
      manual: false,
    });
  });

  /** 17.4: the fight ends the moment the two dice are compared. */
  it("settles the fight as the second die lands", async () => {
    const { writes } = await fightRoll(
      table({ playerRoll: 5 }),
      { side: "enemy" },
      ports({ random: scriptedRandom([1]) }),
    );
    // 3 + 5 against 6 + 1.
    expect(fightIn(writes).result).toMatchObject({ outcome: "wygrana" });
  });

  it("waits while somebody holds the floor (17.3, 17.7)", async () => {
    const held = table({ caster: { seat: 1, until: NOW + 1000 } });
    await expect(
      fightRoll(held, { side: "player" }, ports({ random: scriptedRandom([4]) })),
    ).rejects.toThrow(/Ala rzuca Zaklęcie/);
  });

  it("rolls straight through a claim that has lapsed", async () => {
    const stale = table({ caster: { seat: 1, until: NOW - 1 } });
    const { writes } = await fightRoll(
      stale,
      { side: "player" },
      ports({ random: scriptedRandom([4]) }),
    );
    expect(fightIn(writes).playerRoll).toBe(4);
  });

  it("marks a die the table threw itself", async () => {
    const { writes } = await fightRoll(
      table(),
      { side: "player", manual: true },
      ports({ random: scriptedRandom([4]) }),
    );
    expect(writes.journal?.[0].manual).toBe(true);
  });

  it("asks for exactly one die", async () => {
    const random = scriptedRandom([4]);
    await fightRoll(table(), { side: "player" }, ports({ random }));
    await expect(random.rollD6("a second")).rejects.toThrow(/exhausted/);
  });

  it("refuses when there is no fight", async () => {
    const idle = aTable({ game: { active_seat: 0, turn_state: pole() } });
    await expect(
      fightRoll(idle, { side: "player" }, ports({ random: scriptedRandom([4]) })),
    ).rejects.toThrow(/Nie ma walki/);
  });
});

describe("poprawianie sumy Postaci", () => {
  const table = aTable({ game: { active_seat: 0, turn_state: walka() } });

  it("takes the corrected total", () => {
    const { writes } = setFightPlayerTotal(table, { total: 9 });
    expect(fightIn(writes).playerTotal).toBe(9);
  });

  it("never goes below zero", () => {
    expect(fightIn(setFightPlayerTotal(table, { total: -3 }).writes).playerTotal).toBe(0);
  });
});

/* --------------------------------------------------------------------------
 * Two characters.
 * ----------------------------------------------------------------------- */

describe("pojedynek (13.1, 13.3, 17.7)", () => {
  const table = (over: { field?: string; state?: TurnPhase } = {}) =>
    aTable({
      game: { active_seat: 0, turn_state: over.state ?? pole({ drawn: [] }) },
      seats: [
        aSeat({
          id: "seat-a",
          seat_index: 0,
          sword_own: 3,
          ...(over.field ? { field_id: over.field as never } : {}),
        }),
        aSeat({
          id: "seat-b",
          seat_index: 1,
          sword_own: 2,
          // Zła, so the Miecz Chaosu she is holding is one she may hold (5.3).
          nature: "evil",
          ...(over.field ? { field_id: over.field as never } : {}),
        }),
      ],
      users: duellists(),
      holdings: [aHolding({ id: "h-1", seat_id: "seat-b", card_id: "miecz-chaosu" })],
    });

  it("opens the fight with both characters at their full totals (1.5, 2.5)", () => {
    const { writes } = attackSeat(table(), { targetSeatId: "seat-b" });
    // The attacker's own 3, against Ala's 2 and the 2 her Miecz Chaosu lends.
    expect(fightIn(writes)).toMatchObject({
      playerTotal: 3,
      enemyTotal: 4,
      opponentSeat: 1,
      cardId: "seat:1",
      cardName: "Ala",
    });
  });

  /** 17.7 gives "obie Postacie" their Zaklęcia before the roll, so nobody rolls yet. */
  it("opens the window rather than rolling", () => {
    const { writes } = attackSeat(table(), { targetSeatId: "seat-b" });
    expect(fightIn(writes)).toMatchObject({ playerRoll: null, enemyRoll: null });
    expect(fightIn(writes).caster).toBeUndefined();
    expect(writes.journal).toEqual([
      expect.objectContaining({
        kind: "duel",
        payload: { target: 1, field: "mroczna-polana" },
      }),
    ]);
  });

  it("refuses a Postać who is not standing here (13.1)", () => {
    const apart = aTable({
      game: { active_seat: 0, turn_state: pole({ drawn: [] }) },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "bezdroza" }),
      ],
    });
    expect(() => attackSeat(apart, { targetSeatId: "seat-b" })).toThrow(/tym samym Obszarze/);
  });

  it("refuses oneself, the dead and the unknown", () => {
    expect(() => attackSeat(table(), { targetSeatId: "seat-a" })).toThrow(/sama ze sobą/);
    expect(() => attackSeat(table(), { targetSeatId: "seat-z" })).toThrow(/Nieznane miejsce/);

    const dead = aTable({
      game: { active_seat: 0, turn_state: pole({ drawn: [] }) },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, eliminated: true }),
      ],
    });
    expect(() => attackSeat(dead, { targetSeatId: "seat-b" })).toThrow(/nie żyje/);
  });

  it("refuses outside the moment the move ended", () => {
    expect(() => attackSeat(table({ state: walka() }), { targetSeatId: "seat-b" })).toThrow(
      /Nie czas na spotkanie/,
    );
  });

  /** 14.1: on the bridge characters meet at the two Wejścia and nowhere else. */
  it("refuses beside a Demon on the Most, and allows it at the Wejście", () => {
    expect(() => attackSeat(table({ field: "pulapka" }), { targetSeatId: "seat-b" })).toThrow(
      /tylko na Wejściu/,
    );
    expect(() =>
      attackSeat(table({ field: "wejscie-na-most-a" }), { targetSeatId: "seat-b" }),
    ).not.toThrow();
  });
});

/* --------------------------------------------------------------------------
 * Leaving one.
 * ----------------------------------------------------------------------- */

describe("ucieczka (17.6, 19)", () => {
  /** The HOBGOBLIN wymyka się Wrogom na Stepie — a Charakterystyka, not a die. */
  const hobgoblin = (over: Parameters<typeof aSeat>[0] = {}) =>
    aSeat({
      id: "seat-a",
      seat_index: 0,
      character_id: "hobgoblin",
      field_id: "step-1",
      ...over,
    });

  const twoWrogowie = [
    { cardId: "cyklop", cardClass: "foe" as const },
    { cardId: "nobbin", cardClass: "foe" as const },
  ];

  it("takes the character away from everything standing here, not just the one it faced (19.1)", () => {
    const table = aTable({
      game: {
        active_seat: 0,
        turn_state: walka({ fieldId: "step-1", drawn: twoWrogowie, fought: ["cyklop"] }),
      },
      seats: [hobgoblin()],
    });
    const { writes, result } = escape(table, { reported: null });
    expect(result).toEqual({ succeeded: true, onBridge: false });
    expect(fieldIn(writes).phase).toBe("field");
    expect(fieldIn(writes).fought).toEqual(["cyklop", "nobbin"]);
  });

  it("settles the Wrogowie lying here even before a fight began", () => {
    const table = aTable({
      game: {
        active_seat: 0,
        turn_state: pole({ fieldId: "step-1", drawn: twoWrogowie }),
      },
      seats: [hobgoblin()],
    });
    const { writes, result } = escape(table, { reported: null });
    expect(result.succeeded).toBe(true);
    expect(fieldIn(writes).fought).toEqual(["cyklop", "nobbin"]);
  });

  it("says no when nothing gets the character away, and writes nothing but the line", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: walka() },
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
    });
    const { writes, result } = escape(table, { reported: null });
    expect(result.succeeded).toBe(false);
    expect(writes.game).toBeUndefined();
    expect(writes.journal).toEqual([
      expect.objectContaining({ kind: "escape-failed", payload: { onBridge: false } }),
    ]);
  });

  /** A companion table answers for itself, and "no" is an answer. */
  it("takes the table's own answer over the abilities", () => {
    const table = aTable({
      game: {
        active_seat: 0,
        turn_state: walka({ fieldId: "step-1", drawn: twoWrogowie }),
      },
      seats: [hobgoblin()],
    });
    expect(escape(table, { reported: false }).result.succeeded).toBe(false);
  });

  describe("z Kręgiem Płomieni (19.1)", () => {
    const duel = (holdings = [
      aHolding({ id: "s-1", seat_id: "seat-b", card_id: "krag-plomieni", kind: "spell" }),
    ]) =>
      aTable({
        game: { active_seat: 0, turn_state: walka({ opponentSeat: 1 }) },
        seats: [
          aSeat({ id: "seat-a", seat_index: 0 }),
          aSeat({ id: "seat-b", seat_index: 1 }),
        ],
        holdings,
      });

    it("is spoken, spent and filed (9.6)", () => {
      const { writes, result } = escape(duel(), { reported: null, actorSeatId: "seat-b" });
      expect(result.succeeded).toBe(true);
      expect(writes.holdings?.delete).toEqual(["s-1"]);
      expect(pileIn(writes, "spells").discard).toHaveLength(1);
      expect(writes.journal?.map((line) => line.kind)).toEqual(["spell", "escape"]);
      expect(writes.journal?.[1].payload).toMatchObject({ spell: "krag-plomieni" });
    });

    /** One creature, not the Obszar: it ends the fight in hand and nothing more. */
    it("ends the fight in hand and sweeps nothing", () => {
      const { writes } = escape(duel(), { reported: null, actorSeatId: "seat-b" });
      expect(fieldIn(writes).fought).toEqual(["cyklop"]);
    });

    it("is not burnt when the table answered for itself", () => {
      const { writes } = escape(duel(), { reported: true, actorSeatId: "seat-b" });
      expect(writes.holdings).toBeUndefined();
    });

    it("does nothing for a Postać who is not holding one", () => {
      expect(escape(duel([]), { reported: null, actorSeatId: "seat-b" }).result.succeeded).toBe(
        false,
      );
    });
  });

  /**
   * 17.6 gives the attempt to the character who was attacked, and a duel is the
   * one fight where that is never the active seat.
   */
  it("belongs to the attacked Postać, decided against the fight and not the button", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: walka({ opponentSeat: 1 }) },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
    });
    expect(() => escape(table, { reported: true, actorSeatId: "seat-a" })).toThrow(
      /zaatakowana, nie atakująca/,
    );
    const { writes } = escape(table, { reported: true, actorSeatId: "seat-b" });
    expect(writes.journal?.[0].seatId).toBe("seat-b");
  });

  it("is the active seat's outside a duel", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: walka() },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1 }),
      ],
    });
    expect(() => escape(table, { reported: true, actorSeatId: "seat-b" })).toThrow(
      /To nie twoja tura/,
    );
  });

  /** 19.3 leaves exactly one kind of escape on the Kamienny Most. */
  it("refuses to slip a Wróg on the Kamienny Most", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: walka({ fieldId: "pulapka" }) },
      seats: [hobgoblin({ field_id: "pulapka" })],
    });
    expect(() => escape(table, { reported: null })).toThrow(/19\.3/);
  });

  it("says so when there is nothing to flee", () => {
    const rolling = aTable({ game: { active_seat: 0, turn_state: { phase: "roll" } } });
    expect(() => escape(rolling, { reported: null })).toThrow(/Nie ma przed czym uciekać/);
  });
});

/* --------------------------------------------------------------------------
 * The item that stands between a loss and a scratch.
 * ----------------------------------------------------------------------- */

describe("osłona (17.4, 18.2b)", () => {
  const table = (holdings = [aHolding({ id: "h-1", card_id: "helm" })]) =>
    aTable({ game: { active_seat: 0 }, seats: [aSeat({ id: "seat-a", seat_index: 0 })], holdings });

  it("saves the point on a 1 with a Hełm, and says so", async () => {
    const { writes, result } = await shieldSaves(
      table(),
      { seatId: "seat-a", kind: "ordinary" },
      ports({ random: scriptedRandom([1]) }),
    );
    expect(result).toBe(true);
    expect(writes.journal?.[0]).toMatchObject({
      kind: "shielded",
      payload: { die: 1, upTo: 1, saved: true },
    });
  });

  it("does not save on a 2", async () => {
    const { result } = await shieldSaves(
      table(),
      { seatId: "seat-a", kind: "ordinary" },
      ports({ random: scriptedRandom([2]) }),
    );
    expect(result).toBe(false);
  });

  /** 18.2b: nothing prevents the loss in a magical fight, so nothing is rolled. */
  it("rolls nothing at all in a magical fight", async () => {
    const random = scriptedRandom([]);
    const { writes, result } = await shieldSaves(
      table(),
      { seatId: "seat-a", kind: "magical" },
      ports({ random }),
    );
    expect(result).toBe(false);
    expect(writes).toEqual({});
  });

  it("rolls nothing for a character wearing nothing", async () => {
    const { result } = await shieldSaves(
      table([]),
      { seatId: "seat-a", kind: "ordinary" },
      ports({ random: scriptedRandom([]) }),
    );
    expect(result).toBe(false);
  });
});

describe("Zaczarowane Wzgórza and the spoken word", () => {
  /** "Nie możesz też rzucać Zaklęć." The other half of the same sentence. */
  it("refuses a Zaklęcie spoken from the Wzgórza", () => {
    const there = aTable({
      game: { active_seat: 0 },
      seats: [
        aSeat({
          id: "seat-a",
          seat_index: 0,
          field_id: asFieldId("zaczarowane-wzgorza"),
        }),
      ],
      holdings: [aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })],
    });
    // `castSpell` is synchronous — it needs no die — so this throws rather
    // than rejecting.
    expect(() => castSpell(there, { seatId: "seat-a", holdingId: "s1" }, ports())).toThrow(
      /tu nie rzuca się Zaklęć/,
    );
  });

  /**
   * The board does not pair the two rules the way one list implied. The Wzgórza
   * carry both — "nie możesz liczyć na Miecz i Magię ... Nie możesz też rzucać
   * Zaklęć" — and the Rozstajne Drogi split them one apiece.
   */
  it("refuses on the crossroads that forbids Zaklęcia, and allows the other", () => {
    const standing = (field: string) =>
      aTable({
        game: { active_seat: 0 },
        seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: asFieldId(field) })],
        holdings: [aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })],
      });

    expect(() =>
      castSpell(standing("rozstajne-drogi-2"), { seatId: "seat-a", holdingId: "s1" }, ports()),
    ).toThrow(/tu nie rzuca się Zaklęć/);

    // Rozstajne Drogi I suspends the Przedmioty and says nothing about Zaklęcia.
    expect(() =>
      castSpell(standing("rozstajne-drogi-1"), { seatId: "seat-a", holdingId: "s1" }, ports()),
    ).not.toThrow(/tu nie rzuca się Zaklęć/);
  });

  /** And the other half, the other way round. */
  it("suspends Przedmioty on the crossroads that says so, and not on the other", () => {
    const worth = (field: string) => {
      const t = aTable({
        seats: [aSeat({ id: "seat-a", sword_own: 2, field_id: asFieldId(field) })],
        holdings: [aHolding({ id: "i1", seat_id: "seat-a", card_id: "excalibur", kind: "item" })],
      });
      return pointsOf(t, "seat-a", "walka").miecz;
    };
    expect(worth("rozstajne-drogi-1")).toBe(2);
    expect(worth("rozstajne-drogi-2")).toBe(3);
  });
});
