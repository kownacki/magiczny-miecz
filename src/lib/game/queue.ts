/** One change to a table at a time, in the order the table asked for them. */

/**
 * Why a queue, when `change` already refuses to lose a race.
 *
 * The optimistic scheme underneath — read the game, decide, write it back only
 * if `revision` has not moved — is the right one for this shape of app, and is
 * what is recommended for exactly this case: short web requests, no long-lived
 * transaction, conflicts rare. What it is not is *ordering*. It guarantees that
 * two changes cannot both land; it says nothing about which one lands first,
 * and it turns the loser into a retry that re-reads and decides again.
 *
 * Every real board-game server answers this the same way: one authority per
 * table, taking one message at a time. boardgame.io and the room servers keep a
 * live process per match and a queue in front of it. This app has no such
 * process — a route handler runs and exits — so the queue is the nearest honest
 * equivalent: within one server, all changes to one game go through one chain,
 * in arrival order, one at a time.
 *
 * That is not a substitute for the revision check and does not pretend to be.
 * Two servers have two chains, so the check stays exactly where it is, as the
 * thing that is actually *correct*. The queue is what makes it quiet: five
 * commands typed into the console in a second used to be five changes reading
 * the same table at once, retrying against each other and racing for the next
 * journal line. Now they are five changes in the order they were typed, which
 * is also the order the person typing them expects to read back.
 *
 * Keyed by game, so two tables never wait for each other.
 */
const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `work` after everything already queued under `key`.
 *
 * The previous piece of work is waited on whether it succeeded or failed —
 * somebody else's refused move is not a reason to refuse ours — and the chain
 * is dropped once nothing is behind it, so a server that has seen a thousand
 * tables is not holding a thousand resolved promises.
 *
 * Must not be called from inside itself for the same key: the inner call would
 * wait for the outer one to finish, which is waiting for it. Nothing does —
 * commands decide against a snapshot and touch the database only through the
 * commit that follows — and this note is here so it stays that way.
 */
export function serially<T>(key: string, work: () => Promise<T>): Promise<T> {
  const ahead = tails.get(key) ?? Promise.resolve();
  const mine = ahead.then(work, work);

  // A settled copy: the chain must not carry a rejection forward to whoever is
  // next in line, and must not be an unhandled rejection in its own right.
  const settled = mine.then(
    () => {},
    () => {},
  );
  tails.set(key, settled);
  void settled.then(() => {
    if (tails.get(key) === settled) tails.delete(key);
  });

  return mine;
}

/** How many tables have work in hand. For tests, and for wondering. */
export function queued(): number {
  return tails.size;
}
