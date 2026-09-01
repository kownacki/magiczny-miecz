/** Where a game is kept: the one interface between the rules and anything that persists them. */

import { db, type DbHandle } from "@/lib/supabase";
import { commit, loadSnapshot, type Changeset, type Snapshot } from "./change";
import { fakeDb, type Tables } from "./fakeDb";
import { setHandle } from "./handle";

/**
 * Why this exists.
 *
 * The engine has been pure since the beginning and the commands with it — a
 * command is `(Snapshot, Command, Ports) → Outcome<Changeset, T>` and knows
 * nothing about a database. But there was no way to *run* one without Postgres,
 * because `change()` reached a module-level Supabase handle on both sides of the
 * decision: `loadSnapshot` before, `commit` after. Pure rules, unhostable
 * anywhere else.
 *
 * So the two ends become an interface. What sits behind it can be Postgres, a
 * `Map`, a file on disk, or later an HTTP call to somebody else's table, and no
 * rule and no command learns which — the same trick `RandomPort` already plays
 * for the dice.
 *
 * See docs/TERMINAL.md. This is the seam the terminal build stands on.
 *
 * # The one rule that keeps this from costing double
 *
 * **Every implementation keeps the compare-and-swap.** An in-memory game has no
 * concurrent writers and does not need one — but the moment "offline" gets its
 * own cheaper rules there are two games to keep honest, and that is exactly why
 * companion mode is parked (`COMPANION_PARKED`, and the note in docs/TASKS.md).
 * One contract, proved once, in `gameStore.test.ts`.
 */
export interface GameStore {
  /**
   * The database behind it.
   *
   * Here so that `setStore` can point the *reads* at the same place — they
   * happen outside a change and so cannot go through `load`/`commit`. Without
   * it `mm` wrote to a file and then asked Postgres who was sitting at the
   * table.
   */
  handle: DbHandle;
  /** Everything one change may read, as of now. */
  load(gameId: string): Promise<Snapshot>;
  /**
   * Writes the changeset or writes none of it, and answers with the revision
   * the game now stands at.
   *
   * Throws `Conflict` when somebody else moved first — which the caller answers
   * by deciding again against what is actually there, never by forcing.
   */
  commit(snapshot: Snapshot, writes: Changeset): Promise<number>;
}

/**
 * A store over one handle.
 *
 * Both implementations are this function; only the handle differs. That is not
 * a shortcut, it is the point — two hand-written stores would be two places for
 * the CAS to be subtly different, and the difference would show up as a game
 * that replays wrong rather than as a failing test. What the conformance suite
 * is really proving, then, is that a handle which is not PostgREST behaves like
 * one for the four call shapes this app uses.
 */
export function storeOver(on: DbHandle): GameStore {
  return {
    handle: on,
    load: (gameId) => loadSnapshot(gameId, on),
    commit: (snapshot, writes) => commit(snapshot, writes, on),
  };
}

/**
 * The real one. Everything that has not been told otherwise uses this.
 *
 * `db` is read inside each call rather than captured once, and that is
 * load-bearing rather than fussy: it is a lazy Proxy in production, so
 * capturing it would work — but it is a *getter* under `vi.mock`, handing back
 * a different fake per test, and a store built once at first use would pin the
 * first test's handle and quietly fail the next four. Reading it per call costs
 * nothing and cannot go stale.
 */
export const supabaseStore: GameStore = {
  handle: db,
  load: (gameId) => loadSnapshot(gameId, db),
  commit: (snapshot, writes) => commit(snapshot, writes, db),
};

/**
 * A game held in memory, and the base of the one held in a file.
 *
 * `fakeDb` was written for the commit tests — "enough PostgREST to commit
 * against" — and it is cast to a handle here rather than implementing the whole
 * client. That cast is the seam, and it is the reason the conformance suite
 * exists: a fake that says yes to everything would pass every test that matters
 * and lose every race that matters.
 *
 * The `Tables` object handed in is the game, and it is mutated in place — which
 * is what lets a caller hold onto it and write it to disk after every commit
 * without the store knowing anything about files.
 */
export function memoryStore(tables: Tables): GameStore {
  return storeOver(memoryHandle(tables));
}

/**
 * The cast, in one place.
 *
 * `createGame` and `joinGame` are the two writes that are not a `Changeset` — a
 * changeset can neither invent an id nor hand a token back — so they take a
 * handle rather than a store, and they need this too.
 */
export function memoryHandle(tables: Tables): DbHandle {
  return fakeDb(tables) as unknown as DbHandle;
}

/** A game nobody has played yet. */
export function emptyTables(): Tables {
  return {
    games: [],
    seats: [],
    users: [],
    holdings: [],
    seat_effects: [],
    field_cards: [],
    field_gold: [],
    moves: [],
  };
}

/**
 * The store this process is using.
 *
 * A module-level choice rather than a parameter on all sixty-odd call sites,
 * because it is a property of the *process*: a Next.js server is Supabase for
 * its whole life, and `mm` is one save file for its whole life. Nothing in the
 * app ever wants two at once.
 *
 * `change()` still takes an override, so a test can be explicit without
 * disturbing anything else running beside it.
 */
/**
 * Null means "nobody has chosen", not "no store" — the default is resolved on
 * every read rather than installed here, so this module never has to run
 * `change.ts`'s exports while modules are still evaluating. The two files name
 * each other, and that is what keeps the cycle harmless.
 */
let current: GameStore | null = null;

/**
 * Not `useStore`. React's lint rule reads any `useX` as a Hook and refuses it
 * outside a component — even here, in a file that has never seen React.
 */
export function setStore(store: GameStore): void {
  current = store;
  // The reads follow the writes. Two calls would be two chances to forget one.
  setHandle(store.handle);
}

/** Back to Postgres. For a test that changed it, and for nothing else. */
export function resetStore(): void {
  current = null;
  setHandle(null);
}

export function activeStore(): GameStore {
  return current ?? supabaseStore;
}
