/** Which database this process is talking to. One module, no imports but the client, so nothing can cycle through it. */

import { db, type DbHandle } from "@/lib/supabase";

/**
 * Why this is separate from `gameStore.ts`.
 *
 * `GameStore` covers the two calls a *change* makes — load and commit — and
 * that was enough to prove the rules could run without Postgres. It was not
 * enough to run them: `seatsFor`, `usersFor` and `journalRows` are reads that
 * happen outside a change, and they defaulted to the singleton. So `mm` opened
 * a table in a file, wrote to it happily, and then asked Supabase who was
 * sitting at it.
 *
 * The fix is not a bigger interface. Those readers already take a handle — they
 * only needed a better default than "the real one", and a default argument is
 * evaluated per call, so pointing this at a `Map` points all of them at it.
 *
 * Set by `setStore`, so a caller chooses once and everything follows.
 */
let current: DbHandle | null = null;

/**
 * Not `useHandle`. React's lint reads any `useX` as a Hook and refuses it
 * outside a component — in a file that has never seen React, twice now.
 */
export function setHandle(handle: DbHandle | null): void {
  current = handle;
}

/** The handle every read defaults to. Postgres unless somebody said otherwise. */
export function handleNow(): DbHandle {
  return current ?? db;
}
