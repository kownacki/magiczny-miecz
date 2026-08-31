import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { aHolding, aSeat, aTable } from "../fixture";
import { seatView, setEndlessStock } from "./seat";

const view = (
  seat: Parameters<typeof aSeat>[0] = {},
  holdings: ReturnType<typeof aHolding>[] = [],
  eq: "classic" | "slots" = "classic",
) =>
  seatView(
    aTable({ game: { eq_mode: eq }, seats: [aSeat({ id: "seat-a", ...seat })], holdings }),
    "seat-a",
  );

describe("what a seat is worth (1.5, 2.5)", () => {
  /** Only own points are stored; the rest is added at read time, never written. */
  it("adds what the cards lend to what the character owns", () => {
    const bare = view({ sword_own: 2, magic_own: 1 });
    expect(bare.parametr).toEqual({ miecz: 2, magia: 1 });

    // Srebrna Strzała and not a weapon: every weapon in the box says "w walce"
    // and so lends nothing to the parametr (1.5).
    const armed = view({ sword_own: 2, magic_own: 1 }, [
      aHolding({ id: "h1", card_id: "srebrna-strzala", kind: "item" }),
    ]);
    expect(armed.parametr.miecz).toBeGreaterThan(2);
  });

  /**
   * 1.5's own example: the Troll's parametr Miecza is 8 and he is worth 11
   * podczas walki. Two numbers, and the card carries the first.
   */
  it("keeps the parameter and the fight strength apart", () => {
    const v = view({ sword_own: 3 }, [aHolding({ id: "h1", card_id: "excalibur", kind: "item" })]);
    expect(v.walka.miecz).toBeGreaterThanOrEqual(v.parametr.miecz);
  });

  it("counts nothing from a trofeum, which is a card kept to trade (1.4)", () => {
    const v = view({ sword_own: 2 }, [
      aHolding({ id: "t1", card_id: "excalibur", kind: "trophy" }),
    ]);
    expect(v.parametr).toEqual({ miecz: 2, magia: 1 });
  });
});

describe("what a card lends, and where", () => {
  /**
   * In slotowy a card works where it is worn and nowhere else, which is what
   * `abilities` reads — but the Różdżka says "Właściciel", so `fromCards` reads
   * the pack too. The two are different questions with different answers.
   */
  it("reads worn cards for what happens to the character", () => {
    const packed = view({}, [aHolding({ id: "h1", card_id: "kon", kind: "friend", slot: null })], "slots");
    const worn = view(
      {},
      [aHolding({ id: "h1", card_id: "kon", kind: "friend", slot: "mount" })],
      "slots",
    );
    expect(worn.abilities.length).toBeGreaterThan(packed.abilities.length);
  });

  it("reads owned cards for what the character has, worn or not", () => {
    const packed = view({}, [aHolding({ id: "h1", card_id: "rozdzka-zaklec", kind: "item" })], "slots");
    expect(packed.fromCards.length).toBeGreaterThan(0);
  });

  it("gives a character its own abilities as well as its cards'", () => {
    const kat = view({ character_id: asSeatCharacter("kat") });
    const nobody = view({ character_id: null });
    expect(kat.abilities.length).toBeGreaterThanOrEqual(nobody.abilities.length);
  });

  /** What a character *is* is not a card, so it is not in `fromCards`. */
  it("keeps the character out of what the cards lend", () => {
    expect(view({ character_id: asSeatCharacter("kat") }).fromCards).toEqual([]);
  });
});

describe("the limits on a hand", () => {
  it("counts the pack against 5.4 and leaves the relics out", () => {
    const v = view({}, [
      aHolding({ id: "h1", card_id: "helm", kind: "item" }),
      aHolding({ id: "h2", card_id: "magiczny-miecz", kind: "item" }),
    ]);
    expect(v.carried).toBe(1);
    expect(v.carryLimit).toBe(4);
  });

  /** 2.6's table, floored by the Różdżka rather than added to (`spellAllowance`). */
  it("works the spell limit off the parameter, not off the total", () => {
    expect(view({ magic_own: 1 }).spellCapacity).toBe(0);
    expect(view({ magic_own: 4 }).spellCapacity).toBeGreaterThan(0);
  });
});

describe("what a seat is to everybody else", () => {
  it("is the shape the targeting rules read", () => {
    const v = view({
      seat_index: 2,
      nature: "evil",
      field_id: asFieldId("karczma"),
      character_id: asSeatCharacter("kat"),
    });
    expect(v.asTarget).toEqual({
      seatIndex: 2,
      characterId: "kat",
      fieldId: "karczma",
      nature: "evil",
      eliminated: false,
    });
  });

  it("reads a Natura the column cannot hold as none at all", () => {
    expect(view({ nature: "nonsense" as never }).nature).toBeNull();
  });

  it("refuses a seat that is not there", () => {
    expect(() => seatView(aTable(), "nobody")).toThrow(/Nieznane miejsce/);
  });
});

describe("what a character is under", () => {
  it("folds the stored effects together with the columns the turn engine reads", () => {
    const table = aTable({
      game: { round: 5 },
      seats: [aSeat({ id: "seat-a", turns_lost: 1, stone_until_round: 7 })],
      effects: [
        {
          id: "e1",
          seat_id: "seat-a",
          source: "Eliksir",
          label: "+2 Miecza",
          modifier: { kind: "points", miecz: 2 },
          ends: { kind: "turns", turns: 1 },
        },
      ],
    });
    const kinds = seatView(table, "seat-a").statuses.map((s) => s.source);
    expect(kinds).toContain("Eliksir");
    // One list, whichever half of the model the effect lives in.
    expect(seatView(table, "seat-a").statuses.length).toBeGreaterThan(1);
  });
});

/* --------------------------------------------------------------------------
 * The one Obszar that changes what a card is worth.
 * ----------------------------------------------------------------------- */

describe("Zaczarowane Wzgórza", () => {
  /**
   * The board's own words: "Na tym Obszarze nie możesz liczyć na Miecz i Magię
   * czerpane z Przedmiotów i Przedmiotów Magicznych. Nie możesz też rzucać
   * Zaklęć."
   *
   * Every Przedmiot, not only the magical ones — the sentence names the magical
   * ones as well as, not instead of.
   */
  const withSword = (fieldId: string) =>
    view({ sword_own: 2, field_id: asFieldId(fieldId) }, [
      aHolding({ id: "h1", card_id: "srebrna-strzala", kind: "item" }),
    ]);

  it("suspends what a Przedmiot lends while a character stands there", () => {
    const away = withSword("mroczna-polana");
    const here = withSword("zaczarowane-wzgorza");
    expect(away.parametr.miecz).toBeGreaterThan(2);
    expect(here.parametr.miecz).toBe(2);
    expect(here.walka.miecz).toBe(2);
  });

  /** Przyjaciele are not Przedmioty, and the sentence names Przedmioty. */
  it("leaves the Przyjaciele lending what they lend", () => {
    const friend = (fieldId: string) =>
      view({ sword_own: 2, field_id: asFieldId(fieldId) }, [
        aHolding({ id: "f1", card_id: "rusalka", kind: "friend" }),
      ]);
    expect(friend("zaczarowane-wzgorza").parametr).toEqual(
      friend("mroczna-polana").parametr,
    );
  });

  it("gives the points back the moment the character leaves", () => {
    expect(withSword("mroczna-polana").parametr.miecz).toBeGreaterThan(
      withSword("zaczarowane-wzgorza").parametr.miecz,
    );
  });
});

/**
 * 21.2's pile, which can be given up but not taken back — after the start.
 *
 * The refusal is about what is already on the table: by then there may be six
 * Miecze on a board the finite pile holds five of, and switching back would
 * make the app start refusing cards people are holding. None of that is true in
 * the poczekalnia, where nothing has been dealt — and a setting you cannot take
 * back while still choosing your Postać is a trap rather than a rule.
 */
describe("the finite pile, before and after the start (21.2)", () => {
  const lobby = (endless: boolean) =>
    aTable({ game: { status: "lobby", endless_stock: endless }, seats: [aSeat()] });
  const playing = (endless: boolean) =>
    aTable({ game: { endless_stock: endless }, seats: [aSeat()] });

  it("goes back to the box's pile while the table is still filling up", () => {
    expect(setEndlessStock(lobby(true), { on: false }).writes.game).toEqual({
      endless_stock: false,
    });
  });

  it("refuses to go back once the game has started", () => {
    expect(() => setEndlessStock(playing(true), { on: false })).toThrow(/otwórz nowy stół/);
  });

  it("writes nothing when it is already off and asked for off", () => {
    expect(setEndlessStock(lobby(false), { on: false }).writes).toEqual({});
  });

  it("can still be turned on mid-game, which was always allowed", () => {
    // Turning it ON changes nothing that already happened: the pile simply
    // stops being counted from here.
    expect(setEndlessStock(playing(false), { on: true }).writes.game).toEqual({
      endless_stock: true,
    });
  });
});
