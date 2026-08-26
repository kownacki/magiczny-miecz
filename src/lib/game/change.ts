/** One change to one game: the snapshot it reads, the changeset it writes, and the commit that makes the whole of it true at once. */

import { db } from "@/lib/supabase";
import {
  GAME_COLUMNS,
  fieldCardsFor,
  holdingsFor,
  seatsFor,
  usersFor,
  type FieldCardRow,
  type GameRow,
  type HoldingRow,
  type SeatRow,
  type UserRow,
} from "./store";
import type { TurnPhase } from "@/lib/engine/turn";
import type { Ends, Modifier } from "@/lib/engine/status";
import type { RandomPort } from "@/lib/engine/ports";
import type { JournalKind } from "@/lib/engine/journal";
import { appRandom, replayable } from "./random";
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
  game: GameRow & { turn_state: TurnPhase };
  seats: SeatRow[];
  /** Everybody at the table, seated or watching. */
  users: UserRow[];
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
 * `kind` is a `JournalKind`, so a writer cannot invent one and a reader cannot
 * forget one — see the note on `JOURNAL_KINDS`.
 */
export interface JournalWrite {
  seatId: string | null;
  turn: number;
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
  game?: Partial<GameRow>;
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
    users,
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
  if (error) throw new Failure(`effectsFor: ${error.message}`);
  return (data ?? []) as EffectRow[];
}

async function gameRow(gameId: string): Promise<Snapshot["game"]> {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLUMNS)
    .eq("id", gameId)
    .single();
  if (error) throw new Failure(`loadGame: ${error.message}`);
  return data as Snapshot["game"];
}

export async function loadSnapshot(gameId: string): Promise<Snapshot> {
  const [game, seats, users, holdings, fieldCards, effects] = await Promise.all([
    gameRow(gameId),
    seatsFor(gameId),
    usersFor(gameId),
    holdingsFor(gameId),
    fieldCardsFor(gameId),
    effectRowsFor(gameId),
  ]);
  // Off the games row, which is also the row that has to be won to write at
  // all. It used to be a sixth query — `max(seq)` — read at the same moment as
  // everything else and settled long before the journal line was written, which
  // is precisely the gap two changes used to meet in.
  return { game, seats, users, holdings, fieldCards, effects, journalSeq: game.journal_seq };
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
    !writes.fieldCards?.delete?.length &&
    !writes.effects?.insert?.length &&
    !writes.effects?.patch?.length &&
    !writes.effects?.delete?.length &&
    !writes.journal?.length
  );
}

export async function commit(snapshot: Snapshot, writes: Changeset): Promise<number> {
  const gameId = snapshot.game.id;
  const base = snapshot.game.revision;
  const next = base + 1;

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

  const lines = writes.journal ?? [];
  const { data: won, error: gameError } = await db
    .from("games")
    .update({
      ...(writes.game ?? {}),
      revision: next,
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
    })
    .eq("id", gameId)
    .eq("revision", base)
    .select("revision");
  if (gameError) throw new Failure(`commit(games): ${gameError.message}`);
  if (!won || won.length === 0) throw new Conflict(gameId, base);

  // Removed before patched, in the order `apply` folds them, so that a change
  // doing both to one seat lands the way it said it would.
  //
  // Scoped to this game, like every other delete below it. The ids come out of
  // a snapshot of this table and cannot be anything else today — but this
  // schema shares a Postgres instance with three other projects and the
  // service-role key reaches all of them, so a delete whose only filter is a
  // list of ids is one bad id away from being somebody else's problem.
  if (writes.seatsRemoved?.length) {
    const { error } = await db.from("seats").delete().eq("game_id", gameId).in("id", writes.seatsRemoved);
    if (error) throw new Failure(`commit(seatsRemoved): ${error.message}`);
  }
  for (const seat of writes.seats ?? []) {
    const { error } = await db.from("seats").update(seat.patch).eq("id", seat.id);
    if (error) throw new Failure(`commit(seats): ${error.message}`);
  }

  if (writes.usersRemoved?.length) {
    const { error } = await db.from("users").delete().eq("game_id", gameId).in("id", writes.usersRemoved);
    if (error) throw new Failure(`commit(usersRemoved): ${error.message}`);
  }
  if (writes.usersNew?.length) {
    const { error } = await db
      .from("users")
      .insert(writes.usersNew.map((fresh) => ({ ...fresh, game_id: gameId })));
    if (error) throw new Failure(`commit(usersNew): ${error.message}`);
  }
  for (const user of writes.users ?? []) {
    const { error } = await db.from("users").update(user.patch).eq("id", user.id);
    if (error) throw new Failure(`commit(users): ${error.message}`);
  }

  if (writes.holdings?.delete?.length) {
    const { error } = await db.from("holdings").delete().eq("game_id", gameId).in("id", writes.holdings.delete);
    if (error) throw new Failure(`commit(holdings.delete): ${error.message}`);
  }
  for (const held of writes.holdings?.patch ?? []) {
    const { error } = await db.from("holdings").update(held.patch).eq("id", held.id);
    if (error) throw new Failure(`commit(holdings.patch): ${error.message}`);
  }
  if (writes.holdings?.insert?.length) {
    const { error } = await db
      .from("holdings")
      .insert(writes.holdings.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Failure(`commit(holdings.insert): ${error.message}`);
  }

  if (writes.fieldCards?.delete?.length) {
    const { error } = await db.from("field_cards").delete().eq("game_id", gameId).in("id", writes.fieldCards.delete);
    if (error) throw new Failure(`commit(fieldCards.delete): ${error.message}`);
  }
  if (writes.fieldCards?.insert?.length) {
    const { error } = await db
      .from("field_cards")
      .insert(writes.fieldCards.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Failure(`commit(fieldCards.insert): ${error.message}`);
  }

  if (writes.effects?.delete?.length) {
    const { error } = await db.from("seat_effects").delete().eq("game_id", gameId).in("id", writes.effects.delete);
    if (error) throw new Failure(`commit(effects.delete): ${error.message}`);
  }
  for (const effect of writes.effects?.patch ?? []) {
    const { error } = await db.from("seat_effects").update(effect.patch).eq("id", effect.id);
    if (error) throw new Failure(`commit(effects.patch): ${error.message}`);
  }
  if (writes.effects?.insert?.length) {
    const { error } = await db
      .from("seat_effects")
      .insert(writes.effects.insert.map((one) => ({ game_id: gameId, ...one })));
    if (error) throw new Failure(`commit(effects.insert): ${error.message}`);
  }

  // Numbered from the high-water mark the snapshot read, written in one insert,
  // and — unlike every journal write before this — the error is looked at. A
  // line that could not be written was silently dropped, which is the one
  // failure the journal must not have: it exists to be believed when the app
  // and the board disagree.
  if (lines.length > 0) await appendJournal(gameId, snapshot.journalSeq, lines);

  return next;
}

/**
 * Writes the lines, numbered from the range this change has already claimed.
 *
 * No retry and nothing to recover from: `commit` took these numbers in the
 * same statement that won the games row, so nobody else can be holding them.
 * The unique constraint on (game_id, seq) stays as the thing that would say so
 * if that ever stopped being true.
 */
async function appendJournal(
  gameId: string,
  from: number,
  lines: readonly JournalWrite[],
): Promise<void> {
  const { error } = await db.from("moves").insert(
    lines.map((line, index) => ({
      game_id: gameId,
      seq: from + 1 + index,
      seat_id: line.seatId,
      turn: line.turn,
      kind: line.kind,
      payload: line.payload ?? {},
      manual: line.manual ?? false,
    })),
  );
  // Looked at, unlike every journal write before this one: a line that could
  // not be written was dropped in silence, which is the single failure the
  // journal must not have.
  if (error) throw new Failure(`commit(moves): ${error.message}`);
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
  command: C,
  options: { random?: RandomPort; now?: () => number },
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
