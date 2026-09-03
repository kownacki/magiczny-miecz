import { describe, expect, it } from "vitest";
import { apply } from "../change";
import { aHolding, aSeat, aTable } from "../fixture";
import { only, top } from "@/lib/engine/stack";
import { asFieldId } from "@/lib/engine/board";
import type { TurnPhase } from "@/lib/engine/turn";
import { killSeat } from "./life";
import { turnToStone } from "./stone";
import { clearField, placeGold, takeCard, takeFieldGold } from "./holdings";
import { RULE_FOR } from "@/lib/engine/journalRules";

const HERE = asFieldId("mroczna-polana")!;

/** Standing on the Obszar, move finished, nothing owed — 12.1's own window. */
const arrived = (over: Partial<Extract<TurnPhase, { phase: "field" }>> = {}): TurnPhase => ({
  phase: "field",
  fieldId: HERE,
  from: null,
  draw: 0,
  drawn: [],
  ...over,
});

const table = (over: Parameters<typeof aTable>[0] = {}) =>
  aTable({
    seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 3 })],
    game: { active_seat: 0, turn_state: only(arrived()) },
    ...over,
  });

/**
 * 4.4 lists what stays and forgets the purse — Przedmioty and Przyjaciele on
 * the Obszar, Magia and Miecz żetony back to the spare pile, Zaklęcia to the
 * used one, and gold in none of the three.
 *
 * It is Talisman's 4:3 adapted (5.5 and 6.4 are 5:4 and 6:4 word for word), and
 * 4:3 reads "all the Character's Objects, Magic Objects, Followers **and Gold
 * Counters** are placed on the Space". 20.2 settles it from the other side:
 * three turns of stone leaves your gold on the square, and death should not be
 * gentler on a purse.
 */
describe("death leaves the purse where the character fell (4.4)", () => {
  it("puts the gold on the Obszar and takes it off the seat", () => {
    const before = table();
    const after = apply(before, killSeat(before, "seat-a"));
    expect(after.fieldGold.map((row) => [row.field_id, row.gold])).toEqual([[HERE, 3]]);
    expect(after.seats[0].gold).toBe(0);
  });

  it("leaves nothing behind for a character who died broke", () => {
    const broke = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 0 })],
    });
    expect(apply(broke, killSeat(broke, "seat-a")).fieldGold).toEqual([]);
  });

  /** It is gold now, not Karty. See `dropGold` and db/schema.sql. */
  it("does not mint Karty the deck never gave up", () => {
    const before = table();
    const after = apply(before, killSeat(before, "seat-a"));
    expect(after.fieldCards.filter((row) => row.card_id.includes("zlota"))).toEqual([]);
  });
});

/** 20.2: "Karty Przedmiotów i złota należy pozostawić na Obszarze". */
describe("stone leaves the purse too (20.2)", () => {
  it("puts the gold down as gold and the Przedmioty down as Karty", () => {
    const before = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 2 })],
      holdings: [aHolding({ id: "h1", seat_id: "seat-a", card_id: "helm", kind: "item" })],
    });
    const after = apply(before, turnToStone(before, { seatId: "seat-a" }));
    expect(after.fieldGold.map((row) => row.gold)).toEqual([2]);
    expect(after.fieldCards.map((row) => row.card_id)).toEqual(["helm"]);
    expect(after.seats[0].gold).toBe(0);
  });
});

/**
 * "zabrać leżące złoto" carries no number, and Talisman's 12:1 — the sentence
 * this is adapted from — says "**any** Gold Counters […] may be taken". So the
 * amount is the player's.
 */
describe("taking gold off an Obszar (12.1)", () => {
  const withGold = (gold: number, over: Parameters<typeof aTable>[0] = {}) =>
    table({ fieldGold: [{ id: "fg1", field_id: HERE, gold }], ...over });

  it("takes the amount asked for and leaves the rest", () => {
    const before = withGold(5);
    const { result, writes } = takeFieldGold(before, { seatId: "seat-a", gold: 2 });
    expect(result.took).toBe(2);
    const after = apply(before, writes);
    expect(after.fieldGold[0].gold).toBe(3);
    expect(after.seats[0].gold).toBe(5);
  });

  /** No purse at all rather than an empty one — see `takeGold`. */
  it("clears the row when the last coin goes", () => {
    const before = withGold(2);
    expect(apply(before, takeFieldGold(before, { seatId: "seat-a", gold: 2 }).writes).fieldGold)
      .toEqual([]);
  });

  it("refuses more than is lying there", () => {
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 3 })).toThrow(/tylko 2/);
  });

  it("refuses nothing, and refuses a fraction of a coin", () => {
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 0 })).toThrow(/Podaj/);
    expect(() => takeFieldGold(withGold(2), { seatId: "seat-a", gold: 0.5 })).toThrow(/Podaj/);
  });

  it("refuses where there is none", () => {
    expect(() => takeFieldGold(table(), { seatId: "seat-a", gold: 1 })).toThrow(/Nie ma tu złota/);
  });

  /** 12.1a — the same guard the Karty are under. */
  it("refuses while a Wróg is standing here", () => {
    const guarded = withGold(3, {
      fieldCards: [{ id: "fc1", field_id: HERE, card_id: "wilk", granted: false, pool: null }],
    });
    expect(() => takeFieldGold(guarded, { seatId: "seat-a", gold: 1 })).toThrow(/12\.1a/);
  });

  /**
   * The case the two guards used to disagree about, and the reason there is
   * now one of them.
   *
   * A Karta lies in one of two places depending on nothing a player can see:
   * arriving lifts every `field_cards` row into the turn's frame, and the end
   * of the turn writes back what nobody took. 12.1a was written twice, once
   * against each list — so a Przedmiot was correctly refused over an unfought
   * Wilk's head while the gold beside it was handed over, on the one turn the
   * rule is actually about.
   */
  it("refuses over a Wróg the turn is holding, not only one lying on the board", () => {
    const wilk = { cardId: "wilk", cardClass: "foe" as const, granted: false };
    const mid = table({
      fieldGold: [{ id: "fg1", field_id: HERE, gold: 3 }],
      game: { active_seat: 0, turn_state: only(arrived({ drawn: [wilk] })) },
    });
    expect(() => takeFieldGold(mid, { seatId: "seat-a", gold: 1 })).toThrow(/WILK/);
    // And the Przedmiot beside it refuses for the same reason and in the same
    // words, which is the whole point of there being one guard.
    expect(() => takeCard(mid, { seatId: "seat-a", cardId: "miecz" })).toThrow(/WILK/);
  });

  const wilkDrawn = { cardId: "wilk", cardClass: "foe" as const, granted: false };

  /** Beaten or fled, 17.4 settles him and the loot is loose (16.2). */
  it("lets both through once he is settled", () => {
    const settled = table({
      fieldGold: [{ id: "fg1", field_id: HERE, gold: 3 }],
      game: {
        active_seat: 0,
        turn_state: only(
          arrived({ drawn: [wilkDrawn], fought: ["wilk"] }),
        ),
      },
    });
    expect(takeFieldGold(settled, { seatId: "seat-a", gold: 1 }).result.took).toBe(1);
    expect(() => takeCard(settled, { seatId: "seat-a", cardId: "miecz" })).not.toThrow();
  });

  /**
   * 12.1b, the other exception, and the other direction the two came apart in.
   *
   * `refuseUnlessCollectable` asked it and `takeCard` did not, so on a Bezdroża
   * that owes two Karty with a Miecz already lying there, the gold was refused
   * and the Miecz was handed over. Same square, same moment, opposite answers.
   */
  it("refuses a Karta lying here while the Obszar still owes Karty", () => {
    const owing = table({
      fieldGold: [{ id: "fg1", field_id: HERE, gold: 3 }],
      fieldCards: [{ id: "fc1", field_id: HERE, card_id: "miecz", granted: false, pool: null }],
      game: { active_seat: 0, turn_state: only(arrived({ draw: 1 })) },
    });
    expect(() => takeFieldGold(owing, { seatId: "seat-a", gold: 1 })).toThrow(/12\.1b/);
    expect(() => takeCard(owing, { seatId: "seat-a", cardId: "miecz" })).toThrow(/12\.1b/);
  });

  /**
   * And it stops at what is lying there, which is 12.1's whole subject —
   * "zabrać **leżące** złoto, Przedmioty lub Przyjaciół".
   *
   * A card bought at a Targowisko, the Tarcza the Władca hands over for a
   * finished errand, one a Karta's own `otrzymaj` grants: none of those is
   * lying on the square, and none is what the two exceptions hold back. They
   * all arrive through `takeCard` too, so the guard asks *which* card rather
   * than merely *when*.
   */
  it("lets a Karta that is not lying here through while Karty are still owed", () => {
    const owing = table({
      game: { active_seat: 0, turn_state: only(arrived({ draw: 1 })) },
    });
    expect(() => takeCard(owing, { seatId: "seat-a", cardId: "helm" })).not.toThrow();
  });

  /**
   * The money Karta, which skipped both exceptions by being answered first.
   *
   * „1 SZTUKA ZŁOTA" is a Przedmiot that resolves into the purse on the way in
   * — "Zamień tę Kartę na 1 Sztukę Złota, a następnie ją odłóż" — and that
   * branch returned before either guard ran. So the one card in the box that
   * *is* gold could be taken over an unfought Wilk's head while the loose coins
   * beside it were refused: same rule, same square, two answers, decided by
   * which of the two shapes the money happened to be in.
   */
  it("holds the gold Karta to the same two exceptions as the coins", () => {
    const wilk = { cardId: "wilk", cardClass: "foe" as const, granted: false };
    const coin = { cardId: "1-sztuka-zlota", cardClass: "item" as const, granted: false };
    const guarded = table({
      game: { active_seat: 0, turn_state: only(arrived({ drawn: [wilk, coin] })) },
    });
    expect(() => takeCard(guarded, { seatId: "seat-a", cardId: "1-sztuka-zlota" })).toThrow(/WILK/);

    const owing = table({
      game: { active_seat: 0, turn_state: only(arrived({ draw: 1, drawn: [coin] })) },
    });
    expect(() => takeCard(owing, { seatId: "seat-a", cardId: "1-sztuka-zlota" })).toThrow(/12\.1b/);
  });

  /** 12.1b — and the same one about a square that still owes Karty. */
  it("refuses while the Obszar still owes Karty", () => {
    const owing = table({
      fieldGold: [{ id: "fg1", field_id: HERE, gold: 3 }],
      game: { active_seat: 0, turn_state: only(arrived({ draw: 1 })) },
    });
    expect(() => takeFieldGold(owing, { seatId: "seat-a", gold: 1 })).toThrow(/12\.1b/);
  });

  /** 3.5: "Sztuki Złota nie są wliczane do limitu Przedmiotów". */
  it("is not stopped by a full Plecak (3.5, 5.4)", () => {
    const full = withGold(3, {
      holdings: ["miecz", "helm", "tarcza", "zbroja"].map((cardId, at) =>
        aHolding({ id: `h${at}`, seat_id: "seat-a", card_id: cardId, kind: "item" }),
      ),
    });
    expect(takeFieldGold(full, { seatId: "seat-a", gold: 3 }).result.took).toBe(3);
  });
});

/* ==========================================================================
 * The console's two doors: coins conjured onto a square, and a square swept.
 * ======================================================================= */

describe("what the journal says about gold changing hands", () => {
  /**
   * Its own kind, and not `taken`.
   *
   * It rode on `taken` — the Przedmiot line — whose sentence names a Karta, so
   * a purse filled off an Obszar was written down as „zdobywa: kartę": a card
   * that was never there, on a turn where none was picked up. The rule went
   * wrong with it, because `RULE_FOR` keys off the kind: 16.6 is the Przedmiot
   * lying on the Obszar, and 12.1 is the sentence that names the gold.
   */
  it("files a purse filled off an Obszar under 12.1, not 16.6", () => {
    const before = table({
      seats: [aSeat({ id: "seat-a", seat_index: 0, field_id: HERE, gold: 0 })],
      fieldGold: [{ id: "fg-1", field_id: HERE, gold: 6 }],
    });
    const { writes } = takeFieldGold(before, { seatId: "seat-a", gold: 2 });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "gold-taken",
      payload: { gold: 2, fieldId: HERE },
    });
    expect(RULE_FOR["gold-taken"]).toBe("12.1");
  });
});

describe("placing gold by fiat", () => {
  it("lays it on the Obszar the Postać stands on", () => {
    const before = table();
    const { writes, result } = placeGold(before, { seatId: "seat-a", gold: 5, target: null });
    expect(result).toEqual({ fieldId: HERE, gold: 5 });
    expect(apply(before, writes).fieldGold.map((row) => row.gold)).toEqual([5]);
  });

  it("lays it on a named Obszar instead, without moving anybody", () => {
    const before = table();
    const there = asFieldId("karczma")!;
    const after = apply(before, placeGold(before, { seatId: "seat-a", gold: 2, target: there }).writes);
    expect(after.fieldGold.map((row) => [row.field_id, row.gold])).toEqual([[there, 2]]);
    expect(after.seats[0].field_id).toBe(HERE);
  });

  /**
   * Coins add up where Karty pile up. `dropGold` patches the row rather than
   * inserting a second, which is the same reason `merge` resolves a column as
   * later-wins: two rows for one square would be a total nobody adds.
   */
  it("adds to what is already lying there", () => {
    const before = apply(table(), placeGold(table(), { seatId: "seat-a", gold: 4, target: null }).writes);
    const after = apply(before, placeGold(before, { seatId: "seat-a", gold: 3, target: null }).writes);
    expect(after.fieldGold.map((row) => row.gold)).toEqual([7]);
  });

  /** Money out of nowhere is still money — 3.1's bank hands out what it is asked for. */
  it("takes nothing off anybody's purse", () => {
    const before = table();
    expect(apply(before, placeGold(before, { seatId: "seat-a", gold: 9, target: null }).writes).seats[0].gold)
      .toBe(3);
  });

  it("refuses an amount that is not a number of coins", () => {
    const before = table();
    for (const gold of [0, -2]) {
      expect(() => placeGold(before, { seatId: "seat-a", gold, target: null })).toThrow("Ile Sztuk Złota?");
    }
  });

  /**
   * The journal says a person did it, and `manual` is what marks it as the
   * console rather than the game. `test-gold-field` and not `test-card-field`:
   * the reader who follows the line has to find coins on that square, not a
   * Karta that is not there.
   */
  it("writes it down as the override it is", () => {
    const { writes } = placeGold(table(), { seatId: "seat-a", gold: 5, target: null });
    expect(writes.journal?.[0]).toMatchObject({
      kind: "test-gold-field",
      manual: true,
      payload: { gold: 5, fieldId: HERE },
    });
  });
});

describe("sweeping an Obszar takes the gold with the Karty", () => {
  const dressed = () => {
    const before = table();
    return apply(before, placeGold(before, { seatId: "seat-a", gold: 6, target: null }).writes);
  };

  it("leaves no coins behind, and says how many went", () => {
    const before = dressed();
    const { writes, result } = clearField(before, { seatId: "seat-a", fieldId: HERE });
    expect(result.gold).toBe(6);
    expect(apply(before, writes).fieldGold).toEqual([]);
  });

  /**
   * `clear` with a name takes the one thing named. Money has no name to type,
   * so a named sweep cannot be asking for it — and taking it anyway would be
   * the command doing something nobody typed.
   */
  it("leaves it alone when a single Karta is named", () => {
    const before = apply(dressed(), {
      fieldCards: { insert: [{ field_id: HERE, card_id: "targowisko", granted: true }] },
    });
    const { writes, result } = clearField(before, {
      seatId: "seat-a",
      fieldId: HERE,
      cardIds: ["targowisko"],
    });
    expect(result.gold).toBe(0);
    expect(apply(before, writes).fieldGold.map((row) => row.gold)).toEqual([6]);
  });

  /**
   * The coins named on their own, which bare `clear` takes anyway and
   * `clear MIECZ` leaves — so "just the money" had no way of being said, and
   * neither had "three of it". That second one is the only way to put a square
   * back to a particular amount, `place gold` being able only to add.
   */
  it("takes the gold alone, all of it or a stated amount, and leaves the Karty", () => {
    const before = apply(dressed(), {
      fieldCards: { insert: [{ field_id: HERE, card_id: "targowisko", granted: true }] },
    });

    const some = clearField(before, { seatId: "seat-a", fieldId: HERE, gold: 2 });
    expect(some.result).toEqual({ cards: [], gold: 2 });
    const left = apply(before, some.writes);
    expect(left.fieldGold.map((row) => row.gold)).toEqual([4]);
    expect(left.fieldCards.map((row) => row.card_id)).toEqual(["targowisko"]);

    const lot = clearField(before, { seatId: "seat-a", fieldId: HERE, gold: "all" });
    expect(lot.result.gold).toBe(6);
    expect(apply(before, lot.writes).fieldGold).toEqual([]);
    expect(apply(before, lot.writes).fieldCards.map((row) => row.card_id)).toEqual(["targowisko"]);
  });

  it("refuses more coins than are lying there, and refuses none", () => {
    const before = dressed();
    expect(() => clearField(before, { seatId: "seat-a", fieldId: HERE, gold: 9 })).toThrow(/tylko 6/);
    expect(() => clearField(before, { seatId: "seat-a", fieldId: HERE, gold: 0 })).toThrow(/Ile/);
    expect(() => clearField(table(), { seatId: "seat-a", fieldId: HERE, gold: "all" })).toThrow(
      /Nie ma tu złota/,
    );
  });

  /** A square holding nothing but coins is not an empty square. */
  it("sweeps a square whose only contents are gold", () => {
    const before = dressed();
    expect(() => clearField(before, { seatId: "seat-a", fieldId: HERE })).not.toThrow();
    expect(clearField(before, { seatId: "seat-a", fieldId: HERE }).result.cards).toEqual([]);
  });

  it("still refuses a square with nothing on it at all", () => {
    expect(() => clearField(table(), { seatId: "seat-a", fieldId: HERE })).toThrow(
      "Na tym Obszarze nic nie leży.",
    );
  });
});

/**
 * Whole kinds at a time — `clear strangers, places`.
 *
 * Dressing a test table puts six Karty on one Obszar, and „take the Nieznajomi
 * off and leave the Wrogowie" was six lines and knowing every name on the
 * square first.
 */
describe("sweeping an Obszar by kind", () => {
  /** A Nieznajomy, a Miejsce, a Wróg II and a Wróg III, all lying on one square. */
  const crowded = () =>
    apply(table(), {
      fieldCards: {
        insert: ["cudotworca", "targowisko", "cyklop", "demon"].map((card_id) => ({
          field_id: HERE,
          card_id,
          granted: true,
        })),
      },
    });

  const left = (before: ReturnType<typeof crowded>, command: Parameters<typeof clearField>[1]) =>
    apply(before, clearField(before, command).writes).fieldCards.map((row) => row.card_id);

  it("takes the named kind and leaves the rest", () => {
    const before = crowded();
    expect(left(before, { seatId: "seat-a", fieldId: HERE, classes: ["stranger"] })).toEqual([
      "targowisko",
      "cyklop",
      "demon",
    ]);
  });

  it("takes several kinds in one sweep", () => {
    const before = crowded();
    expect(left(before, { seatId: "seat-a", fieldId: HERE, classes: ["stranger", "place"] })).toEqual([
      "cyklop",
      "demon",
    ]);
  });

  /**
   * II and III are two resolution classes and one kind of thing — 16.2 and 16.3
   * name them apart only to order them, while 1.4, 12.1a and 13.5 all say Wróg
   * and mean both.
   */
  it("takes both numerals of Wróg under one word", () => {
    const before = crowded();
    expect(left(before, { seatId: "seat-a", fieldId: HERE, classes: ["foe", "demon"] })).toEqual([
      "cudotworca",
      "targowisko",
    ]);
  });

  /**
   * Every copy, unlike a named Karta, which takes one. „Take the Miejsca off"
   * means all of them, and asking for one of a kind has no way to say which.
   */
  it("takes every copy of the kind, not one", () => {
    const before = apply(table(), {
      fieldCards: {
        insert: ["targowisko", "targowisko", "cyklop"].map((card_id) => ({
          field_id: HERE,
          card_id,
          granted: true,
        })),
      },
    });
    expect(left(before, { seatId: "seat-a", fieldId: HERE, classes: ["place"] })).toEqual(["cyklop"]);
  });

  /**
   * The coins stay unless they were named beside it. `clear places` names Karty
   * and nothing else, exactly as `clear TARGOWISKO` does; only bare `clear` and
   * a list with `gold` in it take the money.
   */
  it("leaves the gold alone unless it was asked for", () => {
    const before = apply(crowded(), {
      fieldGold: { insert: [{ field_id: HERE, gold: 6 }] },
    });
    const kept = clearField(before, { seatId: "seat-a", fieldId: HERE, classes: ["place"] });
    expect(kept.result.gold).toBe(0);
    expect(apply(before, kept.writes).fieldGold.map((row) => row.gold)).toEqual([6]);

    const swept = clearField(before, {
      seatId: "seat-a",
      fieldId: HERE,
      classes: ["place"],
      gold: "all",
    });
    expect(swept.result).toEqual({ cards: ["targowisko"], gold: 6 });
    expect(apply(before, swept.writes).fieldGold).toEqual([]);
  });

  /** A kind that is not here is worth saying, the way a named Karta that is not here is. */
  it("says so when nothing of that kind is lying here", () => {
    const before = crowded();
    expect(() =>
      clearField(before, { seatId: "seat-a", fieldId: HERE, classes: ["friend"] }),
    ).toThrow(/Przyjaciel — nic z tego tu nie leży/);
  });

  /**
   * And the Karty the turn is holding face up, which are on the Obszar just as
   * much (16.8) — the half `clear` had to learn about for a named card too.
   */
  it("reaches the Karty lifted into the turn's own frame", () => {
    const before = table({
      game: {
        active_seat: 0,
        turn_state: only({
          phase: "field",
          fieldId: HERE,
          from: null,
          draw: 0,
          drawn: [
            { cardId: "cudotworca", cardClass: "stranger" },
            { cardId: "cyklop", cardClass: "foe" },
          ],
          fought: [],
        } as never),
      },
    });
    const { result, writes } = clearField(before, {
      seatId: "seat-a",
      fieldId: HERE,
      classes: ["stranger"],
    });
    expect(result.cards).toEqual(["cudotworca"]);
    const frame = top(apply(before, writes).game.turn_state) as { drawn: { cardId: string }[] };
    expect(frame.drawn.map((one) => one.cardId)).toEqual(["cyklop"]);
  });
});

/**
 * Several Karty by name, mirroring `deal`.
 *
 * A named Karta has always taken one copy — a square can hold two Targowiska
 * and "take that one off" is the likelier wish — and a list is that rule said
 * several times, which is what makes a repeated name mean a second copy.
 */
describe("sweeping several named Karty", () => {
  const twoOfEach = () =>
    apply(table(), {
      fieldCards: {
        insert: ["miecz", "miecz", "helm", "cudotworca"].map((card_id) => ({
          field_id: HERE,
          card_id,
          granted: true,
        })),
      },
    });

  const left = (before: ReturnType<typeof twoOfEach>, command: Parameters<typeof clearField>[1]) =>
    apply(before, clearField(before, command).writes).fieldCards.map((row) => row.card_id);

  it("takes one copy of each name", () => {
    const before = twoOfEach();
    expect(left(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["miecz", "helm"] })).toEqual([
      "miecz",
      "cudotworca",
    ]);
  });

  /**
   * The claim is what makes this work. Filtering by id would have matched the
   * same row twice and reported two Miecze while taking one.
   */
  it("takes two copies when the name is given twice", () => {
    const before = twoOfEach();
    expect(left(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["miecz", "miecz"] })).toEqual([
      "helm",
      "cudotworca",
    ]);
  });

  /** And asking for more copies than are there is a miss, not a smaller sweep. */
  it("refuses when a name has run out of copies", () => {
    const before = twoOfEach();
    expect(() =>
      clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["helm", "helm"] }),
    ).toThrow(/HEŁM nie leży na tym Obszarze/);
  });

  it("names every one it could not find", () => {
    const before = twoOfEach();
    expect(() =>
      clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["zbroja", "latarnia"] }),
    ).toThrow(/Nie leżą na tym Obszarze: ZBROJA, LATARNIA/);
  });

  /** Names and kinds in one sweep, because one line may hold both. */
  it("takes named Karty and whole kinds together", () => {
    const before = twoOfEach();
    expect(
      left(before, {
        seatId: "seat-a",
        fieldId: HERE,
        cardIds: ["helm"],
        classes: ["stranger"],
      }),
    ).toEqual(["miecz", "miecz"]);
  });

  /** The coins stay unless the money was named, exactly as for one Karta. */
  it("leaves the gold alone unless it was asked for", () => {
    const before = apply(twoOfEach(), { fieldGold: { insert: [{ field_id: HERE, gold: 5 }] } });
    expect(clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["helm"] }).result.gold).toBe(0);
    expect(
      clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["helm"], gold: "all" }).result,
    ).toEqual({ cards: ["helm"], gold: 5 });
  });

  /**
   * And an amount beside a Karta takes that much, not the purse.
   *
   * The amount could only reach `sweepGold` before, which is the path a line
   * naming nothing else takes — so `clear strangers, gold 2` swept all five and
   * said so.
   */
  it("takes the stated amount when Karty are named beside it", () => {
    const before = apply(twoOfEach(), { fieldGold: { insert: [{ field_id: HERE, gold: 5 }] } });
    const some = clearField(before, {
      seatId: "seat-a",
      fieldId: HERE,
      cardIds: ["helm"],
      gold: 2,
    });
    expect(some.result).toEqual({ cards: ["helm"], gold: 2 });
    expect(apply(before, some.writes).fieldGold.map((row) => row.gold)).toEqual([3]);
  });

  it("refuses more coins than are lying there, on this path too", () => {
    const before = apply(twoOfEach(), { fieldGold: { insert: [{ field_id: HERE, gold: 5 }] } });
    expect(() =>
      clearField(before, { seatId: "seat-a", fieldId: HERE, classes: ["stranger"], gold: 9 }),
    ).toThrow(/tylko 5/);
  });
});

/**
 * Which copy a name takes, when the square holds more than one.
 *
 * `clear` is the undo for `place` and `deal`, so the copy you mean is almost
 * always the one you just conjured — and if none of them was conjured, the one
 * that arrived last.
 */
describe("choosing between duplicate Karty", () => {
  /** `granted` is what a test shortcut leaves on a card; a drawn one has none. */
  const onBoard = (rows: { card_id: string; granted: boolean }[]) =>
    apply(table(), {
      fieldCards: { insert: rows.map((row) => ({ field_id: HERE, ...row })) },
    });

  const swept = (before: ReturnType<typeof onBoard>, cardIds: string[]) => {
    const after = apply(before, clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds }).writes);
    return before.fieldCards
      .filter((row) => !after.fieldCards.some((one) => one.id === row.id))
      .map((row) => `${row.card_id}${row.granted ? " (granted)" : ""}`);
  };

  it("takes the conjured copy before the real one, whichever came first", () => {
    // Conjured first, drawn second — so "newest" would have taken the wrong one.
    expect(
      swept(onBoard([
        { card_id: "miecz", granted: true },
        { card_id: "miecz", granted: false },
      ]), ["miecz"]),
    ).toEqual(["miecz (granted)"]);

    // And the other way round, where the two keys agree.
    expect(
      swept(onBoard([
        { card_id: "miecz", granted: false },
        { card_id: "miecz", granted: true },
      ]), ["miecz"]),
    ).toEqual(["miecz (granted)"]);
  });

  /**
   * With nothing to choose on the first key, the newest goes. `field_cards` is
   * read `order by created_at`, so the last row of the list is the last to
   * arrive — which is why this is a rule and not a guess.
   */
  it("takes the newest when they are all conjured, or all real", () => {
    const same = (granted: boolean) =>
      apply(table(), {
        fieldCards: {
          insert: [
            { field_id: HERE, card_id: "miecz", granted, pool: 1 },
            { field_id: HERE, card_id: "miecz", granted, pool: 2 },
            { field_id: HERE, card_id: "miecz", granted, pool: 3 },
          ],
        },
      });
    for (const granted of [true, false]) {
      const before = same(granted);
      const after = apply(
        before,
        clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["miecz"] }).writes,
      );
      // `pool` stands in for arrival here: 3 was inserted last and is the one
      // that should go, leaving 1 and 2.
      expect(after.fieldCards.map((row) => row.pool), `granted=${granted}`).toEqual([1, 2]);
    }
  });

  /** Two names take two copies, and the ranking runs for each in turn. */
  it("works down the ranking when the same name is given twice", () => {
    expect(
      swept(onBoard([
        { card_id: "miecz", granted: false },
        { card_id: "miecz", granted: true },
        { card_id: "miecz", granted: false },
      ]), ["miecz", "miecz"]),
    ).toEqual(["miecz (granted)", "miecz"]);
  });

  /**
   * And a Karta the turn is holding face up loses to one lying on the board,
   * because arriving lifts every row into the turn — so a row still there is
   * one `place`d since, and newer than anything drawn.
   */
  it("prefers a row placed since arrival over one lifted into the turn", () => {
    const before = apply(
      table({
        game: {
          active_seat: 0,
          turn_state: only({
            phase: "field",
            fieldId: HERE,
            from: null,
            draw: 0,
            drawn: [{ cardId: "miecz", cardClass: "item" }],
            fought: [],
          } as never),
        },
      }),
      { fieldCards: { insert: [{ field_id: HERE, card_id: "miecz", granted: false }] } },
    );
    const after = apply(
      before,
      clearField(before, { seatId: "seat-a", fieldId: HERE, cardIds: ["miecz"] }).writes,
    );
    expect(after.fieldCards).toEqual([]);
    expect((top(after.game.turn_state) as { drawn: unknown[] }).drawn).toHaveLength(1);
  });
});
