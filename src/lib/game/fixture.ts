/** A table built by hand, for tests: the snapshot a command reads, with nothing behind it. */

import { asFieldId } from "@/lib/engine/board";
import { asSeatCharacter } from "@/lib/engine/characters";
import { buildDeck, type DeckState } from "@/lib/engine/deck";
import type { TurnPhase } from "@/lib/engine/turn";
import { asTurnState, type TurnState } from "@/lib/engine/stack";
import { scriptedRandom } from "@/lib/engine/ports";
import { apply, type CommandPorts, type Outcome, type Snapshot } from "./change";
import { requireTop } from "@/lib/engine/stack";
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
    trophy_points: 0,
    trophy_beaten: [],
    nature: "good",
    turns_lost: 0,
    stone_until_round: null,
    bridge_blocked_until_round: null,
    nature_changed_round: null,
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
    carried_by: null,
    ...over,
  };
}

/** An empty deck that still has the shape of one, for tests that do not care. */
export function noDeck(): { events: DeckState; spells: DeckState } {
  const none = buildDeck([], (items) => [...items]);
  return { events: none, spells: none };
}

/** A game row given piecemeal, because a test only ever cares about a column or two. */
/**
 * A fixture still says `turn_state: { phase: "fight", ... }` — a bare phase —
 * and `aTable` wraps it into a one-frame stack. Deliberate: several hundred
 * tests write turn state as the phase they mean, and the phase *is* what they
 * mean; the stack around it is plumbing. A test about depth passes a
 * `TurnState` instead and is taken as given.
 */
type TableOver = Partial<Omit<Snapshot, "game">> & {
  game?: Partial<Omit<GameRow, "turn_state">> & { turn_state?: TurnPhase | TurnState };
};

export function aTable(over: TableOver = {}): Snapshot {
  const { turn_state: overState, ...overGame } = over.game ?? {};
  const game: GameRow & { turn_state: TurnState } = {
    id: "game-1",
    join_code: "ABCD",
    mode: "simulation",
    eq_mode: "classic",
    // The printed rule, not the database's default. A fixture that quietly
    // moved every trophy test onto the variant would be testing the variant
    // and saying it tested 1.4. Tests for `punkty` pass it explicitly.
    trophy_mode: "cards",
    endless_stock: false,
    die_source: "app",
    status: "playing",
    active_seat: 0,
    round: 3,
    revision: 7,
    journal_seq: 12,
    turn_state: asTurnState(overState ?? { phase: "roll" }),
    deck: noDeck(),
    /** 4.4's list, empty until somebody dies. */
    characters_out: [],
    /** Fixed, so a test that shuffles gets the same order every run. */
    seed: "test-seed",
    ...overGame,
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

/**
 * A command as the driver calls one: snapshot in, Changeset out.
 *
 * Every command in `commands/` has this shape, and the ones that need neither
 * ports nor a command object are assignable to it unchanged — a function of
 * two parameters satisfies a type of three.
 */
type AnyCommand<C, T> = (
  snapshot: Snapshot,
  command: C,
  ports: CommandPorts,
) => Outcome<T> | Promise<Outcome<T>>;

/**
 * A table you can play turns against, for tests that are a sequence rather
 * than a single question.
 *
 * `aTable` is deep and carries no *time*: every multi-step test wrote the fold
 * out by hand —
 *
 *     at = apply(at, (await rollForMove(at, {}, ports({ random: … }))).writes);
 *
 * — once per moment, which meant each moment re-ran its own prefix inline and
 * a scenario read as plumbing rather than as the ten moments it is. The
 * acceptance test in `commands/stack.test.ts` had a moment blocked on this and
 * saying so: "waits on a second turn in the harness".
 *
 * Mutable on purpose. A test is a script of things that happen in order, and
 * threading a new binding through each line is the noise this exists to
 * delete.
 */
export interface Driver {
  /** The table as it now stands. */
  readonly snapshot: Snapshot;
  /** The stack, top last — what `docs/STACK.md` writes in its right-hand column. */
  readonly phases: TurnPhase["phase"][];
  /** What the last `run` returned, for the assertions that are about the result. */
  readonly result: unknown;
  /** Runs one command and folds its Changeset in. */
  run<C, T>(
    command: AnyCommand<C, T>,
    args?: C,
    over?: Partial<CommandPorts>,
  ): Promise<Driver>;
  /** The frame on screen, insisting it is the kind named. */
  frame<K extends TurnPhase["phase"]>(kind: K): Extract<TurnPhase, { phase: K }>;
}

export function at(start: Snapshot): Driver {
  let table = start;
  let last: unknown = undefined;
  const driver: Driver = {
    get snapshot() {
      return table;
    },
    get phases() {
      return table.game.turn_state.stack.map((frame) => frame.phase);
    },
    get result() {
      return last;
    },
    async run<C, T>(command: AnyCommand<C, T>, args?: C, over: Partial<CommandPorts> = {}) {
      const done = await command(table, args as C, ports(over));
      table = apply(table, done.writes);
      last = done.result;
      return driver;
    },
    frame<K extends TurnPhase["phase"]>(kind: K) {
      return requireTop(table.game.turn_state, kind);
    },
  };
  return driver;
}

/** Dice for one `run`, in the order the command will ask for them. */
export function rolling(...faces: number[]): Partial<CommandPorts> {
  return { random: scriptedRandom(faces) };
}
