import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { scriptedRandom } from "@/lib/engine/ports";
import type { Fight, TurnPhase } from "@/lib/engine/turn";
import type { DeckState } from "@/lib/engine/deck";
import { aHolding, aSeat, aTable, aUser, NOW, ports } from "../fixture";
import { pointsOf } from "./seat";
import { hasAttacked } from "@/lib/engine/status";
import { statusesOf } from "./turn";
import { apply } from "../change";
import {
  attackSeat,
  beginFight,
  castSpell,
  escape,
  fightRoll,
  resolveFight,
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

  it("weighs the character with everything it is carrying (1.5)", async () => {
    // Zła, because the Miecz Chaosu is one of the three cards 5.3 keeps from a
    // Natura — and a card its holder may not hold lends nothing (`inEffect`).
    // The fixture was Dobra and counted the two points anyway, which is the
    // bug that rule was written to catch.
    const armed = table({}, [aHolding({ id: "h-1", card_id: "miecz-chaosu" })], "evil");
    const { writes } = beginFight(armed, { cardIds: ["cyklop"] });
    // Miecz 2 of its own plus the 2 the Miecz Chaosu lends, against the Cyklop's 6.
    expect(fightIn(writes)).toMatchObject({ playerTotal: 4, enemyTotal: 6, kind: "ordinary" });
  });

  /**
   * „Sobowtór to monstrum, które tworzy sama Postać... Posiada zawsze tyle
   * punktów Miecza, ile jego przeciwnik."
   *
   * The one Wróg in the box with no number printed on him, and until this he
   * could not be fought at all — `combatValueOf` had nothing to read, so the
   * fight was refused with „SOBOWTÓR nie jest Wrogiem" and his own card left
   * him lying there („Pozostanie tu, aż ktoś go pokona") for the rest of the
   * game. Found by the soak playing 145 turns.
   */
  it("gives the Sobowtór the Miecz of whoever is fighting him", async () => {
    const mirror = table({ drawn: [{ cardId: "sobowtor", cardClass: "foe" }] });
    const { writes } = beginFight(mirror, { cardIds: ["sobowtor"] });
    // Both sides at the character's 2, so the fight is the two dice and
    // nothing else, which is what the card is.
    expect(fightIn(writes)).toMatchObject({
      playerTotal: 2,
      enemyTotal: 2,
      kind: "ordinary",
    });
  });

  /** 1.5's total, not the żetony: what he mirrors is what you bring. */
  it("mirrors everything the character is carrying into the fight, not its own points", async () => {
    const armed = table(
      { drawn: [{ cardId: "sobowtor", cardClass: "foe" }] },
      [aHolding({ id: "h-1", card_id: "miecz-chaosu" })],
      "evil",
    );
    const { writes } = beginFight(armed, { cardIds: ["sobowtor"] });
    expect(fightIn(writes)).toMatchObject({ playerTotal: 4, enemyTotal: 4 });
  });

  it("counts him among a pack at the strength of the one facing it (17.5)", async () => {
    const both = table({
      drawn: [
        { cardId: "cyklop", cardClass: "foe" },
        { cardId: "sobowtor", cardClass: "foe" },
      ],
    });
    const { writes } = beginFight(both, { cardIds: ["cyklop", "sobowtor"] });
    // The Cyklop's 6 and the Sobowtór's 2, summed as 17.5 sums them.
    expect(fightIn(writes)).toMatchObject({ playerTotal: 2, enemyTotal: 8 });
  });

  it("tells the table what it is fighting", async () => {
    const { writes } = beginFight(table(), { cardIds: ["cyklop"] });
    expect(writes.journal).toEqual([
      expect.objectContaining({
        kind: "fight-start",
        payload: { cardIds: ["cyklop"], enemyTotal: 6, together: false },
      }),
    ]);
  });

  /** 17.3's window opens empty: nobody is polled and nobody is named. */
  it("leaves the floor for whoever wants it", async () => {
    const { writes } = beginFight(table(), { cardIds: ["cyklop"] });
    expect(fightIn(writes).caster).toBeUndefined();
  });

  it("sums several creatures into one opponent (17.5)", async () => {
    const two = table({ drawn: [
      { cardId: "cyklop", cardClass: "foe" },
      { cardId: "nobbin", cardClass: "foe" },
    ] });
    const { writes } = beginFight(two, { cardIds: ["cyklop", "nobbin"] });
    expect(fightIn(writes)).toMatchObject({ enemyTotal: 8, cardName: "CYKLOP + NOBBIN" });
    expect(writes.journal?.[0].payload).toMatchObject({ together: true });
  });

  it("refuses to let a Wróg and a magiczny Wróg attack together (17.5)", async () => {
    expect(() => beginFight(table(), { cardIds: ["cyklop", "demon"] })).toThrow(
      /nie atakują razem/,
    );
  });

  it("reads Magia against a magiczny Wróg (18.2)", async () => {
    const magical = table({ drawn: [{ cardId: "demon", cardClass: "foe" }] });
    const { writes } = beginFight(magical, { cardIds: ["demon"] });
    expect(fightIn(writes)).toMatchObject({ kind: "magical", enemyTotal: 6, playerTotal: 1 });
  });

  it("will not fight the same creature twice in one turn (17.4)", async () => {
    const done = table({ fought: ["cyklop"] });
    expect(() => beginFight(done, { cardIds: ["cyklop"] })).toThrow(/CYKLOP już się/);
  });

  it("refuses a card that is not a Wróg", async () => {
    expect(() => beginFight(table(), { cardIds: ["helm"] })).toThrow(/HEŁM nie jest Wrogiem/);
  });

  it("refuses with nobody to fight, and off the field", async () => {
    expect(() => beginFight(table(), { cardIds: [] })).toThrow(/Nie ma z kim/);
    const rolling = aTable({ game: { active_seat: 0, turn_state: { phase: "roll" } } });
    expect(() => beginFight(rolling, { cardIds: ["cyklop"] })).toThrow(/Nie czas na walkę/);
  });

  /** A staged fight is one the deck never dealt, and the sheet says so. */
  it("carries the staged mark through from the stack", async () => {
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

  /* ------------------------------------------------------------------------
   * The two that conjure a fighter (GOLEM, HOMUNCULUS).
   * --------------------------------------------------------------------- */

  it("sends the Golem at the Postać it was aimed at, with its own three points", async () => {
    const { writes } = await castSpell(
      casting({ cardId: "golem", state: { phase: "roll" } }),
      { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1 } },
      ports(),
    );
    // The caster is not in this fight: the attacking side is the Golem's Miecz
    // and nothing of theirs — „ofiara musi walczyć na zwykłych zasadach".
    expect(fightIn(writes)).toMatchObject({
      playerTotal: 3,
      opponentSeat: 1,
      raid: { cardId: "GOLEM", summoned: true },
    });
  });

  it("hands the turn back where it took it from — the move is still owed", async () => {
    const { writes } = await castSpell(
      casting({ cardId: "homunculus", state: { phase: "roll" } }),
      { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1 } },
      ports(),
    );
    // „Przed wykonaniem ruchu": the caster has not moved and must not lose it.
    expect(fightIn(writes)).toMatchObject({ playerTotal: 5, resume: { phase: "roll" } });
  });

  it("refuses a creature nobody was named for", async () => {
    await expect(
      castSpell(
        casting({ cardId: "golem", state: { phase: "roll" } }),
        { seatId: "seat-a", holdingId: "s-1" },
        ports(),
      ),
    ).rejects.toThrow(/na siebie/);
  });

  it("refuses a target outside the Krąg", async () => {
    const away = aTable({
      game: { active_seat: 0, turn_state: { phase: "roll" } },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        // The Zamek is on another ring, and 11.2 makes crossing a turn's work.
        aSeat({ id: "seat-b", seat_index: 1, field_id: asFieldId("zamek") }),
      ],
      users: duellists(),
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "golem", kind: "spell", face: "hidden" }),
      ],
    });
    await expect(
      castSpell(away, { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1 } }, ports()),
    ).rejects.toThrow(/w granicach Kręgu/);
  });

  it("sends it at a Wróg lying on an Obszar in the ring", async () => {
    const board = aTable({
      game: { active_seat: 0, turn_state: { phase: "roll" } },
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
      users: duellists(),
      fieldCards: [
        { id: "fc1", field_id: "wrzosowiska", card_id: "cyklop", granted: false },
      ],
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "golem", kind: "spell", face: "hidden" }),
      ],
    });
    const { writes } = await castSpell(
      board,
      { seatId: "seat-a", holdingId: "s-1", target: { fieldCardId: "fc1" } },
      ports(),
    );
    expect(fightIn(writes)).toMatchObject({
      cardId: "cyklop",
      enemyTotal: 6,
      playerTotal: 3,
      raid: { summoned: true, fieldCardId: "fc1" },
    });
  });

  it("puts the spoken card on the used pile (9.6)", async () => {
    const { writes } = await castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(writes.holdings?.delete).toEqual(["s-1"]);
    expect(pileIn(writes, "spells").discard).toHaveLength(1);
  });

  it("says what was cast, and what the table now has to do", async () => {
    const { result } = await castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(result.spell).toBe("WŁADCA GROMU");
    expect(result.effect).toMatch(/sparaliżowane/);
  });

  it("journals the card, whom it was aimed at and what was said", async () => {
    const { writes } = await castSpell(
      casting(),
      { seatId: "seat-a", holdingId: "s-1", target: { seatIndex: 1, note: "na Cyklopa" } },
      ports(),
    );
    expect(writes.journal?.[0]).toMatchObject({
      kind: "spell",
      payload: { cardId: "wladca-gromu", name: "WŁADCA GROMU", target: "Ala", note: "na Cyklopa" },
    });
  });

  it("refuses a card the Postać is not holding", async () => {
    await expect(castSpell(casting(), { seatId: "seat-b", holdingId: "s-1" }, ports())).rejects.toThrow(/nie ma tego Zaklęcia/);
    await expect(castSpell(casting(), { seatId: "seat-z", holdingId: "s-1" }, ports())).rejects.toThrow(/Nie ma takiego gracza/);
  });

  /** 9.7: nothing works on the creatures of the Kamienny Most, nor on the Bestia. */
  it("refuses a Zaklęcie aimed at what stands on the Kamienny Most", async () => {
    const onTheBridge = casting({ cardId: "krag-plomieni", fieldId: "pulapka" });
    await expect(castSpell(onTheBridge, { seatId: "seat-a", holdingId: "s-1" }, ports())).rejects.toThrow(/9\.7/);
  });

  it("lets a Zaklęcie that touches nothing there be spoken on the bridge anyway", async () => {
    // WŁADCA GROMU is aimed at an Obszar, not at the creatures on it.
    const onTheBridge = casting({ fieldId: "pulapka" });
    await expect(
      castSpell(onTheBridge, { seatId: "seat-a", holdingId: "s-1" }, ports()),
    ).resolves.toBeDefined();
  });

  it("refuses a Zaklęcie whose moment has not come (9.1)", async () => {
    const wrongMoment = casting({ cardId: "kamien-filozoficzny" });
    await expect(castSpell(wrongMoment, { seatId: "seat-a", holdingId: "s-1" }, ports())).rejects.toThrow(/Nie ta chwila/);
  });

  it("refuses in a fight until the floor has been asked for (17.3)", async () => {
    const fighting = casting({ state: walka() });
    await expect(castSpell(fighting, { seatId: "seat-a", holdingId: "s-1" }, ports())).rejects.toThrow(/Najpierw zgłoś/);
  });

  it("refuses while somebody else is speaking", async () => {
    const theirs = casting({ state: walka({ caster: { seat: 1, until: NOW + 1000 } }) });
    await expect(castSpell(theirs, { seatId: "seat-a", holdingId: "s-1" }, ports())).rejects.toThrow(/poczekaj na swoją kolej/);
  });

  /**
   * 17.3 has the spells before the roll, so a spell spoken into a fight puts it
   * back where it started and hands the floor back to the table.
   */
  it("clears the dice and the floor once it has been spoken", async () => {
    const mine = casting({
      state: walka({
        caster: { seat: 0, until: NOW + 1000 },
        playerRoll: 5,
        enemyRoll: 2,
        result: { outcome: "wygrana", winner: "Postać", loser: "CYKLOP", kind: "ordinary" },
      }),
    });
    const { writes } = await castSpell(mine, { seatId: "seat-a", holdingId: "s-1" }, ports());
    expect(fightIn(writes)).toMatchObject({
      caster: null,
      playerRoll: null,
      enemyRoll: null,
      result: null,
    });
  });

  it("leaves the turn state alone outside a fight", async () => {
    const { writes } = await castSpell(casting(), { seatId: "seat-a", holdingId: "s-1" }, ports());
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
  it("puts the caster's card and the whole hand it took on the pile (Władca Czarów)", async () => {
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

    const { writes } = await castSpell(
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

  it("will not empty a hand nobody pointed at", async () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: pole() },
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      holdings: [
        aHolding({ id: "s-1", seat_id: "seat-a", card_id: "wladca-czarow", kind: "spell" }),
      ],
    });
    await expect(castSpell(table, { seatId: "seat-a", holdingId: "s-1" }, ports())).rejects.toThrow(
      /Wskaż Postać/,
    );
  });

  /** "zdjąć z planszy jedną odkrytą Kartę Zdarzeń" — off the board, onto the pile. */
  it("takes a face-up Karta off the board and files it (Siewca Spustoszenia)", async () => {
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

    const { writes } = await castSpell(
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

  /**
   * „Jeśli zwycięży [ofiara] — nic się nie dzieje."
   *
   * A wyprawa the Przyjaciel loses kills the Przyjaciel; a summoned creature is
   * nobody's card and the caster has nothing in it at all — no Życie, no
   * osłona, no Karta.
   */
  it("costs the caster nothing when the summoned creature loses", async () => {
    const summoned = aTable({
      game: {
        active_seat: 0,
        turn_state: walka({
          cardId: "seat:1",
          opponentSeat: 1,
          enemyTotal: 9,
          playerTotal: 3,
          playerRoll: 1,
          enemyRoll: 1,
          result: { outcome: "przegrana", winner: "GOLEM", loser: "Michał", kind: "ordinary" },
          raid: { cardId: "GOLEM", summoned: true },
          resume: { phase: "roll" },
        }),
      },
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
      users: duellists(),
      // The one Przyjaciel a lost wyprawa kills — „ty nie tracisz punktu Życia,
      // ale twój Przyjaciel ginie". A summoned creature is not his errand.
      holdings: [
        aHolding({ id: "f-1", seat_id: "seat-a", card_id: "poszukiwacz-przygod", kind: "friend" }),
      ],
    });
    const { writes } = await resolveFight(summoned, undefined, ports());
    // The Golem is beaten and nothing of the caster's moves — not the
    // Poszukiwacz, who dies for his own wyprawa and not for a Zaklęcie.
    expect(writes.seats ?? []).toEqual([]);
    expect(writes.holdings ?? {}).toEqual({});
    // And the turn is handed back, with the move still owed.
    expect(writes.game?.turn_state).toEqual({ phase: "roll" });
  });

  /** „Wróg jest zdejmowany z planszy" — and to the pile, like everything else. */
  it("takes a Wróg beaten where he lay off the board", async () => {
    const board = aTable({
      game: {
        active_seat: 0,
        turn_state: walka({
          cardId: "cyklop",
          enemyTotal: 6,
          playerTotal: 5,
          playerRoll: 6,
          enemyRoll: 1,
          result: { outcome: "wygrana", winner: "HOMUNCULUS", loser: "CYKLOP", kind: "ordinary" },
          raid: { cardId: "HOMUNCULUS", summoned: true, fieldCardId: "fc1" },
        }),
      },
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      fieldCards: [{ id: "fc1", field_id: "wrzosowiska", card_id: "cyklop", granted: false }],
    });
    const { writes } = await resolveFight(board, undefined, ports());
    expect(writes.fieldCards?.delete).toEqual(["fc1"]);
    expect(pileIn(writes, "events").discard).toHaveLength(1);
    // No trophy: the Karta was not beaten by the character (1.4).
    expect(writes.holdings?.insert ?? []).toEqual([]);
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

  it("takes the corrected total", async () => {
    const { writes } = setFightPlayerTotal(table, { total: 9 });
    expect(fightIn(writes).playerTotal).toBe(9);
  });

  it("never goes below zero", async () => {
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

  it("opens the fight with both characters at their full totals (1.5, 2.5)", async () => {
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
  it("opens the window rather than rolling", async () => {
    const { writes } = attackSeat(table(), { targetSeatId: "seat-b" });
    expect(fightIn(writes)).toMatchObject({ playerRoll: null, enemyRoll: null });
    expect(fightIn(writes).caster).toBeUndefined();
    expect(writes.journal).toContainEqual(
      expect.objectContaining({
        kind: "duel",
        payload: { target: 1, field: "mroczna-polana" },
      }),
    );
  });

  /**
   * 13.3 is where the Dobre Bóstwo's question is answered — "jeśli podczas tej
   * rozgrywki zaatakowałeś inną Postać". The mark goes on at the moment of
   * attacking rather than of winning, which is what the card asks about, and it
   * goes on once: a second duel would otherwise read as twice the sinner for no
   * reason the card gives.
   */
  it("remembers that the attacker raised a hand (13.3)", () => {
    const first = table();
    const marked = apply(first, attackSeat(first, { targetSeatId: "seat-b" }).writes);
    expect(hasAttacked(statusesOf(marked, "seat-a"))).toBe(true);
    expect(hasAttacked(statusesOf(marked, "seat-b"))).toBe(false);

    // A later duel adds nothing. Only the mark is carried over — the first
    // attack also opened a fight, and 13.1 refuses a second from inside one.
    const later = apply(first, { effects: attackSeat(first, { targetSeatId: "seat-b" }).writes.effects });
    expect(attackSeat(later, { targetSeatId: "seat-b" }).writes.effects?.insert ?? []).toHaveLength(0);
  });

  it("refuses a Postać who is not standing here (13.1)", async () => {
    const apart = aTable({
      game: { active_seat: 0, turn_state: pole({ drawn: [] }) },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, field_id: "bezdroza" }),
      ],
    });
    expect(() => attackSeat(apart, { targetSeatId: "seat-b" })).toThrow(/tym samym Obszarze/);
  });

  it("refuses oneself, the dead and the unknown", async () => {
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

  it("refuses outside the moment the move ended", async () => {
    expect(() => attackSeat(table({ state: walka() }), { targetSeatId: "seat-b" })).toThrow(
      /Nie czas na spotkanie/,
    );
  });

  /** 14.1: on the bridge characters meet at the two Wejścia and nowhere else. */
  it("refuses beside a Demon on the Most, and allows it at the Wejście", async () => {
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

  it("takes the character away from everything standing here, not just the one it faced (19.1)", async () => {
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

  it("settles the Wrogowie lying here even before a fight began", async () => {
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

  it("says no when nothing gets the character away, and writes nothing but the line", async () => {
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
  it("takes the table's own answer over the abilities", async () => {
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

    it("is spoken, spent and filed (9.6)", async () => {
      const { writes, result } = escape(duel(), { reported: null, actorSeatId: "seat-b" });
      expect(result.succeeded).toBe(true);
      expect(writes.holdings?.delete).toEqual(["s-1"]);
      expect(pileIn(writes, "spells").discard).toHaveLength(1);
      expect(writes.journal?.map((line) => line.kind)).toEqual(["spell", "escape"]);
      expect(writes.journal?.[1].payload).toMatchObject({ spell: "krag-plomieni" });
    });

    /** One creature, not the Obszar: it ends the fight in hand and nothing more. */
    it("ends the fight in hand and sweeps nothing", async () => {
      const { writes } = escape(duel(), { reported: null, actorSeatId: "seat-b" });
      expect(fieldIn(writes).fought).toEqual(["cyklop"]);
    });

    it("is not burnt when the table answered for itself", async () => {
      const { writes } = escape(duel(), { reported: true, actorSeatId: "seat-b" });
      expect(writes.holdings).toBeUndefined();
    });

    it("does nothing for a Postać who is not holding one", async () => {
      expect(escape(duel([]), { reported: null, actorSeatId: "seat-b" }).result.succeeded).toBe(
        false,
      );
    });
  });

  /**
   * 17.6 gives the attempt to the character who was attacked, and a duel is the
   * one fight where that is never the active seat.
   */
  it("belongs to the attacked Postać, decided against the fight and not the button", async () => {
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

  it("is the active seat's outside a duel", async () => {
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
  it("refuses to slip a Wróg on the Kamienny Most", async () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: walka({ fieldId: "pulapka" }) },
      seats: [hobgoblin({ field_id: "pulapka" })],
    });
    expect(() => escape(table, { reported: null })).toThrow(/19\.3/);
  });

  it("says so when there is nothing to flee", async () => {
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
  it("refuses a Zaklęcie spoken from the Wzgórza", async () => {
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
    await expect(castSpell(there, { seatId: "seat-a", holdingId: "s1" }, ports())).rejects.toThrow(
      /tu nie rzuca się Zaklęć/,
    );
  });

  /**
   * The board does not pair the two rules the way one list implied. The Wzgórza
   * carry both — "nie możesz liczyć na Miecz i Magię ... Nie możesz też rzucać
   * Zaklęć" — and the Rozstajne Drogi split them one apiece.
   */
  it("refuses on the crossroads that forbids Zaklęcia, and allows the other", async () => {
    const standing = (field: string) =>
      aTable({
        game: { active_seat: 0 },
        seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: asFieldId(field) })],
        holdings: [aHolding({ id: "s1", card_id: "krag-plomieni", kind: "spell" })],
      });

    await expect(castSpell(standing("rozstajne-drogi-2"), { seatId: "seat-a", holdingId: "s1" }, ports())).rejects.toThrow(/tu nie rzuca się Zaklęć/);

    // Rozstajne Drogi I suspends the Przedmioty and says nothing about Zaklęcia.
    await expect(
      castSpell(standing("rozstajne-drogi-1"), { seatId: "seat-a", holdingId: "s1" }, ports()),
    ).resolves.toBeDefined();
  });

  /** And the other half, the other way round. */
  it("suspends Przedmioty on the crossroads that says so, and not on the other", async () => {
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
