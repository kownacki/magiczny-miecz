/** A table built by hand, for tests: the snapshot a command reads, with nothing behind it. */

import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { buildDeck, type DeckState } from "@/lib/engine/deck";
import type { TurnPhase } from "@/lib/engine/turn";
import { scriptedRandom } from "@/lib/engine/ports";
import type { CommandPorts, Snapshot } from "./change";
import type { GameRow, HoldingRow, SeatRow } from "./store";

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
    player_name: "Michał",
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
    abandoned_at: null,
    seen_at: null,
    ready: true,
    no_device: false,
    created_at: "2026-01-01T00:00:00Z",
    left_at: null,
    eliminated: false,
    is_host: true,
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
    ...(over.game ?? {}),
  };
  return {
    game,
    seats: over.seats ?? [aSeat()],
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
