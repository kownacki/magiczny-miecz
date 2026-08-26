/** One change to one game: the snapshot it reads, the changeset it writes, and the commit that makes the whole of it true at once. */

import { db } from "@/lib/supabase";
import {
  GAME_COLUMNS,
  fieldCardsFor,
  holdingsFor,
  seatsFor,
  type FieldCardRow,
  type GameRow,
  type HoldingRow,
  type SeatRow,
} from "./store";
import type { TurnPhase } from "@/lib/engine/turn";
import type { Ends, Modifier } from "@/lib/engine/status";
import type { RandomPort } from "@/lib/engine/ports";
import { appRandom, replayable } from "./random";

/** Something true of a seat for a while, as the row that records it. */
export interface EffectRow {
  id: string;
  seat_id: string;
  source: string;
  label: string;
  modifier: Modifier;
  ends: Ends;
}

/* --------------------------------------------------------------------------
 * The snapshot: everything one change may read.
 * ----------------------------------------------------------------------- */

/**
 * The whole table, read once.
 *
 * Read once and not again, which is the point. Every action used to fetch the
 * rows it happened to need, and any action that wrote something another part of
 * itself then wanted had to go back for a second look — `castSpell` and
 * `applyEffect` both call `loadGame` twice, and `returnToPile` re-read and
 * re-wrote the games row underneath whatever was calling it. A command that
 * cannot re-read cannot be surprised by its own writes.
 *
 * Six tables is the whole game, and a table is at most six seats, so this is
 * one round of small queries rather than a cost worth avoiding.
 */
export interface Snapshot {
  game: GameRow & { turn_state: TurnPhase };
  seats: SeatRow[];
  holdings: HoldingRow[];
  fieldCards: FieldCardRow[];
  effects: EffectRow[];
  /** The highest `seq` the journal held when this was read. */
  journalSeq: number;
}

/* --------------------------------------------------------------------------
 * The changeset: everything one change may write.
 * ----------------------------------------------------------------------- */

export interface SeatPatch {
  id: string;
  patch: Partial<Omit<SeatRow, "id">>;
}

export interface NewHolding {
  seat_id: string;
  card_id: string;
  kind: HoldingRow["kind"];
  face?: HoldingRow["face"];
  slot?: string | null;
  ordinal?: number | null;
  granted?: boolean;
}

export interface HoldingPatch {
  id: string;
  patch: Partial<Omit<HoldingRow, "id">>;
}

export interface NewFieldCard {
  field_id: string;
  card_id: string;
  granted?: boolean;
}

export interface NewEffect {
  seat_id: string;
  source: string;
  label: string;
  modifier: Modifier;
  ends: Ends;
}

export interface EffectPatch {
  id: string;
  patch: Partial<Omit<EffectRow, "id" | "seat_id">>;
}

/**
 * One line owed to the journal.
 *
 * `seq` is deliberately absent: it is settled at commit from the snapshot's
 * high-water mark, so the numbering of a whole command is decided in one place
 * rather than by each line racing the last one to read `max(seq)`.
 *
 * `kind` is still a bare string, which is the half of the journal this does not
 * fix. What it does fix is that the write and the read now meet at one type, so
 * there is somewhere for the union to go.
 */
export interface JournalWrite {
  seatId: string | null;
  turn: number;
  kind: string;
  payload?: Record<string, unknown>;
  manual?: boolean;
}

/**
 * What a command decided to write, as data rather than as calls.
 *
 * Being data is what makes it testable — a test reads the changeset instead of
 * watching for database traffic — and what makes it composable: a command that
 * cascades into another folds their changesets together and commits once.
 */
export interface Changeset {
  game?: Partial<GameRow>;
  seats?: SeatPatch[];
  holdings?: { insert?: NewHolding[]; patch?: HoldingPatch[]; delete?: string[] };
  fieldCards?: { insert?: NewFieldCard[]; delete?: string[] };
  effects?: { insert?: NewEffect[]; patch?: EffectPatch[]; delete?: string[] };
  journal?: JournalWrite[];
}

/** What a command produces: what to write, and what to tell the caller. */
export interface Outcome<T = void> {
  writes: Changeset;
  result: T;
}

export interface CommandPorts {
  random: RandomPort;
  /**
   * The wall clock, as a port.
   *
   * A handful of rules are measured in seconds rather than in turns — the claim
   * on the floor before a fight lapses after thirty of them — and a command
   * that reads the clock itself cannot be asked what it would do at a
   * particular moment. Same argument as the dice.
   */
  now: () => number;
}

/**
 * A command.
 *
 * Pure but for its ports: given the same snapshot and the same rolls it returns
 * the same changeset, every time, with no database anywhere near it. That is
 * the whole of why this shape exists.
 */
export type Handler<C, T> = (
  snapshot: Snapshot,
  command: C,
  ports: CommandPorts,
) => Outcome<T> | Promise<Outcome<T>>;

/* --------------------------------------------------------------------------
 * Folding changesets together.
 * ----------------------------------------------------------------------- */

function both<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a) return b;
  if (!b) return a;
  return [...a, ...b];
}

function drop<T extends object>(value: T): T | undefined {
  return Object.values(value).some((entry) => entry !== undefined) ? value : undefined;
}

/**
 * Two changesets as one, in order.
 *
 * Lists concatenate; a `game` patch is merged key by key with the later one
 * winning, which is the same rule two consecutive writes to the same column
 * would have had.
 */
export function merge(first: Changeset, second: Changeset): Changeset {
  return {
    ...(first.game || second.game ? { game: { ...first.game, ...second.game } } : {}),
    ...(both(first.seats, second.seats) ? { seats: both(first.seats, second.seats) } : {}),
    ...(first.holdings || second.holdings
      ? {
          holdings: drop({
            insert: both(first.holdings?.insert, second.holdings?.insert),
            patch: both(first.holdings?.patch, second.holdings?.patch),
            delete: both(first.holdings?.delete, second.holdings?.delete),
          }),
        }
      : {}),
    ...(first.fieldCards || second.fieldCards
      ? {
          fieldCards: drop({
            insert: both(first.fieldCards?.insert, second.fieldCards?.insert),
            delete: both(first.fieldCards?.delete, second.fieldCards?.delete),
          }),
        }
      : {}),
    ...(first.effects || second.effects
      ? {
          effects: drop({
            insert: both(first.effects?.insert, second.effects?.insert),
            patch: both(first.effects?.patch, second.effects?.patch),
            delete: both(first.effects?.delete, second.effects?.delete),
          }),
        }
      : {}),
    ...(both(first.journal, second.journal)
      ? { journal: both(first.journal, second.journal) }
      : {}),
  };
}

/** All of them, in order. */
export function mergeAll(...sets: readonly Changeset[]): Changeset {
  return sets.reduce<Changeset>((all, one) => merge(all, one), {});
}

/**
 * Patches for the same row, folded in the order they were written.
 *
 * `commit` applies them one after another, so two patches for one seat both
 * land. A `Map` keyed by id keeps only the last, which made `apply` disagree
 * with the database about what a changeset means — and a cascade reading its
 * own work would have seen the earlier patch quietly undone. A loss on a bridge
 * wrote exactly that shape: the point of Życie, then the bar on trying again.
 */
function byId<T extends object>(
  patches: readonly { id: string; patch: T }[] | undefined,
): Map<string, T> {
  const folded = new Map<string, T>();
  for (const one of patches ?? []) {
    folded.set(one.id, { ...(folded.get(one.id) ?? {}), ...one.patch } as T);
  }
  return folded;
}

let pending = 0;
/**
 * An id for a row that does not have one yet.
 *
 * Only ever seen by `apply` and therefore by cascades and tests; the database
 * assigns the real one. Distinctive on purpose, so a value that escapes into a
 * write is obvious rather than plausible.
 */
function pendingId(): string {
  pending += 1;
  return `pending:${pending}`;
}

/**
 * The changeset folded into the snapshot, in memory.
 *
 * Two jobs, and they are the same job. A command that cascades — a death that
 * ends the turn — hands the next step a snapshot that already knows what the
 * first step decided, so nothing has to go back to the database to see its own
 * work. And a test applies the changeset to a literal snapshot to ask what the
 * table would look like afterwards, which is the same question without a
 * database in it.
 */
export function apply(snapshot: Snapshot, writes: Changeset): Snapshot {
  const patched = { ...snapshot.game, ...(writes.game ?? {}) } as Snapshot["game"];

  const seatPatches = byId(writes.seats);
  const seats = snapshot.seats.map((seat) => {
    const patch = seatPatches.get(seat.id);
    return patch ? ({ ...seat, ...patch } as SeatRow) : seat;
  });

  const goneHoldings = new Set(writes.holdings?.delete ?? []);
  const holdingPatches = byId(writes.holdings?.patch);
  const holdings = snapshot.holdings
    .filter((held) => !goneHoldings.has(held.id))
    .map((held) => {
      const patch = holdingPatches.get(held.id);
      return patch ? ({ ...held, ...patch } as HoldingRow) : held;
    })
    .concat(
      (writes.holdings?.insert ?? []).map((one) => ({
        id: pendingId(),
        seat_id: one.seat_id,
        card_id: one.card_id,
        kind: one.kind,
        face: one.face ?? "open",
        slot: one.slot ?? null,
        ordinal: one.ordinal ?? null,
        granted: one.granted ?? false,
      })),
    );

  const goneFieldCards = new Set(writes.fieldCards?.delete ?? []);
  const fieldCards = snapshot.fieldCards
    .filter((card) => !goneFieldCards.has(card.id))
    .concat(
      (writes.fieldCards?.insert ?? []).map((one) => ({
        id: pendingId(),
        field_id: one.field_id,
        card_id: one.card_id,
        granted: one.granted ?? false,
      })),
    );

  const goneEffects = new Set(writes.effects?.delete ?? []);
  const effectPatches = byId(writes.effects?.patch);
  const effects = snapshot.effects
    .filter((effect) => !goneEffects.has(effect.id))
    .map((effect) => {
      const patch = effectPatches.get(effect.id);
      return patch ? { ...effect, ...patch } : effect;
    })
    .concat(
      (writes.effects?.insert ?? []).map((one) => ({ id: pendingId(), ...one })),
    );

  return {
    game: patched,
    seats,
    holdings,
    fieldCards,
    effects,
    journalSeq: snapshot.journalSeq + (writes.journal?.length ?? 0),
  };
}

/* --------------------------------------------------------------------------
 * Reading and writing it.
 * ----------------------------------------------------------------------- */

export async function effectRowsFor(gameId: string): Promise<EffectRow[]> {
  const { data, error } = await db
    .from("seat_effects")
    .select("id,seat_id,source,label,modifier,ends")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Error(`effectsFor: ${error.message}`);
  return (data ?? []) as EffectRow[];
}

async function highestSeq(gameId: string): Promise<number> {
  const { data, error } = await db
    .from("moves")
    .select("seq")
    .eq("game_id", gameId)
    .order("seq", { ascending: false })
    .limit(1);
  if (error) throw new Error(`journalSeq: ${error.message}`);
  return (data?.[0]?.seq as number) ?? 0;
}

async function gameRow(gameId: string): Promise<Snapshot["game"]> {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLUMNS)
    .eq("id", gameId)
    .single();
  if (error) throw new Error(`loadGame: ${error.message}`);
  return data as Snapshot["game"];
}

export async function loadSnapshot(gameId: string): Promise<Snapshot> {
  const [game, seats, holdings, fieldCards, effects, journalSeq] = await Promise.all([
    gameRow(gameId),
    seatsFor(gameId),
    holdingsFor(gameId),
    fieldCardsFor(gameId),
    effectRowsFor(gameId),
    highestSeq(gameId),
  ]);
  return { game, seats, holdings, fieldCards, effects, journalSeq };
}

/** Somebody else changed this game while we were deciding what to do to it. */
export class Conflict extends Error {
  constructor(readonly gameId: string, readonly base: number) {
    super(`Stół zmienił się w trakcie (rewizja ${base}).`);
    this.name = "Conflict";
  }
}

/**
 * Writes the changeset, or writes none of it.
 *
 * The games row is taken first and taken conditionally — `revision` must still
 * be what the snapshot read — which makes it the lock for the whole change. If
 * somebody got there first the update matches no row, nothing else has been
 * written yet, and the caller can throw the decision away and make it again
 * against what is actually there. This is `joinGame`'s trick, which has been
 * the only correct concurrency in this codebase for a while, applied to
 * everything instead of to sitting down.
 *
 * What it does not survive is the process dying between the games row and the
 * last child write. Closing that needs a real transaction, which is a change of
 * commit and nothing else: no command knows how its changeset is written.
 */
export async function commit(snapshot: Snapshot, writes: Changeset): Promise<number> {
  const gameId = snapshot.game.id;
  const base = snapshot.game.revision;
  const next = base + 1;

  const { data: won, error: gameError } = await db
    .from("games")
    .update({
      ...(writes.game ?? {}),
      revision: next,
      // Every change is a moment the table was being played, which is what a
      // list of games needs to sort by — not when it was opened.
      last_played_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("revision", base)
    .select("revision");
  if (gameError) throw new Error(`commit(games): ${gameError.message}`);
  if (!won || won.length === 0) throw new Conflict(gameId, base);

  for (const seat of writes.seats ?? []) {
    const { error } = await db.from("seats").update(seat.patch).eq("id", seat.id);
    if (error) throw new Error(`commit(seats): ${error.message}`);
  }

  if (writes.holdings?.delete?.length) {
    const { error } = await db.from("holdings").delete().in("id", writes.holdings.delete);
    if (error) throw new Error(`commit(holdings.delete): ${error.message}`);
  }
  for (const held of writes.holdings?.patch ?? []) {
    const { error } = await db.from("holdings").update(held.patch).eq("id", held.id);
    if (error) throw new Error(`commit(holdings.patch): ${error.message}`);
  }
  if (writes.holdings?.insert?.length) {
    const { error } = await db
      .from("holdings")
      .insert(writes.holdings.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Error(`commit(holdings.insert): ${error.message}`);
  }

  if (writes.fieldCards?.delete?.length) {
    const { error } = await db.from("field_cards").delete().in("id", writes.fieldCards.delete);
    if (error) throw new Error(`commit(fieldCards.delete): ${error.message}`);
  }
  if (writes.fieldCards?.insert?.length) {
    const { error } = await db
      .from("field_cards")
      .insert(writes.fieldCards.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Error(`commit(fieldCards.insert): ${error.message}`);
  }

  if (writes.effects?.delete?.length) {
    const { error } = await db.from("seat_effects").delete().in("id", writes.effects.delete);
    if (error) throw new Error(`commit(effects.delete): ${error.message}`);
  }
  for (const effect of writes.effects?.patch ?? []) {
    const { error } = await db.from("seat_effects").update(effect.patch).eq("id", effect.id);
    if (error) throw new Error(`commit(effects.patch): ${error.message}`);
  }
  if (writes.effects?.insert?.length) {
    const { error } = await db
      .from("seat_effects")
      .insert(writes.effects.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Error(`commit(effects.insert): ${error.message}`);
  }

  // Numbered from the high-water mark the snapshot read, written in one insert,
  // and — unlike every journal write before this — the error is looked at. A
  // line that could not be written was silently dropped, which is the one
  // failure the journal must not have: it exists to be believed when the app
  // and the board disagree.
  const lines = writes.journal ?? [];
  if (lines.length > 0) {
    const { error } = await db.from("moves").insert(
      lines.map((line, index) => ({
        game_id: gameId,
        seq: snapshot.journalSeq + 1 + index,
        seat_id: line.seatId,
        turn: line.turn,
        kind: line.kind,
        payload: line.payload ?? {},
        manual: line.manual ?? false,
      })),
    );
    if (error) throw new Error(`commit(moves): ${error.message}`);
  }

  return next;
}

/** How many times a losing commit is worth re-deciding before giving up. */
const ATTEMPTS = 4;

/**
 * Runs one command against one game: read it, decide, write it.
 *
 * The only place in the app that both reads and writes a game. A command that
 * throws — a rule refusing something — never reaches the commit, so a refusal
 * cannot leave half a change behind, which is not true of the code this
 * replaces.
 */
export async function change<C, T>(
  gameId: string,
  handler: Handler<C, T>,
  command: C,
  options: { random?: RandomPort; now?: () => number } = {},
): Promise<T> {
  const base = options.random ?? appRandom();
  // Outlives the attempts, so a retry throws the same dice: see `replayable`.
  const rolls: number[] = [];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const snapshot = await loadSnapshot(gameId);
    const { writes, result } = await handler(snapshot, command, {
      random: replayable(base, rolls),
      now: options.now ?? Date.now,
    });
    try {
      await commit(snapshot, writes);
      return result;
    } catch (error) {
      if (!(error instanceof Conflict) || attempt === ATTEMPTS) throw error;
    }
  }
  // Unreachable: the loop either returns or throws on its last attempt.
  throw new Conflict(gameId, -1);
}
