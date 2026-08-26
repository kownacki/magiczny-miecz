/** A table built by hand, for tests: the snapshot a command reads, with nothing behind it. */

import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { buildDeck, type DeckState } from "@/lib/engine/deck";
import type { TurnPhase } from "@/lib/engine/turn";
import { scriptedRandom } from "@/lib/engine/ports";
import type { CommandPorts, Snapshot } from "./change";
import type { GameRow, HoldingRow, SeatRow, UserRow } from "./store";

/**
 * Why this exists at all.
 *
 * A command takes a snapshot and returns a changeset, so a test needs one of
 * each and no database — which is the whole argument for the shape. Before
 * this, asking "what does a death do to the table?" meant standing up Supabase
 * and reading the rows back afterwards, and so nobody asked.
 */
export function aSeat(over: Partial<SeatRow> = {}): SeatRow {
  return {
    id: "seat-a",
    seat_index: 0,
    character_id: asSeatCharacter("goblin"),
    field_id: asFieldId("mroczna-polana"),
    sword_own: 2,
    magic_own: 1,
    sword_floor: 2,
    magic_floor: 1,
    life: 4,
    gold: 1,
    nature: "good",
    turns_lost: 0,
    stone_until_turn: null,
    bridge_blocked_until_turn: null,
    nature_changed_turn: null,
    created_at: "2026-01-01T00:00:00Z",
    eliminated: false,
    ...over,
  };
}

/**
 * Somebody at the table, driving seat 0 unless told otherwise.
 *
 * A default table has one seat and one person in it, which is what almost every
 * test means by "a table" — and the ones that mean something else say so. Note
 * that `aTable` builds a driver for every seat it is given, so a test that wants
 * an *empty* chair has to pass `users: []` and mean it.
 *
 * The id looks like a real one on purpose: four characters from `makeUserId`'s
 * alphabet, which has no `1` and no `l` in it.
 */
export function aUser(over: Partial<UserRow> = {}): UserRow {
  return {
    id: "usra",
    name: "Michał",
    device_id: null,
    is_host: true,
    ready: true,
    seat_index: 0,
    seen_at: null,
    left_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

export function aHolding(over: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: "held-1",
    seat_id: "seat-a",
    card_id: "helm",
    kind: "item",
    face: "open",
    slot: null,
    ordinal: null,
    granted: false,
    ...over,
  };
}

/** An empty deck that still has the shape of one, for tests that do not care. */
export function noDeck(): { events: DeckState; spells: DeckState } {
  const none = buildDeck([], (items) => [...items]);
  return { events: none, spells: none };
}

/** A game row given piecemeal, because a test only ever cares about a column or two. */
type TableOver = Partial<Omit<Snapshot, "game">> & {
  game?: Partial<GameRow & { turn_state: TurnPhase }>;
};

export function aTable(over: TableOver = {}): Snapshot {
  const game: GameRow & { turn_state: TurnPhase } = {
    id: "game-1",
    join_code: "ABCD",
    mode: "simulation",
    eq_mode: "classic",
    die_source: "app",
    status: "playing",
    active_seat: 0,
    turn: 3,
    revision: 7,
    journal_seq: 12,
    turn_state: { phase: "roll" },
    deck: noDeck(),
    /** 4.4's list, empty until somebody dies. */
    characters_out: [],
    ...(over.game ?? {}),
  };
  const seats = over.seats ?? [aSeat()];
  return {
    game,
    seats,
    /**
     * One driver per seat, unless the test says otherwise.
     *
     * Built from the seats rather than defaulted to empty, because before the
     * split every seat *was* a person and hundreds of tests assume somebody is
     * behind one. A test about an empty chair passes `users: []`.
     */
    users:
      over.users ??
      seats.map((seat, at) =>
        aUser({
          id: `usr${String.fromCharCode(97 + at)}`,
          name: at === 0 ? "Michał" : `Gracz ${at + 1}`,
          is_host: at === 0,
          seat_index: seat.seat_index,
        }),
      ),
    holdings: over.holdings ?? [],
    fieldCards: over.fieldCards ?? [],
    effects: over.effects ?? [],
    // The snapshot's copy of the games row's own counter; a test that sets
    // one and not the other would be describing a table that cannot exist.
    journalSeq: over.journalSeq ?? game.journal_seq,
  };
}

/** A fixed moment, so a command that reads the clock can be asked about one. */
export const NOW = Date.parse("2026-01-01T12:00:00Z");

/** The ports a command runs against in a test: no dice unless a test scripts some. */
export function ports(over: Partial<CommandPorts> = {}): CommandPorts {
  return { random: scriptedRandom([]), now: () => NOW, ...over };
}
