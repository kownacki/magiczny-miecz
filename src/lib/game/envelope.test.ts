import { describe, expect, it } from "vitest";
import { envelopeFor, withoutDeck } from "./envelope";
import { aHolding, aSeat, aTable } from "./fixture";
import { AWAY_AFTER_MS } from "./store";

/**
 * The secret this file is here to keep.
 *
 * 9.3 holds a spell hand concealed, and in simulation the app is the one
 * keeping it: the cards are rows in a table nobody's browser may query, so the
 * only thing between one player's hand and another player's screen is the
 * comparison in `envelopeFor` that decides whose seat is whose. `visibleTo` has
 * had tests since it was written. The wiring around it never did, because it
 * lived in a route handler and reaching it meant a database.
 *
 * The failure it guards against is silent. Invert that comparison and every
 * device is sent every hand, every screen still renders, nothing throws, and no
 * test goes red — you find out when somebody at the table says they can see
 * what you are holding. So the assertions below are mostly about absence, and
 * one of them reads the whole payload as text, because a leak does not care
 * which field it came out of.
 */

const NOW = Date.parse("2026-01-01T12:00:00Z");

/** Two seats, each holding one concealed Zaklęcie and one open Przedmiot. */
function twoHands() {
  return aTable({
    seats: [
      aSeat({ id: "seat-a", seat_index: 0, player_name: "Michał" }),
      aSeat({ id: "seat-b", seat_index: 1, player_name: "Ola", is_host: false }),
    ],
    holdings: [
      aHolding({ id: "a-spell", seat_id: "seat-a", card_id: "blyskawica", kind: "spell", face: "hidden" }),
      aHolding({ id: "a-helm", seat_id: "seat-a", card_id: "helm" }),
      aHolding({ id: "b-spell", seat_id: "seat-b", card_id: "uzdrowienie", kind: "spell", face: "hidden" }),
      aHolding({ id: "b-helm", seat_id: "seat-b", card_id: "helm" }),
    ],
  });
}

const seatIn = (envelope: ReturnType<typeof envelopeFor>, id: string) =>
  envelope.seats.find((seat) => seat.id === id)!;

describe("a concealed hand (9.3)", () => {
  it("sends a seat its own Zaklęcie in full", () => {
    const mine = seatIn(envelopeFor(twoHands(), "seat-a", NOW), "seat-a");
    expect(mine.holdings.map((card) => card.cardId)).toEqual(["blyskawica", "helm"]);
    expect(mine.hidden_count).toBe(0);
  });

  it("sends the other seat a count instead of the card", () => {
    const theirs = seatIn(envelopeFor(twoHands(), "seat-a", NOW), "seat-b");
    expect(theirs.holdings.map((card) => card.cardId)).toEqual(["helm"]);
    expect(theirs.hidden_count).toBe(1);
  });

  /**
   * The one that catches an inverted comparison.
   *
   * Each of the two assertions above passes on its own if `own` is computed
   * backwards — the shapes are symmetrical, and a test that only ever asks one
   * device about one hand cannot tell which way round it went. Asking both
   * devices about both hands can: exactly one seat sees each Zaklęcie, and it
   * is the seat holding it.
   */
  it("gives each Zaklęcie to exactly one device, and it is its owner's", () => {
    const toA = envelopeFor(twoHands(), "seat-a", NOW);
    const toB = envelopeFor(twoHands(), "seat-b", NOW);
    const sees = (envelope: ReturnType<typeof envelopeFor>, seatId: string, cardId: string) =>
      seatIn(envelope, seatId).holdings.some((card) => card.cardId === cardId);

    expect(sees(toA, "seat-a", "blyskawica")).toBe(true);
    expect(sees(toB, "seat-b", "blyskawica")).toBe(false);
    expect(sees(toB, "seat-b", "uzdrowienie")).toBe(true);
    expect(sees(toA, "seat-b", "uzdrowienie")).toBe(false);
  });

  /**
   * Absence from the whole payload, not from the field we thought to look at.
   *
   * A card id that reaches the browser has leaked wherever it is written —
   * inside an effect's `source`, inside the used pile, inside a field's list.
   * The rendered fields are checked above; this checks the bytes.
   */
  it("does not carry another seat's card anywhere in what is sent", () => {
    const wire = JSON.stringify(envelopeFor(twoHands(), "seat-a", NOW));
    expect(wire).toContain("blyskawica");
    expect(wire).not.toContain("uzdrowienie");
  });

  it("conceals every hand from a device that has proved nothing", () => {
    // No token: the table screen, or a browser watching a game it never
    // joined. Nothing is its own, so nothing is its own to see — the strict
    // case, rather than a missing one.
    const anonymous = envelopeFor(twoHands(), null, NOW);
    expect(anonymous.mySeatIndex).toBeNull();
    expect(anonymous.seats.map((seat) => seat.hidden_count)).toEqual([1, 1]);
    expect(JSON.stringify(anonymous)).not.toContain("blyskawica");
  });

  it("treats a seat id that is not at this table as no seat at all", () => {
    const stranger = envelopeFor(twoHands(), "seat-from-another-game", NOW);
    expect(stranger.mySeatIndex).toBeNull();
    expect(stranger.seats.map((seat) => seat.hidden_count)).toEqual([1, 1]);
  });

  it("hides nothing at a physical table", () => {
    // In companion mode the cards are in people's hands and the app is not the
    // one keeping the secret — see `visibleTo`.
    const table = twoHands();
    table.game.mode = "companion";
    const theirs = seatIn(envelopeFor(table, "seat-a", NOW), "seat-b");
    expect(theirs.holdings.map((card) => card.cardId)).toEqual(["uzdrowienie", "helm"]);
    expect(theirs.hidden_count).toBe(0);
  });
});

describe("what is public even when its source is not", () => {
  /**
   * A character's strength is public; what it is made of is not.
   *
   * Which means the numbers must not move with the viewer. If concealment ever
   * started subtracting the hidden cards it hides, the other players would be
   * reading a weaker character than the one they are about to attack, and 1.5's
   * distinction between a parametr and a fight strength would be reported two
   * different ways to two different devices.
   */
  it("reports the same totals for a seat to every device", () => {
    const own = seatIn(envelopeFor(twoHands(), "seat-b", NOW), "seat-b");
    const other = seatIn(envelopeFor(twoHands(), "seat-a", NOW), "seat-b");
    for (const key of [
      "sword_total",
      "magic_total",
      "sword_in_fight",
      "magic_in_fight",
      "spell_capacity",
    ] as const) {
      expect(other[key]).toBe(own[key]);
    }
  });

  it("never carries a seat's claim token", () => {
    // The token is kept out by `SEAT_COLUMNS` — a hand-written list of column
    // names in a string, one edit away from including it, with the seat row
    // spread wholesale into the envelope underneath. This is what says so.
    const wire = JSON.stringify(envelopeFor(twoHands(), "seat-a", NOW));
    expect(wire).not.toContain("token");
  });
});

describe("presence, judged here so every device agrees", () => {
  const seenAt = (ms: number) => new Date(NOW - ms).toISOString();

  it("is not away when it has never been heard from", () => {
    // A seat the host added in companion mode has no device behind it by
    // design; calling that absent made a fresh lobby look abandoned.
    const table = aTable({ seats: [aSeat({ seen_at: null })] });
    expect(envelopeFor(table, null, NOW).seats[0].away).toBe(false);
  });

  it("is away once it has gone quiet for longer than the window", () => {
    const quiet = aTable({ seats: [aSeat({ seen_at: seenAt(AWAY_AFTER_MS + 1000) })] });
    const recent = aTable({ seats: [aSeat({ seen_at: seenAt(AWAY_AFTER_MS - 1000) })] });
    expect(envelopeFor(quiet, null, NOW).seats[0].away).toBe(true);
    expect(envelopeFor(recent, null, NOW).seats[0].away).toBe(false);
  });

  it("is not away when the player walked off and left the character", () => {
    const gone = aTable({
      seats: [aSeat({ seen_at: seenAt(AWAY_AFTER_MS * 10), abandoned_at: seenAt(0) })],
    });
    expect(envelopeFor(gone, null, NOW).seats[0].away).toBe(false);
  });

  it("reads the clock it is given rather than the one on the wall", () => {
    // Pure, which is the only reason the three tests above can exist.
    const table = aTable({ seats: [aSeat({ seen_at: seenAt(0) })] });
    const later = NOW + AWAY_AFTER_MS + 1000;
    expect(envelopeFor(table, null, NOW).seats[0].away).toBe(false);
    expect(envelopeFor(table, null, later).seats[0].away).toBe(true);
  });
});

describe("the deck, which never travels", () => {
  const deck = {
    events: { draw: ["zd-1", "zd-2", "zd-3"], discard: ["zd-9", "zd-8"] },
    spells: { draw: ["zk-1"], discard: [] },
  };

  it("sends the counts and not the order", () => {
    const { game } = envelopeFor(aTable({ game: { deck } }), null, NOW);
    expect(game.deck).toBeUndefined();
    expect(game.deckCounts).toEqual({
      events: { draw: 3, discard: 2 },
      spells: { draw: 1, discard: 0 },
    });
  });

  it("does not put a single upcoming card on the wire", () => {
    const wire = JSON.stringify(envelopeFor(aTable({ game: { deck } }), null, NOW));
    for (const coming of ["zd-1", "zd-2", "zd-3", "zk-1"]) {
      expect(wire).not.toContain(coming);
    }
  });

  it("shows the top of the used pile, which the whole table can see anyway", () => {
    const { game } = envelopeFor(aTable({ game: { deck } }), null, NOW);
    expect(game.used).toEqual({ events: "zd-8", spells: null });
  });

  it("says nothing about piles a companion table is holding itself", () => {
    const { game } = envelopeFor(aTable({ game: { deck: null } }), null, NOW);
    expect(game.deckCounts).toBeNull();
    expect(game.used).toBeNull();
  });

  it("keeps the rest of the games row", () => {
    expect(withoutDeck({ deck: null, join_code: "ABCD", turn: 3 })).toMatchObject({
      join_code: "ABCD",
      turn: 3,
    });
  });
});
