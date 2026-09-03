/** One change to one game: the snapshot it reads, the changeset it writes, and the commit that makes the whole of it true at once. */

import { type DbHandle } from "@/lib/supabase";
import { handleNow } from "./handle";
import { activeStore, type GameStore } from "./gameStore";
import { writeTo } from "./tables";
import type { Statement } from "./statements";
import {
  GAME_COLUMNS,
  fieldCardsFor,
  fieldGoldFor,
  holdingsFor,
  seatsFor,
  usersFor,
  type FieldCardRow,
  type FieldGoldRow,
  type GameRow,
  type HoldingRow,
  type SeatRow,
  type UserRow,
} from "./store";
import { asTurnState, type TurnState } from "@/lib/engine/stack";
import type { Ends, Modifier } from "@/lib/engine/status";
import type { RandomPort } from "@/lib/engine/ports";
import type { JournalKind } from "@/lib/engine/journal";
import { appRandom, replayable } from "./random";
import { nextScripted, noteRolls } from "./record";
import { serially } from "./queue";
import { Failure } from "./failure";

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
  game: GameRow & { turn_state: TurnState };
  seats: SeatRow[];
  /** Everybody at the table, seated or watching. */
  users: UserRow[];
  holdings: HoldingRow[];
  fieldCards: FieldCardRow[];
  fieldGold: FieldGoldRow[];
  effects: EffectRow[];
  /** The highest `seq` the journal held when this was read. */
  journalSeq: number;
}

/* --------------------------------------------------------------------------
 * The changeset: everything one change may write.
 * ----------------------------------------------------------------------- */

export interface SeatPatch {
  id: string;
  /**
   * `claim_token` is writable here and readable nowhere.
   *
   * It is the one seat column `SEAT_COLUMNS` deliberately leaves out, because a
   * `SeatRow` is a thing that gets sent to devices and the token is what proves
   * a device is that seat. Rotating it is how a seat is released — see
   * `leaveSeat` — so a changeset has to be able to set it without a snapshot
   * ever having held it.
   */
  patch: Partial<Omit<SeatRow, "id">> & { claim_token?: string };
}

export interface UserPatch {
  id: string;
  /**
   * `claim_token` is writable here and readable nowhere, exactly as it was on a
   * seat: a `UserRow` is sent to devices and the token is what proves a device
   * is that person. Rotating it is how somebody is put out of a seat.
   */
  patch: Partial<Omit<UserRow, "id">> & { claim_token?: string };
}

/** Somebody arriving. The id is minted by the caller — see `makeUserId`. */
export interface NewUser {
  id: string;
  name: string;
  claim_token: string;
  device_id?: string | null;
  is_host?: boolean;
  seat_index?: number | null;
}

export interface NewHolding {
  seat_id: string;
  card_id: string;
  kind: HoldingRow["kind"];
  face?: HoldingRow["face"];
  slot?: string | null;
  ordinal?: number | null;
  granted?: boolean;
  /** For `kind: "carried"`: the card_id of the Przyjaciel it lies with. */
  carried_by?: string | null;
}

export interface HoldingPatch {
  id: string;
  patch: Partial<Omit<HoldingRow, "id">>;
}

export interface NewFieldCard {
  field_id: string;
  card_id: string;
  granted?: boolean;
  /** Seeded from the card's own `zostaje-z-pula`; absent for everything else. */
  pool?: number | null;
}

/**
 * A Karta on an Obszar changing without leaving it.
 *
 * There was no such thing until the wells: a card on a field arrived, sat
 * there, and left, so insert and delete were the whole vocabulary. A Drzewo
 * Życia with one fruit left is the same Karta on the same Obszar with a
 * different number beside it, which is a patch and not a delete followed by an
 * insert — that pair would give it a new row id and lose its place in
 * `created_at`, and arrival order is what orders the Obszar's inventory.
 */
export interface FieldCardPatch {
  id: string;
  patch: Partial<Omit<FieldCardRow, "id">>;
}

export interface NewFieldGold {
  field_id: string;
  gold: number;
}

export interface FieldGoldPatch {
  id: string;
  patch: Partial<Omit<FieldGoldRow, "id">>;
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
 * `kind` is a `JournalKind`, so a writer cannot invent one and a reader cannot
 * forget one — see the note on `JOURNAL_KINDS`.
 */
export interface JournalWrite {
  seatId: string | null;
  /** The round it happened in — `games.round`, not a seat's own go. */
  round: number;
  kind: JournalKind;
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
  /**
   * `turn_state` is retyped here because `GameRow` leaves it `unknown` — the
   * row type mirrors the database, which holds JSON. `unknown` accepts
   * anything, so with `Partial<GameRow>` alone a writer could hand back the
   * pre-stack shape and the compiler would wave it through. Every writer goes
   * through this interface, so this is where the shape is enforced.
   */
  game?: Partial<Omit<GameRow, "turn_state">> & { turn_state?: TurnState };
  seats?: SeatPatch[];
  /**
   * Seat rows to remove, by id — and deliberately not `seats: { delete }`.
   *
   * Holdings, field cards and effects come and go all game, so those three
   * carry a symmetrical insert/patch/delete. A seat row does not: once play
   * has begun it is permanent by design, because the journal holds `seat_id`
   * references to everything that seat ever did and 4.4's death retires a
   * character rather than erasing it. Only the poczekalnia deletes one — a
   * player who joined the wrong table, or a tab that closed before the game
   * started — and making that look as routine as discarding a card would say
   * something about seats that is not true.
   *
   * Removals are applied before patches, here and in `apply`, so the two agree
   * about a change that does both — which the lobby does whenever the seat
   * leaving is the one holding the host role.
   */
  seatsRemoved?: string[];
  /**
   * People, who unlike seats come and go all game.
   *
   * So this one does carry a symmetrical insert/patch/remove: a user row is not
   * permanent by design the way a seat is, and nothing in the journal points at
   * one that has to survive — `moves` keeps the name it printed rather than a
   * reference to whoever holds it now.
   */
  users?: UserPatch[];
  usersNew?: NewUser[];
  usersRemoved?: string[];
  holdings?: { insert?: NewHolding[]; patch?: HoldingPatch[]; delete?: string[] };
  fieldCards?: { insert?: NewFieldCard[]; patch?: FieldCardPatch[]; delete?: string[] };
  /**
   * Loose Sztuki Złota on an Obszar (12.1).
   *
   * A row per Obszar rather than a number on a shared column, so two commands
   * that both put gold down in one turn add up instead of the later one winning
   * — the trap CLAUDE.md names about `merge` and `game.deck`.
   */
  fieldGold?: { insert?: NewFieldGold[]; patch?: FieldGoldPatch[]; delete?: string[] };
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
    ...(both(first.seatsRemoved, second.seatsRemoved)
      ? { seatsRemoved: both(first.seatsRemoved, second.seatsRemoved) }
      : {}),
    ...(both(first.users, second.users) ? { users: both(first.users, second.users) } : {}),
    ...(both(first.usersNew, second.usersNew)
      ? { usersNew: both(first.usersNew, second.usersNew) }
      : {}),
    ...(both(first.usersRemoved, second.usersRemoved)
      ? { usersRemoved: both(first.usersRemoved, second.usersRemoved) }
      : {}),
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
            patch: both(first.fieldCards?.patch, second.fieldCards?.patch),
            delete: both(first.fieldCards?.delete, second.fieldCards?.delete),
          }),
        }
      : {}),
    ...(first.fieldGold || second.fieldGold
      ? {
          fieldGold: drop({
            insert: both(first.fieldGold?.insert, second.fieldGold?.insert),
            patch: both(first.fieldGold?.patch, second.fieldGold?.patch),
            delete: both(first.fieldGold?.delete, second.fieldGold?.delete),
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

  const goneSeats = new Set(writes.seatsRemoved ?? []);
  const seatPatches = byId(writes.seats);
  const seats = snapshot.seats
    .filter((seat) => !goneSeats.has(seat.id))
    .map((seat) => {
      const patch = seatPatches.get(seat.id);
      return patch ? ({ ...seat, ...patch } as SeatRow) : seat;
    });

  const goneUsers = new Set(writes.usersRemoved ?? []);
  const userPatches = byId(writes.users);
  const users = [
    ...snapshot.users
      .filter((user) => !goneUsers.has(user.id))
      .map((user) => {
        const patch = userPatches.get(user.id);
        return patch ? ({ ...user, ...patch } as UserRow) : user;
      }),
    ...(writes.usersNew ?? []).map((fresh) => ({
      id: fresh.id,
      name: fresh.name,
      device_id: fresh.device_id ?? null,
      is_host: fresh.is_host ?? false,
      ready: false,
      seat_index: fresh.seat_index ?? null,
      seen_at: null,
      left_at: null,
      created_at: new Date(0).toISOString(),
    })),
  ];

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
        carried_by: one.carried_by ?? null,
      })),
    );

  const goneFieldCards = new Set(writes.fieldCards?.delete ?? []);
  const fieldCardPatches = byId(writes.fieldCards?.patch);
  const fieldCards = snapshot.fieldCards
    .filter((card) => !goneFieldCards.has(card.id))
    // Removals before patches, here and in `commit`, so the two agree about a
    // Karta that was drunk dry and taken off the Obszar in one Changeset.
    .map((card) => {
      const patch = fieldCardPatches.get(card.id);
      return patch ? ({ ...card, ...patch } as FieldCardRow) : card;
    })
    .concat(
      (writes.fieldCards?.insert ?? []).map((one) => ({
        id: pendingId(),
        field_id: one.field_id,
        card_id: one.card_id,
        granted: one.granted ?? false,
        pool: one.pool ?? null,
      })),
    );

  const goneFieldGold = new Set(writes.fieldGold?.delete ?? []);
  const fieldGoldPatches = byId(writes.fieldGold?.patch);
  const fieldGold = snapshot.fieldGold
    .filter((row) => !goneFieldGold.has(row.id))
    .map((row) => {
      const patch = fieldGoldPatches.get(row.id);
      return patch ? ({ ...row, ...patch } as FieldGoldRow) : row;
    })
    .concat(
      (writes.fieldGold?.insert ?? []).map((one) => ({
        id: pendingId(),
        field_id: one.field_id,
        gold: one.gold,
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
    users,
    holdings,
    fieldCards,
    fieldGold,
    effects,
    journalSeq: snapshot.journalSeq + (writes.journal?.length ?? 0),
  };
}

/* --------------------------------------------------------------------------
 * Reading and writing it.
 * ----------------------------------------------------------------------- */

export async function effectRowsFor(gameId: string, on: DbHandle = handleNow()): Promise<EffectRow[]> {
  const { data, error } = await on
    .from("seat_effects")
    .select("id,seat_id,source,label,modifier,ends")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Failure(`effectsFor: ${error.message}`);
  return (data ?? []) as EffectRow[];
}

async function gameRow(gameId: string, on: DbHandle = handleNow()): Promise<Snapshot["game"]> {
  const { data, error } = await on
    .from("games")
    .select(GAME_COLUMNS)
    .eq("id", gameId)
    .single();
  if (error) throw new Failure(`loadGame: ${error.message}`);
  /**
   * The one door a stored turn walks through on its way in, so the tolerant
   * read happens exactly once. Rows written before the stack — including the
   * column's own default — arrive as a one-frame stack; see `asTurnState`.
   */
  const row = data as GameRow;
  return { ...row, turn_state: asTurnState(row.turn_state) };
}

export async function loadSnapshot(gameId: string, on: DbHandle = handleNow()): Promise<Snapshot> {
  const [game, seats, users, holdings, fieldCards, fieldGold, effects] = await Promise.all([
    gameRow(gameId, on),
    seatsFor(gameId, on),
    usersFor(gameId, on),
    holdingsFor(gameId, on),
    fieldCardsFor(gameId, on),
    fieldGoldFor(gameId, on),
    effectRowsFor(gameId, on),
  ]);
  // Off the games row, which is also the row that has to be won to write at
  // all. It used to be a sixth query — `max(seq)` — read at the same moment as
  // everything else and settled long before the journal line was written, which
  // is precisely the gap two changes used to meet in.
  return { game, seats, users, holdings, fieldCards, fieldGold, effects, journalSeq: game.journal_seq };
}

/** Somebody else changed this game while we were deciding what to do to it. */
export class Conflict extends Error {
  constructor(readonly gameId: string, readonly base: number) {
    super(`Stół zmienił się w trakcie (rewizja ${base}).`);
    this.name = "Conflict";
  }
}

/**
 * Whether a changeset asks for anything at all.
 *
 * A command that decided to do nothing is not the same as a command that
 * failed, and both are ordinary: the lobby sweep runs on every poll from every
 * device and finds nobody gone almost every time.
 */
export function isEmpty(writes: Changeset): boolean {
  return (
    // Counted by its keys and not by its presence: `{ game: {} }` set no
    // column and would still have taken the row, bumped the revision and woken
    // every browser at the table for it.
    !Object.keys(writes.game ?? {}).length &&
    !writes.seats?.length &&
    !writes.seatsRemoved?.length &&
    !writes.users?.length &&
    !writes.usersNew?.length &&
    !writes.usersRemoved?.length &&
    !writes.holdings?.insert?.length &&
    !writes.holdings?.patch?.length &&
    !writes.holdings?.delete?.length &&
    !writes.fieldCards?.insert?.length &&
    !writes.fieldCards?.patch?.length &&
    !writes.fieldCards?.delete?.length &&
    !writes.fieldGold?.insert?.length &&
    !writes.fieldGold?.patch?.length &&
    !writes.fieldGold?.delete?.length &&
    !writes.effects?.insert?.length &&
    !writes.effects?.patch?.length &&
    !writes.effects?.delete?.length &&
    !writes.journal?.length
  );
}

/**
 * Everything the changeset writes, in the order it has to happen, as data.
 *
 * Pulled out of `commit` and handed back rather than issued, because a change
 * that lands whole or not at all has to be *one* thing before it can be handed
 * to anything — see `statements.ts` for the failure that made that necessary,
 * and for why the runner is generic instead of knowing what a Karta is.
 *
 * Being data also makes the order testable. "Removals before patches, so a
 * changeset that does both to one seat lands the way `apply` folded it" used to
 * be provable only by watching a fake database take nineteen calls in turn; it
 * is now a list somebody can read.
 */
export function statementsFor(snapshot: Snapshot, writes: Changeset): Statement[] {
  const gameId = snapshot.game.id;
  const base = snapshot.game.revision;
  const lines = writes.journal ?? [];
  const out: Statement[] = [];

  /**
   * The games row, taken first and taken conditionally, which makes it the lock
   * for the whole change — and now also the first statement of one transaction,
   * so every writer at this table queues behind the same row in the same order.
   *
   * `expect: 1` is the compare-and-swap. If `revision` has moved the update
   * matches nothing, the runner undoes the statements after it and answers
   * false, and `commit` turns that into a `Conflict`: the caller throws its
   * decision away and makes it again against what is actually there. This is
   * `joinGame`'s trick, which was the only correct concurrency in this codebase
   * for a while, applied to everything instead of to sitting down.
   */
  out.push(
    writeTo.games.update(
      { id: gameId, revision: base },
      {
        ...(writes.game ?? {}),
        revision: base + 1,
        /**
         * The journal's line numbers, claimed in the same statement that wins
         * the right to write anything.
         *
         * They used to be counted off `max(seq)` read at snapshot time and
         * written last, after the seats and the holdings — so a second change
         * could read the table, win this row, and reach the journal while the
         * first was still working, both holding the same number. The constraint
         * said so, out loud, to whoever was typing:
         *
         *   duplicate key value violates unique constraint "moves_game_id_seq_key"
         *
         * That was answered with a retry, which worked and left a race that
         * merely had to be recovered from. Here the range is *claimed* rather
         * than guessed: this update is the lock, only one writer can take it,
         * and the numbers it takes are gone before anybody else reads the row.
         */
        journal_seq: snapshot.journalSeq + lines.length,
        // Every change is a moment the table was being played, which is what a
        // list of games needs to sort by — not when it was opened.
        last_played_at: new Date().toISOString(),
      },
      1,
    ),
  );

  // Removed before patched, in the order `apply` folds them, so that a change
  // doing both to one seat lands the way it said it would.
  //
  // Scoped to this game, like every other delete below it. The ids come out of
  // a snapshot of this table and cannot be anything else today — but this
  // schema shares a Postgres instance with three other projects and the
  // service-role key reaches all of them, so a delete whose only filter is a
  // list of ids is one bad id away from being somebody else's problem.
  if (writes.seatsRemoved?.length) {
    out.push(writeTo.seats.remove({ game_id: gameId }, { column: "id", values: writes.seatsRemoved }));
  }
  for (const seat of writes.seats ?? []) {
    // Passed whole rather than spread into a literal, so the excess-property
    // check does not fire here — `SeatPatch` is what guards this one, and it is
    // built off `SeatRow` for exactly that reason.
    out.push(writeTo.seats.update({ id: seat.id }, seat.patch));
  }

  if (writes.usersRemoved?.length) {
    out.push(writeTo.users.remove({ game_id: gameId }, { column: "id", values: writes.usersRemoved }));
  }
  if (writes.usersNew?.length) {
    out.push(
      // A spread suppresses the excess-property check, so what protects this is
      // `NewUser` upstream rather than the door itself. One of the three writes
      // in this file the compiler cannot see into — see `tables.ts`.
      writeTo.users.insert(writes.usersNew.map((fresh) => ({ ...fresh, game_id: gameId }))),
    );
  }
  for (const user of writes.users ?? []) {
    out.push(writeTo.users.update({ id: user.id }, user.patch));
  }

  if (writes.holdings?.delete?.length) {
    out.push(
      writeTo.holdings.remove({ game_id: gameId }, { column: "id", values: writes.holdings.delete }),
    );
  }
  for (const held of writes.holdings?.patch ?? []) {
    out.push(writeTo.holdings.update({ id: held.id }, held.patch));
  }
  if (writes.holdings?.insert?.length) {
    out.push(writeTo.holdings.insert(writes.holdings.insert.map((one) => ({ game_id: gameId, ...one }))));
  }

  if (writes.fieldCards?.delete?.length) {
    out.push(
      writeTo.fieldCards.remove({ game_id: gameId }, { column: "id", values: writes.fieldCards.delete }),
    );
  }
  for (const card of writes.fieldCards?.patch ?? []) {
    out.push(writeTo.fieldCards.update({ id: card.id }, card.patch));
  }
  if (writes.fieldCards?.insert?.length) {
    out.push(
      writeTo.fieldCards.insert(
        writes.fieldCards.insert.map((one) => ({
          game_id: gameId,
          ...one,
          // Spelled out rather than spread, exactly as the holdings insert above
          // does it: the field is optional in a `Changeset` and `not null` in the
          // table, and an omitted one spreads as `undefined`, which the runner
          // drops and the column then refuses. It cost a half-written commit the
          // first time a card went down that nobody had conjured.
          granted: one.granted ?? false,
          // Null rather than undefined for the same reason, though this column
          // takes one: an omitted key and an explicit null are the same row here
          // and it is worth them looking the same in the code too.
          pool: one.pool ?? null,
        })),
      ),
    );
  }

  if (writes.fieldGold?.delete?.length) {
    out.push(
      writeTo.fieldGold.remove({ game_id: gameId }, { column: "id", values: writes.fieldGold.delete }),
    );
  }
  for (const row of writes.fieldGold?.patch ?? []) {
    out.push(writeTo.fieldGold.update({ id: row.id }, row.patch));
  }
  if (writes.fieldGold?.insert?.length) {
    out.push(writeTo.fieldGold.insert(writes.fieldGold.insert.map((one) => ({ game_id: gameId, ...one }))));
  }

  if (writes.effects?.delete?.length) {
    out.push(
      writeTo.seatEffects.remove({ game_id: gameId }, { column: "id", values: writes.effects.delete }),
    );
  }
  for (const effect of writes.effects?.patch ?? []) {
    out.push(writeTo.seatEffects.update({ id: effect.id }, effect.patch));
  }
  if (writes.effects?.insert?.length) {
    out.push(writeTo.seatEffects.insert(writes.effects.insert.map((one) => ({ game_id: gameId, ...one }))));
  }

  // Numbered from the high-water mark the snapshot read, written in one insert,
  // and — unlike every journal write before this — it can no longer be the odd
  // one out. It used to be the nineteenth statement of nineteen, so a line the
  // database refused arrived after the Karta had already moved; now a refusal
  // here takes the Karta back with it.
  if (lines.length > 0) out.push(journalStatement(gameId, snapshot.journalSeq, lines, snapshot));

  return out;
}

/**
 * Writes the changeset, or writes none of it.
 *
 * Both halves of that are now literal. The games row is taken first and taken
 * conditionally — `revision` must still be what the snapshot read — which makes
 * it the lock, so somebody who was beaten to it writes nothing and can throw
 * the decision away and make it again against what is actually there. And the
 * rest of the change goes with it: the whole list runs inside one transaction,
 * so a statement the database refuses takes back the ones before it.
 *
 * The second half is new, and it is what the sentence used to promise without
 * keeping. It used to say: "What it does not survive is the process dying
 * between the games row and the last child write. Closing that needs a real
 * transaction, which is a change of commit and nothing else: no command knows
 * how its changeset is written." That turned out to be exactly right, including
 * about the size of it.
 */
export async function commit(
  snapshot: Snapshot,
  writes: Changeset,
  on: DbHandle = handleNow(),
): Promise<number> {
  const base = snapshot.game.revision;

  /**
   * Nothing to write, so nothing is written — not even the revision.
   *
   * The counter exists to tell the other devices that something changed, and
   * `last_played_at` to say when the table was last played. A change that
   * decided to do nothing did neither, and bumping anyway would wake every
   * browser at the table and re-sort the list of games for it. That matters
   * because of where the empty changeset comes from: the poczekalnia sweep runs
   * on every poll from every device, and finds nobody gone almost every time.
   *
   * It also means a command can be written to return `{}` rather than
   * hand-rolling its own "is there anything to do here" check at the call site.
   */
  if (isEmpty(writes)) return base;

  /**
   * One call, and one transaction behind it.
   *
   * `apply_change` is generic — it runs a list of table writes and knows nothing
   * about this game — so the decision above it is still the only one, made in
   * one place, in TypeScript, by `statementsFor`. `fakeDb` answers the same call
   * by applying the same list to a copy of its tables, which is what keeps
   * `mm` and every save file on the commit path the browser uses rather than a
   * cheaper one beside it. See `statements.ts`.
   */
  const { data: applied, error } = await on.rpc("apply_change", {
    statements: statementsFor(snapshot, writes),
  });
  if (error) throw new Failure(`commit: ${error.message}`);
  // False means the compare-and-swap matched no row: somebody else changed this
  // game while we were deciding what to do to it, and everything after that
  // first statement has been rolled back.
  if (applied === false) throw new Conflict(snapshot.game.id, base);

  return base + 1;
}

/**
 * The journal's lines, numbered from the range this change has already claimed.
 *
 * No retry and nothing to recover from: the games update took these numbers in
 * the same statement that won the row, so nobody else can be holding them. The
 * unique constraint on (game_id, seq) stays as the thing that would say so if
 * that ever stopped being true.
 */
function journalStatement(
  gameId: string,
  from: number,
  lines: readonly JournalWrite[],
  /** Read for one thing: who was driving each seat at the moment this happened. */
  snapshot: Snapshot,
): Statement {
  /**
   * The name is frozen here rather than looked up when the line is read.
   *
   * A journal is what you open when the table disagrees about what happened, so
   * it may not change its mind — and it did. Every sentence was built from the
   * seat *as it is now*, so a rename, a takeover, or somebody picking a new
   * Postać after a death rewrote the whole history under today's names: "Ola
   * (GOBLIN) ginie" became "Michał (WIEDŹMA) ginie" three turns later, and the
   * log stopped being evidence of anything.
   *
   * Resolved here rather than by each command, because a command should not have
   * to remember who is sitting where to say what it did — and there is exactly
   * one place every line passes through on its way out.
   */
  const driving = (seatId: string | null) => {
    if (!seatId) return null;
    const seat = snapshot.seats.find((one) => one.id === seatId);
    if (!seat) return null;
    return snapshot.users.find((one) => one.seat_index === seat.seat_index) ?? null;
  };

  return writeTo.moves.insert(
    lines.map((line, index) => ({
      game_id: gameId,
      seq: from + 1 + index,
      seat_id: line.seatId,
      user_id: driving(line.seatId)?.id ?? null,
      actor_name: driving(line.seatId)?.name ?? null,
      round: line.round,
      kind: line.kind,
      payload: line.payload ?? {},
      manual: line.manual ?? false,
    })),
  );
}

/**
 * The port a replay speaks through: recorded dice while they last, then the
 * real one. A line that runs out has diverged, and the comparison says so far
 * more usefully than an exception about dice would.
 */
function replayed(base: RandomPort): RandomPort {
  return {
    async rollD6(reason) {
      return nextScripted() ?? (await base.rollD6(reason));
    },
  };
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
/**
 * A command, or a way to build one once the snapshot is in hand.
 *
 * Almost every command is a plain object the caller already has. The exceptions
 * are the ones carrying a `Shuffle`, which has to be derived from the game's
 * seed and the revision it is happening at — neither of which the caller knows
 * before the snapshot is read. See `shuffleFor`.
 *
 * Built inside the retry loop rather than once, and deliberately: a losing
 * commit re-reads the table, and the note in `commands/draw.ts` is right that
 * it is then not even the same pile being turned over. The rebuilt command gets
 * the shuffle belonging to the revision it actually commits at.
 */
export type Asked<C> = C | ((snapshot: Snapshot) => C);

export async function change<C, T>(
  gameId: string,
  handler: Handler<C, T>,
  command: Asked<C>,
  options: { random?: RandomPort; now?: () => number; store?: GameStore } = {},
): Promise<T> {
  // One change to a table at a time, in the order the table asked for them.
  // The revision check below is what makes concurrent writes *correct*; the
  // queue is what stops them being concurrent in the first place, within one
  // server, which is what every board-game server does with a room. See
  // `queue.ts` for why both.
  return serially(gameId, () => attempt(gameId, handler, command, options));
}

async function attempt<C, T>(
  gameId: string,
  handler: Handler<C, T>,
  command: Asked<C>,
  options: { random?: RandomPort; now?: () => number; store?: GameStore },
): Promise<T> {
  // Where this game is kept. A property of the process rather than of the
  // change — a server is Postgres for its whole life and `mm` is one save file
  // for its whole life — so it is read here rather than passed down sixty call
  // sites. The override is for a test that wants to be explicit.
  const store = options.store ?? activeStore();
  /**
   * A replay's dice come first, then whatever the caller asked for.
   *
   * `supplied([value], appRandom())` is built at the call site before any
   * snapshot exists, so a replay cannot hand its dice in that way — it puts
   * them where the port will look instead. See `record.ts`.
   */
  const base = replayed(options.random ?? appRandom());
  // Outlives the attempts, so a retry throws the same dice: see `replayable`.
  const rolls: number[] = [];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const snapshot = await store.load(gameId);
    const asked =
      typeof command === "function" ? (command as (of: Snapshot) => C)(snapshot) : command;
    const { writes, result } = await handler(snapshot, asked, {
      random: replayable(base, rolls),
      now: options.now ?? Date.now,
    });
    try {
      await store.commit(snapshot, writes);
      // After the commit, so a change that lost its race and re-decided does
      // not leave the dice of an attempt nobody played. `rolls` outlives the
      // attempts, so what is handed over is the throw that actually happened.
      noteRolls(rolls);
      return result;
    } catch (error) {
      if (!(error instanceof Conflict) || attempt === ATTEMPTS) throw error;
    }
  }
  // Unreachable: the loop either returns or throws on its last attempt.
  throw new Conflict(gameId, -1);
}
