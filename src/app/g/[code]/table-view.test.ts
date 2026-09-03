import { describe, expect, it } from "vitest";
import { asFieldId } from "@/lib/engine/board";
import {
  asPublicSeat,
  boardCards,
  driverOf,
  otherSeats,
  pickingFor,
  tableScreenHolder,
} from "./table-view";
import type { Seat } from "./table";
import type { FieldCard, Person } from "./use-table";

const person = (over: Partial<Person> = {}): Person => ({
  id: "u-a",
  name: "Ania",
  isHost: false,
  ready: true,
  seatIndex: 0,
  away: false,
  ...over,
});

const seat = (over: Partial<Seat> = {}) =>
  ({
    id: "seat-a",
    seat_index: 0,
    player_name: null,
    character_id: "goblin",
    driver_id: "u-a",
    eliminated: false,
    field_id: asFieldId("mroczna-polana"),
    holdings: [],
    ...over,
  }) as unknown as Seat;

const lying = (over: Partial<FieldCard> = {}): FieldCard =>
  ({ id: "fc-1", fieldId: asFieldId("plaskowyz-mgiel")!, cardId: "grota", ...over }) as FieldCard;

describe("who is driving a chair", () => {
  it("finds the person by the seat's driver_id", () => {
    const users = [person({ id: "u-a" }), person({ id: "u-b", name: "Bartek" })];
    expect(driverOf(users, seat({ driver_id: "u-b" }))?.name).toBe("Bartek");
  });

  it("is nobody for an empty chair, and for no chair at all", () => {
    expect(driverOf([person()], seat({ driver_id: null }))).toBeNull();
    expect(driverOf([person()], null)).toBeNull();
    expect(driverOf([person()], undefined)).toBeNull();
  });

  it("names the host as holding the shared screen", () => {
    expect(tableScreenHolder([person({ isHost: false }), person({ id: "u-b", name: "B", isHost: true })])).toBe("B");
    expect(tableScreenHolder([person({ isHost: false })])).toBeNull();
  });
});

describe("the other seats", () => {
  it("leaves out your own and anyone without a Postać", () => {
    const seats = [
      seat({ id: "seat-a" }),
      seat({ id: "seat-b", seat_index: 1 }),
      seat({ id: "seat-c", seat_index: 2, character_id: null }),
    ];
    expect(otherSeats(seats, "seat-a").map((one) => one.id)).toEqual(["seat-b"]);
  });
});

describe("whose Postać is being chosen", () => {
  const empty = seat({ id: "seat-a", character_id: null });

  it("is your own seat while it is still empty", () => {
    expect(pickingFor("auto", [empty], empty, false)?.id).toBe("seat-a");
  });

  it("is nobody once your own seat is filled and you are not hosting a companion table", () => {
    const mine = seat({ id: "seat-a" });
    expect(pickingFor("auto", [mine], mine, false)).toBeNull();
  });

  /**
   * The bug this function was extracted with: it used to fall through to *any*
   * characterless seat, so opening a table could leave you aiming at somebody
   * else's slot. A chair only counts when nobody is driving it either.
   */
  it("only offers a chair nobody is driving, and only to a companion host", () => {
    const mine = seat({ id: "seat-a" });
    const theirs = seat({ id: "seat-b", seat_index: 1, character_id: null, driver_id: "u-b" });
    const nobodys = seat({ id: "seat-c", seat_index: 2, character_id: null, driver_id: null });

    expect(pickingFor("auto", [mine, theirs], mine, true)).toBeNull();
    expect(pickingFor("auto", [mine, theirs, nobodys], mine, true)?.id).toBe("seat-c");
  });

  it("takes a named seat as asked, whatever else is true", () => {
    const mine = seat({ id: "seat-a", character_id: null });
    const named = seat({ id: "seat-b", seat_index: 1 });
    expect(pickingFor("seat-b", [mine, named], mine, false)?.id).toBe("seat-b");
    expect(pickingFor("seat-z", [mine, named], mine, false)).toBeNull();
  });
});

describe("the Karty lying on the board", () => {
  it("names each card and where it lies", () => {
    const [card] = boardCards([lying()], []);
    expect(card.name).toBe("GROTA");
    expect(card.where).toBe("Płaskowyż Mgieł");
  });

  /**
   * „Na innym Obszarze w tym samym Kręgu", and „nowy Obszar nie może być zajęty
   * przez inną Postać" — both halves of what the Władca Zdarzeń may do.
   */
  it("offers every other Obszar in the same Krąg, and not its own", () => {
    const [card] = boardCards([lying()], []);
    expect(card.moveTo.map((one) => one.fieldId)).not.toContain("plaskowyz-mgiel");
    expect(card.moveTo.length).toBeGreaterThan(0);
    // Same ring only: the Płaskowyż is Środkowy, so Uroczysko — which is in
    // the Dolny Krąg — is not on the list.
    expect(card.moveTo.map((one) => one.fieldId)).not.toContain("uroczysko");
  });

  it("strikes off an Obszar somebody is standing on", () => {
    const standing = seat({ field_id: asFieldId("swiatynia-bogini-nemed") });
    const [card] = boardCards([lying()], [standing]);
    expect(card.moveTo.map((one) => one.fieldId)).not.toContain("swiatynia-bogini-nemed");
  });

  it("ignores a Postać that is out of the game (4.4)", () => {
    const dead = seat({ field_id: asFieldId("swiatynia-bogini-nemed"), eliminated: true });
    const [card] = boardCards([lying()], [dead]);
    expect(card.moveTo.map((one) => one.fieldId)).toContain("swiatynia-bogini-nemed");
  });
});

/**
 * What the table is allowed to see of somebody else's Postać.
 *
 * The first thing asked of this since it stopped being a closure inside a
 * 2900-line component, and the question worth asking first is the one about
 * secrecy: 9.3 says a player's Zaklęcia are theirs, so what crosses to the
 * roster is a *count* and never a card. That was decided in a `.map()` nobody
 * could reach.
 */
describe("a rival's Postać, as everybody else may see it", () => {
  const withCards = (over: Partial<Seat> = {}) =>
    seat({
      holdings: [
        { id: "h-1", cardId: "miecz", kind: "item", slot: "hand-main" },
        { id: "h-2", cardId: "zaklecie-a", kind: "spell", slot: null },
        { id: "h-3", cardId: "zaklecie-b", kind: "spell", slot: null },
      ],
      hidden_count: 0,
      ...over,
    } as Partial<Seat>);

  it("counts the Zaklęcia and names none of them (9.3)", () => {
    const seen = asPublicSeat(withCards(), null);
    expect(seen.hiddenSpells).toBe(2);
    expect(seen.cards.map((one) => one.cardId)).toEqual(["miecz"]);
  });

  /**
   * A Zaklęcie the server never sent and one it sent face down are the same
   * secret, and the roster shows one number for both — otherwise the count
   * itself would say which kind you were holding.
   */
  it("adds the ones the server withheld to the ones it sent", () => {
    expect(asPublicSeat(withCards({ hidden_count: 3 } as Partial<Seat>), null).hiddenSpells).toBe(5);
  });

  it("prints the Obszar's name, and a dash for a Postać not yet on the board", () => {
    expect(asPublicSeat(withCards(), null).fieldName).toBe("Mroczna Polana");
    expect(asPublicSeat(withCards({ field_id: null } as Partial<Seat>), null).fieldName).toBe("—");
  });

  /** The chair carries the fallback name; a driver's own name wins over it. */
  it("prefers the driver's name to the chair's", () => {
    expect(asPublicSeat(withCards({ player_name: "krzesło" } as Partial<Seat>), null).playerName).toBe("krzesło");
    expect(asPublicSeat(withCards(), person({ name: "Ola" })).playerName).toBe("Ola");
  });
});
