import { describe, expect, it } from "vitest";
import { asSeatCharacter } from "@/lib/engine/characters";
import { asFieldId } from "@/lib/engine/board";
import { afterRoll } from "@/lib/engine/turn";
import { scriptedRandom } from "@/lib/engine/ports";
import type { HoldingRow } from "../store";
import { NOW, aHolding, aSeat, aTable, noDeck, ports } from "../fixture";
import { moveTo, rollForMove, startGame } from "./movement";

/* --------------------------------------------------------------------------
 * Starting the game.
 * ----------------------------------------------------------------------- */

const lobby = (seats: ReturnType<typeof aSeat>[]) =>
  aTable({ game: { status: "lobby", turn: 0, active_seat: null, deck: null }, seats });

describe("otwarcie stołu (3.2, 9.5)", () => {
  it("refuses a table where nobody has taken a character", () => {
    const table = lobby([aSeat({ character_id: null })]);
    expect(() => startGame(table, { decks: noDeck() }, ports())).toThrow(
      "Do gry potrzeba przynajmniej jednej postaci.",
    );
  });

  /** One character is a game: the Bestia can be beaten alone (14.7, 22). */
  it("starts a table of one", () => {
    const { writes } = startGame(lobby([aSeat()]), { decks: noDeck() }, ports());
    expect(writes.game).toMatchObject({ status: "playing", turn: 1, active_seat: 0 });
  });

  it("names whoever has not said they are ready", () => {
    const table = lobby([
      aSeat({ id: "seat-a", seat_index: 0, player_name: "Michał" }),
      aSeat({ id: "seat-b", seat_index: 1, player_name: "Ola", ready: false }),
    ]);
    expect(() => startGame(table, { decks: noDeck() }, ports())).toThrow(
      "Nie wszyscy są gotowi: Ola.",
    );
  });

  /** A seat nobody is behind cannot say anything, so it is not asked. */
  it("does not wait on a seat whose player walked away", () => {
    const table = lobby([
      aSeat({ id: "seat-a", seat_index: 0 }),
      aSeat({
        id: "seat-b",
        seat_index: 1,
        ready: false,
        abandoned_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    expect(() => startGame(table, { decks: noDeck() }, ports())).not.toThrow();
  });

  it("opens on the first seat that holds a character, at the roll", () => {
    const table = lobby([
      aSeat({ id: "seat-a", seat_index: 0, character_id: null }),
      aSeat({ id: "seat-b", seat_index: 1 }),
    ]);
    const { writes } = startGame(table, { decks: noDeck() }, ports());
    expect(writes.game).toMatchObject({
      status: "playing",
      turn: 1,
      active_seat: 1,
      turn_state: { phase: "rzut" },
    });
    expect(writes.journal?.at(-1)).toMatchObject({
      seatId: null,
      turn: 1,
      kind: "start",
      payload: { seats: 1 },
    });
  });

  it("takes the moment the table began off the clock port", () => {
    const { writes } = startGame(lobby([aSeat()]), { decks: noDeck() }, ports());
    // `started_at` is a column nothing reads, so it is not in `GameRow`.
    expect((writes.game as Record<string, unknown>).started_at).toBe(new Date(NOW).toISOString());
  });

  it("hands the shuffled piles to a simulation and none to a companion table", () => {
    const decks = noDeck();
    const simulated = startGame(lobby([aSeat()]), { decks }, ports());
    expect(simulated.writes.game?.deck).toBe(decks);

    const physical = aTable({
      game: { mode: "companion", status: "lobby", turn: 0, active_seat: null, deck: null },
      seats: [aSeat()],
    });
    expect(startGame(physical, { decks }, ports()).writes.game?.deck).toBeNull();
  });

  /**
   * The Książę: "helm", "miecz" and a purse of five (3.2).
   *
   * Dealing everyone one Sztuka Złota and nothing else is wrong from the first
   * turn, and wrong in the direction that flattens the characters into each
   * other.
   */
  it("deals a character what its own card starts it with", () => {
    const table = lobby([aSeat({ character_id: asSeatCharacter("ksiaze") })]);
    const { writes } = startGame(table, { decks: noDeck() }, ports());

    expect(writes.holdings?.insert).toEqual([
      { seat_id: "seat-a", card_id: "helm", kind: "item", face: "open" },
      { seat_id: "seat-a", card_id: "miecz", kind: "item", face: "open" },
    ]);
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { zloto: 5 } }]);
    expect(writes.journal?.[0]).toMatchObject({
      seatId: "seat-a",
      turn: 1,
      kind: "wyposazenie-poczatkowe",
      payload: { character: "ksiaze", items: ["helm", "miecz"], zloto: 5 },
    });
  });

  it("leaves a character with no kit alone", () => {
    // The Goblin starts with nothing but rule 3.2's single coin, which is the
    // column default and not something to write.
    const { writes } = startGame(lobby([aSeat()]), { decks: noDeck() }, ports());
    expect(writes.holdings).toBeUndefined();
    expect(writes.seats).toBeUndefined();
    expect(writes.journal?.map((line) => line.kind)).toEqual(["start"]);
  });

  /**
   * The one part of setup this cannot do.
   *
   * A spell draw checks 2.6's capacity, takes a card off the pile and can
   * reshuffle it, all of which lives in the store. So the command says who is
   * owed how many and the caller draws them.
   */
  it("reports the Zaklęcia it cannot deal itself", () => {
    const table = lobby([
      aSeat({ id: "seat-a", seat_index: 0, character_id: asSeatCharacter("mag") }),
      aSeat({ id: "seat-b", seat_index: 1, character_id: asSeatCharacter("kat") }),
      aSeat({ id: "seat-c", seat_index: 2, character_id: asSeatCharacter("zdobywca") }),
    ]);
    const { writes, result } = startGame(table, { decks: noDeck() }, ports());

    expect(result).toEqual([
      { seatId: "seat-a", spells: 2 },
      { seatId: "seat-b", spells: 1 },
    ]);
    // The Mag owns two Zaklęcia and nothing else, so his line is written here
    // even though this change deals him no card.
    expect(writes.journal?.[0]).toMatchObject({
      kind: "wyposazenie-poczatkowe",
      payload: { character: "mag", spells: 2 },
    });
    expect(writes.holdings?.insert?.map((h) => h.card_id)).toEqual(["miecz", "miecz", "tarcza"]);
  });
});

/* --------------------------------------------------------------------------
 * The movement roll.
 * ----------------------------------------------------------------------- */

const die = (...results: number[]) => ports({ random: scriptedRandom(results) });

/** Zaczarowane Wzgórza, in the middle ring: two steps either way is Pustelnia or Płaskowyż Mgieł. */
const rolling = (
  seat: Parameters<typeof aSeat>[0] = {},
  holdings: HoldingRow[] = [],
) =>
  aTable({
    game: { active_seat: 0, turn: 3, turn_state: { phase: "rzut" } },
    // Named rather than leant on: the fixture's own Obszar is deliberately one
    // with no rule of its own, and these tests are about this one's neighbours.
    seats: [aSeat({ seat_index: 0, field_id: asFieldId("zaczarowane-wzgorza"), ...seat })],
    holdings,
  });

describe("rzut na ruch (10.2)", () => {
  it("throws one die and offers both ways round the ring", async () => {
    const { writes, result } = await rollForMove(rolling(), {}, die(2));
    expect(result).toBe(2);
    expect(writes.game?.turn_state).toMatchObject({ phase: "ruch", roll: 2 });
    const options = (writes.game?.turn_state as { options: { fieldId: string }[] }).options;
    expect(options.map((option) => option.fieldId)).toEqual(["pustelnia", "plaskowyz-mgiel"]);
  });

  it("asks for exactly one die", async () => {
    const random = scriptedRandom([2]);
    await rollForMove(rolling(), {}, ports({ random }));
    await expect(random.rollD6("a second")).rejects.toThrow(/exhausted/);
  });

  it("records the roll, and that the app threw it", async () => {
    const { writes } = await rollForMove(rolling(), {}, die(5));
    expect(writes.journal).toEqual([
      { seatId: "seat-a", turn: 3, kind: "rzut", payload: { roll: 5, manual: false }, manual: false },
    ]);
  });

  /** At a physical table a human reads the die aloud, and the journal says so. */
  it("marks a number a human typed in", async () => {
    const { writes } = await rollForMove(rolling(), { manual: true }, die(5));
    expect(writes.journal?.[0]).toMatchObject({ payload: { roll: 5, manual: true }, manual: true });
  });

  it("refuses when the turn is not at the roll", async () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: { phase: "ruch", roll: 2, options: [] } },
      seats: [aSeat({ seat_index: 0 })],
    });
    await expect(rollForMove(table, {}, die(2))).rejects.toThrow("Nie czas na rzut.");
  });

  /**
   * The die is thrown before this check, exactly where the store threw it, so
   * a table that types a 7 hears about the 7 rather than about the figure.
   */
  it("refuses when the figure is not on the board", async () => {
    await expect(rollForMove(rolling({ field_id: null }), {}, die(2))).rejects.toThrow(
      "Postać nie stoi na żadnym polu.",
    );
  });

  describe("the Kamienny Most, offered in passing (11.10, 11.11)", () => {
    // Urwisko I is one step short of Ruiny Twierdzy, so a two walks through the
    // entrance with a step still to spend — which is what 11.10 requires.
    const atUrwisko = (seat: Parameters<typeof aSeat>[0] = {}, holdings: HoldingRow[] = []) =>
      rolling({ field_id: "urwisko-1", ...seat }, holdings);

    const bridges = (writes: { game?: { turn_state?: unknown } }) =>
      (writes.game?.turn_state as { options: { bridge?: { from: string } }[] }).options.filter(
        (option) => option.bridge,
      );

    it("is not offered without a Magiczny Miecz", async () => {
      const { writes } = await rollForMove(atUrwisko(), {}, die(2));
      expect(bridges(writes)).toEqual([]);
    });

    it("is offered to a character carrying one", async () => {
      const armed = atUrwisko({}, [aHolding({ card_id: "magiczny-miecz" })]);
      const { writes } = await rollForMove(armed, {}, die(2));
      expect(bridges(writes).map((option) => option.bridge?.from)).toEqual(["ruiny-twierdzy"]);
    });

    /** 11.11: "nie może w następnej turze podjąć kolejnej próby wejścia na Most". */
    it("is withheld from somebody who failed there last turn", async () => {
      const barred = atUrwisko({ bridge_blocked_until_turn: 4 }, [
        aHolding({ card_id: "magiczny-miecz" }),
      ]);
      const { writes } = await rollForMove(barred, {}, die(2));
      expect(bridges(writes)).toEqual([]);
    });
  });
});

/* --------------------------------------------------------------------------
 * The walk.
 * ----------------------------------------------------------------------- */

const walking = (from: "zaczarowane-wzgorza" | "urwisko-1", over: Parameters<typeof aTable>[0] = {}) =>
  aTable({
    game: {
      active_seat: 0,
      turn: 3,
      turn_state: afterRoll(from, 2, { bridgeOffered: from === "urwisko-1" }),
      ...(over.game ?? {}),
    },
    seats: [aSeat({ seat_index: 0, field_id: from })],
    fieldCards: over.fieldCards ?? [],
  });

describe("ruch (10.2, 13.4)", () => {
  it("moves the figure and opens the field it landed on", () => {
    const { writes } = moveTo(walking("zaczarowane-wzgorza"), { destination: "pustelnia" });
    expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "pustelnia" } }]);
    expect(writes.game?.turn_state).toEqual({
      phase: "pole",
      fieldId: "pustelnia",
      from: "zaczarowane-wzgorza",
      // Pustelnia prints no "WYCIĄGNIJ" instruction.
      draw: 0,
      drawn: [],
    });
    expect(writes.journal).toEqual([
      {
        seatId: "seat-a",
        turn: 3,
        kind: "ruch",
        payload: { from: "zaczarowane-wzgorza", to: "pustelnia", direction: "zgodnie" },
      },
    ]);
  });

  it("carries the field's printed draw (13.4)", () => {
    const { writes } = moveTo(walking("zaczarowane-wzgorza"), { destination: "plaskowyz-mgiel" });
    // "WYCIĄGNIJ 3 KARTY", walked anticlockwise.
    expect(writes.game?.turn_state).toMatchObject({ draw: 3 });
    expect(writes.journal?.[0]).toMatchObject({ payload: { direction: "przeciwnie" } });
  });

  it("refuses a field the roll does not reach", () => {
    expect(() =>
      moveTo(walking("zaczarowane-wzgorza"), { destination: "las-blednych-ogni" }),
    ).toThrow("To pole nie jest w zasięgu tego rzutu.");
  });

  it("refuses something that is not a field at all", () => {
    expect(() => moveTo(walking("zaczarowane-wzgorza"), { destination: "step" })).toThrow(
      "Ruch: nie ma takiego Obszaru — step",
    );
  });

  it("refuses when the turn is not at the move", () => {
    const table = aTable({
      game: { active_seat: 0, turn_state: { phase: "rzut" } },
      seats: [aSeat({ seat_index: 0 })],
    });
    expect(() => moveTo(table, { destination: "pustelnia" })).toThrow("Nie czas na ruch.");
  });

  /**
   * 16.8 leaves unclaimed cards lying face up, and 13.4 counts them against the
   * field's own draw: "ciągnie się ich tylko tyle, by ich suma równała się
   * liczbie Kart".
   */
  it("picks up what somebody left on the Obszar", () => {
    const table = walking("zaczarowane-wzgorza", {
      fieldCards: [
        { id: "fc-1", field_id: "plaskowyz-mgiel", card_id: "helm", granted: false },
        { id: "fc-2", field_id: "pustelnia", card_id: "wilk", granted: false },
      ],
    });
    const { writes } = moveTo(table, { destination: "plaskowyz-mgiel" });

    // Only this field's card leaves the board; the one two squares away stays.
    expect(writes.fieldCards).toEqual({ delete: ["fc-1"] });
    expect(writes.game?.turn_state).toMatchObject({
      draw: 3,
      drawn: [{ cardId: "helm", cardClass: "item" }],
    });
  });

  describe("turning onto the Kamienny Most (11.10)", () => {
    const table = () =>
      walking("urwisko-1", {
        fieldCards: [
          { id: "fc-1", field_id: "ruiny-twierdzy", card_id: "helm", granted: false },
        ],
      });

    it("stops at the entrance with the guardian still to be faced", () => {
      const { writes } = moveTo(table(), { destination: "ruiny-twierdzy", viaBridge: true });
      expect(writes.seats).toEqual([{ id: "seat-a", patch: { field_id: "ruiny-twierdzy" } }]);
      expect(writes.game?.turn_state).toEqual({
        phase: "most",
        bridge: {
          from: "ruiny-twierdzy",
          guardian: "Kamienny Potwór",
          entersAt: "wejscie-na-most-a",
          stat: "miecz",
        },
      });
      expect(writes.journal?.[0]).toMatchObject({
        kind: "proba-mostu",
        payload: { to: "ruiny-twierdzy", guardian: "Kamienny Potwór" },
      });
    });

    /** "nie ciągnij Karty ... gdy wchodzisz na Most" — the field is not resolved. */
    it("leaves the entrance's cards where they are", () => {
      const { writes } = moveTo(table(), { destination: "ruiny-twierdzy", viaBridge: true });
      expect(writes.fieldCards).toBeUndefined();
    });

    /**
     * A bridge attempt shares its field with the entrance it stops at, so the
     * two are told apart by intent. Walking to Ruiny Twierdzy is not one of the
     * two landing squares this roll reaches.
     */
    it("is not something a plain walk can reach", () => {
      expect(() => moveTo(table(), { destination: "ruiny-twierdzy" })).toThrow(
        "To pole nie jest w zasięgu tego rzutu.",
      );
    });
  });
});
