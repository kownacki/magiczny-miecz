import { describe, expect, it } from "vitest";
import { envelopeFor, withoutDeck } from "./envelope";
import { aHolding, aSeat, aTable, aUser } from "./fixture";
import {
  AWAY_AFTER_MS,
} from "./commands/presence";

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
      aSeat({ id: "seat-a", seat_index: 0 }),
      aSeat({ id: "seat-b", seat_index: 1 }),
    ],
    users: [
      aUser({ id: "usra", name: "Michał", seat_index: 0 }),
      aUser({ id: "usrb", name: "Ola", seat_index: 1, is_host: false }),
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
    const mine = seatIn(envelopeFor(twoHands(), "usra", NOW), "seat-a");
    expect(mine.holdings.map((card) => card.cardId)).toEqual(["blyskawica", "helm"]);
    expect(mine.hidden_count).toBe(0);
  });

  it("sends the other seat a count instead of the card", () => {
    const theirs = seatIn(envelopeFor(twoHands(), "usra", NOW), "seat-b");
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
    const toA = envelopeFor(twoHands(), "usra", NOW);
    const toB = envelopeFor(twoHands(), "usrb", NOW);
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
    const wire = JSON.stringify(envelopeFor(twoHands(), "usra", NOW));
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

  it("treats an id that is not at this table as nobody at all", () => {
    const stranger = envelopeFor(twoHands(), "zzzz", NOW);
    expect(stranger.mySeatIndex).toBeNull();
    expect(stranger.seats.map((seat) => seat.hidden_count)).toEqual([1, 1]);
  });

  it("hides nothing at a physical table", () => {
    // In companion mode the cards are in people's hands and the app is not the
    // one keeping the secret — see `visibleTo`.
    const table = twoHands();
    table.game.mode = "companion";
    const theirs = seatIn(envelopeFor(table, "usra", NOW), "seat-b");
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
    const own = seatIn(envelopeFor(twoHands(), "usrb", NOW), "seat-b");
    const other = seatIn(envelopeFor(twoHands(), "usra", NOW), "seat-b");
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
    const wire = JSON.stringify(envelopeFor(twoHands(), "usra", NOW));
    expect(wire).not.toContain("token");
  });
});

describe("who this device is", () => {
  /**
   * The distinction the browser could not draw, and kept getting wrong.
   *
   * A device driving no seat and a device the table has never heard of both
   * arrived as `mySeatIndex: null`, so watching a table was rendered as having
   * been thrown off one — the page forgot its token and redirected home with a
   * notice saying somebody had removed them.
   */
  const watchingTable = () =>
    aTable({
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      users: [
        aUser({ id: "usra", name: "Michał", seat_index: 0 }),
        aUser({ id: "usrb", name: "Kasia", seat_index: null, is_host: false }),
      ],
    });

  it("says who somebody driving a Postać is", () => {
    const { me, mySeatIndex } = envelopeFor(watchingTable(), "usra", NOW);
    expect(me).toMatchObject({ id: "usra", name: "Michał", seatIndex: 0, isHost: true });
    expect(mySeatIndex).toBe(0);
  });

  it("says a spectator is here, and driving nothing", () => {
    const { me, mySeatIndex } = envelopeFor(watchingTable(), "usrb", NOW);
    expect(me).toMatchObject({ id: "usrb", name: "Kasia", seatIndex: null });
    expect(mySeatIndex).toBeNull();
  });

  it("says nothing at all about a device the table has never heard of", () => {
    // Which is what being kicked looks like from inside: the token opens
    // nothing. `me` is the whole of the difference from the case above.
    expect(envelopeFor(watchingTable(), "zzzz", NOW).me).toBeNull();
    expect(envelopeFor(watchingTable(), null, NOW).me).toBeNull();
  });

  it("sends the whole room, watchers included, and no device ids", () => {
    const { users } = envelopeFor(watchingTable(), "usra", NOW);
    expect(users.map((one) => one.name)).toEqual(["Michał", "Kasia"]);
    expect(users.map((one) => one.seatIndex)).toEqual([0, null]);
    // What browser somebody is on is theirs, and is no part of the game.
    expect(JSON.stringify(users)).not.toContain("device");
  });

  it("marks the chair with whoever is driving it", () => {
    const { seats } = envelopeFor(watchingTable(), "usra", NOW);
    expect(seats[0].driver_id).toBe("usra");
    expect(seats[0].player_name).toBe("Michał");
  });
});

describe("presence, judged here so every device agrees", () => {
  const seenAt = (ms: number) => new Date(NOW - ms).toISOString();
  /** One chair, and whoever is or is not behind it. */
  const chair = (...driver: Partial<Parameters<typeof aUser>[0]>[]) =>
    aTable({ seats: [aSeat({ seat_index: 0 })], users: driver.map((one) => aUser(one)) });

  it("is not away when they have never been heard from", () => {
    // Somebody who joined a second ago has not polled once. Calling that absent
    // made a fresh poczekalnia look like a room everybody had walked out of.
    expect(envelopeFor(chair({ seen_at: null }), null, NOW).seats[0].away).toBe(false);
  });

  it("is away once they have gone quiet for longer than the window", () => {
    const quiet = chair({ seen_at: seenAt(AWAY_AFTER_MS + 1000) });
    const recent = chair({ seen_at: seenAt(AWAY_AFTER_MS - 1000) });
    expect(envelopeFor(quiet, null, NOW).seats[0].away).toBe(true);
    expect(envelopeFor(recent, null, NOW).seats[0].away).toBe(false);
  });

  it("is not away when nobody is driving the chair at all", () => {
    /**
     * Presence is a person's, and an empty seat has none. Those are different
     * things to look at — the Postać is standing there with its Przedmioty and
     * whoever was driving it has gone — and marking it "nieobecny" says the
     * quieter of the two.
     */
    const empty = chair();
    expect(envelopeFor(empty, null, NOW).seats[0].away).toBe(false);
    expect(envelopeFor(empty, null, NOW).seats[0].player_name).toBeNull();
  });

  it("reads the clock it is given rather than the one on the wall", () => {
    // Pure, which is the only reason the three tests above can exist.
    const table = chair({ seen_at: seenAt(0) });
    const later = NOW + AWAY_AFTER_MS + 1000;
    expect(envelopeFor(table, null, NOW).seats[0].away).toBe(false);
    expect(envelopeFor(table, null, later).seats[0].away).toBe(true);
  });
});

describe("the deck, which never travels", () => {
  /**
   * The seed is the deck by another route.
   *
   * Every shuffle is a function of the seed and the revision it happens at, so
   * a device holding it can work out the order of the pile it is not allowed to
   * see. It rode along with the rest of the row from the day the column was
   * added, which is the hazard of `...rest`: a new column travels unless
   * somebody stops it.
   */
  it("does not send the seed either", () => {
    const sent = withoutDeck({ deck: null, seed: "s3cr3t", join_code: "ABCD", round: 3 });
    expect(sent).not.toHaveProperty("seed");
    expect(JSON.stringify(sent)).not.toContain("s3cr3t");
    // And the rest of the row still travels.
    expect(sent).toMatchObject({ join_code: "ABCD", round: 3 });
  });

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
    expect(withoutDeck({ deck: null, join_code: "ABCD", round: 3 })).toMatchObject({
      join_code: "ABCD",
      round: 3,
    });
  });
});

/**
 * The Zaklęcie in the air, which is everybody's business.
 *
 * 12.5: „cały stół dowiaduje się, co zostało wypowiedziane" — so unlike the
 * hand it came out of, this travels to every device. It has to: the window it
 * waits in closes on a clock, and answering it belongs to whoever is holding
 * one of the two Karty that can, which is nobody's turn in particular.
 */
describe("a Zaklęcie waiting to be answered (9.6)", () => {
  const spoken = (until: number) =>
    aTable({
      seats: [aSeat({ id: "seat-a", seat_index: 0 }), aSeat({ id: "seat-b", seat_index: 1 })],
      users: [
        aUser({ id: "usra", name: "Michał", seat_index: 0 }),
        aUser({ id: "usrb", name: "Ola", seat_index: 1, is_host: false }),
      ],
      effects: [
        {
          id: "eff-1",
          seat_id: "seat-a",
          source: "SZALEŃSTWO",
          label: "SZALEŃSTWO — w powietrzu",
          modifier: { kind: "spoken", spell: "szalenstwo", until, target: { seatIndex: 1 } },
          ends: { kind: "dispelled" },
        },
      ],
    });

  it("tells every device what was said, by whom and at whom", () => {
    for (const who of ["usra", "usrb", null]) {
      const envelope = envelopeFor(spoken(NOW + 20_000), who, NOW);
      expect(envelope.spoken, String(who)).toEqual({
        spell: "szalenstwo",
        name: "SZALEŃSTWO",
        by: 0,
        at: 1,
        until: NOW + 20_000,
      });
    }
  });

  /**
   * The clock is read here rather than in the browser, for the same reason
   * `away` is: six devices with six slightly different clocks would otherwise
   * disagree about whether the window is still open.
   */
  it("says nothing once the window has closed", () => {
    expect(envelopeFor(spoken(NOW - 1), "usra", NOW).spoken).toBeNull();
  });

  it("is null when nothing has been spoken", () => {
    expect(envelopeFor(twoHands(), "usra", NOW).spoken).toBeNull();
  });
});

/**
 * The effects, folded and dated on the server.
 *
 * Both halves have to happen here rather than in a browser. Stacking is a rule
 * — what a second Krąg Płomieni did is the engine's to say — and the round an
 * effect lapses in needs the whole turn order walked, while a device is sent
 * one seat at a time and could not walk it if it wanted to.
 */
describe("what a character is under, sent as rows", () => {
  const table = (over: Parameters<typeof aSeat>[0] = {}, effects: unknown[] = []) =>
    aTable({
      game: { round: 5, active_seat: 0 },
      seats: [
        aSeat({ id: "seat-a", seat_index: 0 }),
        aSeat({ id: "seat-b", seat_index: 1, ...over }),
      ],
      users: [
        aUser({ id: "usra", name: "Michał", seat_index: 0 }),
        aUser({ id: "usrb", name: "Ola", seat_index: 1, is_host: false }),
      ],
      effects: effects as never,
    });

  const held = (id: string, turns: number) => ({
    id,
    seat_id: "seat-b",
    source: "krag-plomieni",
    label: "Krąg Płomieni",
    modifier: { kind: "frozen" },
    ends: { kind: "turns", turns },
  });

  it("dates a lost turn to the round the seat plays again in", () => {
    const envelope = envelopeFor(table({ turns_lost: 2 }), "usra", NOW);
    expect(seatIn(envelope, "seat-b").effects).toMatchObject([
      { label: "Traci turę", when: "jeszcze 2 tury — wraca w rundzie 7", certainty: "prognoza" },
    ]);
  });

  it("names a stored deadline outright, and calls it exact", () => {
    const envelope = envelopeFor(table({ stone_until_round: 8 }), "usra", NOW);
    expect(seatIn(envelope, "seat-b").effects).toMatchObject([
      { label: "Zamieniony w Kamień", when: "mija na początku rundy 8", certainty: "pewne" },
    ]);
  });

  it("folds two of one thing into one row, and says what the second did", () => {
    const envelope = envelopeFor(table({}, [held("e1", 1), held("e2", 3)]), "usra", NOW);
    const [row, ...rest] = seatIn(envelope, "seat-b").effects;
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ count: 2, stacking: "exclusive" });
    // The row stops being true when the longer of the two does.
    expect(row.when).toContain("rundzie 7");
  });

  it("leaves an effect that is not a time without a round at all", () => {
    const fatum = {
      id: "e1",
      seat_id: "seat-b",
      source: "fatum",
      label: "Fatum",
      modifier: { kind: "frozen" },
      ends: { kind: "dispelled" },
    };
    const row = seatIn(envelopeFor(table({}, [fatum]), "usra", NOW), "seat-b").effects[0];
    expect(row).toMatchObject({ when: "dopóki ktoś tego nie zdejmie", certainty: null });
  });

  /**
   * The one word that depends on who is reading. A countdown lapsing after its
   * holder's own turn is "po twojej turze" on your own card and "po turze
   * Postaci" on somebody else's — and the envelope is built per device, so the
   * same seat reads differently on two screens by design.
   */
  it("speaks about a seat in the second person only on that seat's own device", () => {
    const state = table({}, [held("e1", 2)]);
    expect(seatIn(envelopeFor(state, "usrb", NOW), "seat-b").effects[0].when).toContain(
      "po twojej turze",
    );
    expect(seatIn(envelopeFor(state, "usra", NOW), "seat-b").effects[0].when).toContain(
      "po turze Postaci",
    );
    // And a spectator, who is driving nothing, is nobody's second person.
    expect(seatIn(envelopeFor(state, null, NOW), "seat-b").effects[0].when).toContain(
      "po turze Postaci",
    );
  });

  it("keeps the mark the marks beside a name have always used", () => {
    const envelope = envelopeFor(table({ turns_lost: 1 }), "usra", NOW);
    expect(seatIn(envelope, "seat-b").effects[0]).toMatchObject({
      glyph: "■",
      tone: "zly",
      source: "tura-stracona",
      title: "Traci turę — jeszcze 1 tura — wraca w rundzie 6",
    });
  });

  /**
   * The wrench follows a conjured Karta everywhere, and this was the one place
   * it could not reach.
   *
   * A `granted` card is marked in a hand, in a slot, in the turn and in a
   * fight, because `Held.granted` is on the wire. A card lying on an Obszar was
   * not: the field row went out as `{ id, fieldId, cardId }` and the flag
   * stopped at the server, so a Targowisko the console conjured looked exactly
   * like one the deck had dealt.
   */
  it("marks a conjured Karta lying on an Obszar", () => {
    const state = aTable({
      seats: [aSeat({ id: "seat-a", seat_index: 0 })],
      users: [aUser({ id: "usra", name: "Michał", seat_index: 0 })],
      fieldCards: [
        { id: "fc-1", field_id: "karczma", card_id: "targowisko", granted: true },
        { id: "fc-2", field_id: "karczma", card_id: "cyklop", granted: false },
      ],
    });
    const out = envelopeFor(state, "usra", NOW).fieldCards;
    expect(out.find((one) => one.id === "fc-1")).toMatchObject({ granted: true });
    // And an ordinary one says nothing, so nothing is marked that was dealt.
    expect(out.find((one) => one.id === "fc-2")?.granted).toBeUndefined();
  });
});