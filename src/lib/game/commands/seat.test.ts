import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { aHolding, aSeat, aTable } from "../fixture";
import { seatView } from "./seat";

const view = (
  seat: Parameters<typeof aSeat>[0] = {},
  holdings: ReturnType<typeof aHolding>[] = [],
  eq: "klasyczny" | "slotowy" = "klasyczny",
) =>
  seatView(
    aTable({ game: { eq_mode: eq }, seats: [aSeat({ id: "seat-a", ...seat })], holdings }),
    "seat-a",
  );

describe("what a seat is worth (1.5, 2.5)", () => {
  /** Only own points are stored; the rest is added at read time, never written. */
  it("adds what the cards lend to what the character owns", () => {
    const bare = view({ miecz_own: 2, magia_own: 1 });
    expect(bare.parametr).toEqual({ miecz: 2, magia: 1 });

    const armed = view({ miecz_own: 2, magia_own: 1 }, [
      aHolding({ id: "h1", card_id: "excalibur", kind: "item" }),
    ]);
    expect(armed.parametr.miecz).toBeGreaterThan(2);
  });

  /**
   * 1.5's own example: the Troll's parametr Miecza is 8 and he is worth 11
   * podczas walki. Two numbers, and the card carries the first.
   */
  it("keeps the parameter and the fight strength apart", () => {
    const v = view({ miecz_own: 3 }, [aHolding({ id: "h1", card_id: "excalibur", kind: "item" })]);
    expect(v.walka.miecz).toBeGreaterThanOrEqual(v.parametr.miecz);
  });

  it("counts nothing from a trofeum, which is a card kept to trade (1.4)", () => {
    const v = view({ miecz_own: 2 }, [
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
    const packed = view({}, [aHolding({ id: "h1", card_id: "kon", kind: "friend", slot: null })], "slotowy");
    const worn = view(
      {},
      [aHolding({ id: "h1", card_id: "kon", kind: "friend", slot: "wierzchowiec" })],
      "slotowy",
    );
    expect(worn.abilities.length).toBeGreaterThan(packed.abilities.length);
  });

  it("reads owned cards for what the character has, worn or not", () => {
    const packed = view({}, [aHolding({ id: "h1", card_id: "rozdzka-zaklec", kind: "item" })], "slotowy");
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
    expect(view({ magia_own: 1 }).spellCapacity).toBe(0);
    expect(view({ magia_own: 4 }).spellCapacity).toBeGreaterThan(0);
  });
});

describe("what a seat is to everybody else", () => {
  it("is the shape the targeting rules read", () => {
    const v = view({
      seat_index: 2,
      nature: "zla",
      field_id: asFieldId("karczma"),
      character_id: asSeatCharacter("kat"),
    });
    expect(v.asTarget).toEqual({
      seatIndex: 2,
      characterId: "kat",
      fieldId: "karczma",
      nature: "zla",
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
      game: { turn: 5 },
      seats: [aSeat({ id: "seat-a", turns_lost: 1, stone_until_turn: 7 })],
      effects: [
        {
          id: "e1",
          seat_id: "seat-a",
          source: "Eliksir",
          label: "+2 Miecza",
          modifier: { kind: "punkty", miecz: 2 },
          ends: { kind: "tur", turns: 1 },
        },
      ],
    });
    const kinds = seatView(table, "seat-a").statuses.map((s) => s.source);
    expect(kinds).toContain("Eliksir");
    // One list, whichever half of the model the effect lives in.
    expect(seatView(table, "seat-a").statuses.length).toBeGreaterThan(1);
  });
});
