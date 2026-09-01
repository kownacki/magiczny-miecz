/** Who is still at the table: how long is too long, and what the sweep does about it. */

import { promoteHost } from "./lobby";
import { mergeAll, type CommandPorts, type Outcome, type Snapshot } from "../change";
import type { UserRow } from "../store";

/* --------------------------------------------------------------------------
 * How long is too long.
 * ----------------------------------------------------------------------- */

/**
 * How long a seat may go unheard-from before it is shown as away.
 *
 * The browser polls every two seconds, so this is generous: a tab in the
 * background, a phone that slept, or a slow network should not make somebody
 * look like they have left the table.
 */
export const AWAY_AFTER_MS = 45_000;

/**
 * How long a seat in the poczekalnia may go unheard-from before it is taken off
 * the table.
 *
 * Much longer than `AWAY_AFTER_MS`, because a hidden tab is not a closed one.
 * Browsers throttle timers in background tabs to roughly once a minute, so
 * somebody who switched away to read something else is still checking in —
 * just slowly. Anything under two minutes evicts them for looking away.
 */
export const LOBBY_GONE_AFTER_MS = 150_000;

/**
 * How long the host may go unheard-from before the role moves on.
 *
 * Deliberately shorter than `LOBBY_GONE_AFTER_MS`. The two thresholds answer
 * different questions — "can this table still be administered?" and "is this
 * person still here?" — and the first has to be answered first. If the host
 * only lost the role at the moment their seat was deleted, then between the
 * host going quiet and the sweep catching it the table would have nobody able
 * to start it, and a table full of people who cannot start is worse than a
 * table with an absent host.
 *
 * The seat stays where it is. This moves the role, nothing else, so a host who
 * comes back is still at the table — just not running it any more.
 */
export const HOST_MISSING_AFTER_MS = 60_000;

/**
 * How long a seat is held after its page said it was going away.
 *
 * A page fires `pagehide` when the tab closes and when it reloads, and those
 * are indistinguishable from the outside — so this is not a removal, it is a
 * countdown that reloading cancels. Long enough for a slow reload to land,
 * short enough that a closed tab frees the place while people are still
 * looking at the screen.
 */
export const GOODBYE_GRACE_MS = 10_000;

/**
 * A seat that checked in once and then stopped.
 *
 * A seat that has *never* checked in is not quiet — it is either brand new or a
 * player the host seated by hand, and neither is free for the taking.
 *
 * Takes the moment rather than reading the clock, like every other rule
 * measured in time here: a threshold that cannot be asked what it would say at
 * a given instant cannot be tested at all.
 */
export function isQuiet(
  who: Pick<UserRow, "seen_at">,
  now: number,
  after = AWAY_AFTER_MS,
): boolean {
  if (!who.seen_at) return false;
  return now - Date.parse(who.seen_at) > after;
}

/* --------------------------------------------------------------------------
 * The sweep.
 * ----------------------------------------------------------------------- */

/**
 * The three columns presence is decided from, and nothing else.
 *
 * A whole `UserRow` is more than these questions need, and asking for one would
 * mean the list of tables could not answer them off the cut-down rows it
 * already fetches for every game at once. See `listGames`.
 *
 * `no_device` used to be a fourth. It marked a seat the host was playing on
 * somebody's behalf, which had to be kept out of the sweep — and it is gone,
 * because in a table where people and Postacie are different rows that seat is
 * simply one nobody is driving. There is no user to sweep, so there is nothing
 * to protect it from.
 */
export type Presence = Pick<UserRow, "left_at" | "seen_at" | "is_host">;

/**
 * Which seats the poczekalnia has stopped hearing from.
 *
 * Two ways to be gone: the page said so and did not come back inside the grace,
 * or nothing has been heard for long enough that it does not matter what it
 * would have said.
 *
 * A seat the host filled in by hand has no device and never checks in; it is
 * driven from the shared screen, and sweeping it would delete players sitting
 * at the table.
 */
export function goneFrom<T extends Presence>(users: readonly T[], now: number): T[] {
  return users.filter(
    (one) =>
      (one.left_at !== null && now - Date.parse(one.left_at) > GOODBYE_GRACE_MS) ||
      isQuiet(one, now, LOBBY_GONE_AFTER_MS),
  );
}

/**
 * Whether a sweep would do anything, asked without loading the whole table.
 *
 * The sweep runs on every poll from every device and finds nothing to do almost
 * every time, so the common path must stay one query. This answers off the seat
 * list the caller already has; only when it says yes does anybody pay for a
 * snapshot. See `sweepLobby` in `store.ts`.
 */
export function needsSweep(users: readonly Presence[], now: number): boolean {
  if (goneFrom(users, now).length > 0) return true;
  const host = users.find((one) => one.is_host);
  return host ? isQuiet(host, now, HOST_MISSING_AFTER_MS) : false;
}

/**
 * Clears out a poczekalnia that people have closed their tabs on.
 *
 * Before the game starts a seat is an intention, not a character: nothing has
 * happened to it, nobody has acted on anything it owns, and a table showing
 * four names when one person is present is worse than a table showing one. So a
 * seat nobody has been heard from is deleted outright rather than marked —
 * which is what leaving does too, and closing the tab is the same act without
 * the click.
 *
 * The host role moves on its own timer and before anybody is removed, so a host
 * who is merely quiet keeps their seat and loses the role. And when the last
 * seat goes the table goes with it, because an empty poczekalnia is not a game
 * anybody can join — it is a code taking up space in the list. Deleting the
 * game is the caller's: a changeset can write every table this app has except
 * the one it is a change *to*.
 */
export function sweepLobby(
  snapshot: Snapshot,
  _command: void,
  ports: CommandPorts,
): Outcome<{ gameGone: boolean }> {
  if (snapshot.game.status !== "lobby") {
    return { writes: {}, result: { gameGone: false } };
  }

  const now = ports.now();
  const gone = goneFrom(snapshot.users, now);
  const goneIds = new Set(gone.map((one) => one.id));
  const staying = snapshot.users.filter((one) => !goneIds.has(one.id));

  /**
   * Two ways the role has to move, and one place that decides where to.
   *
   * The host's tab closed, or the host has been quiet for longer than a table
   * can be left unadministered. The successor is picked from those *staying*,
   * because choosing from everybody would hand the role to somebody about to be
   * swept a line later.
   */
  const host = snapshot.users.find((one) => one.is_host);
  const handover =
    host && (goneIds.has(host.id) || isQuiet(host, now, HOST_MISSING_AFTER_MS))
      ? promoteHost(staying, host, snapshot.game.round)
      : {};

  if (gone.length === 0) return { writes: handover, result: { gameGone: false } };

  /**
   * The chairs they were in go with them, and only here.
   *
   * Before the game starts a seat is an intention rather than a Postać: nothing
   * has happened to it and nobody has acted on anything it owns, so a table
   * showing four names when one person is present is worse than one showing
   * one. Once play has begun the seat outlives everybody who ever drove it,
   * which is the whole point of the split — and this never runs then.
   */
  const chairs = gone
    .map((one) => one.seat_index)
    .filter((at): at is number => at !== null)
    .map((at) => snapshot.seats.find((seat) => seat.seat_index === at)?.id)
    .filter((id): id is string => id !== undefined);

  // Nobody left who could choose a character or start the table.
  const gameGone = staying.length === 0;

  return {
    writes: mergeAll(
      { usersRemoved: [...goneIds] },
      /**
       * A line each, because otherwise people simply stopped existing.
       *
       * The sweep is the third way somebody leaves a table and it was the only
       * silent one: walking away writes `left-table` and being kicked writes it
       * with `kicked`, while going quiet long enough deleted the row and said
       * nothing. To everybody still in the room a name disappeared off the
       * roster with no account of why — which is exactly the kind of thing the
       * journal is opened to settle.
       *
       * The same kind rather than a fourth: they have left the table, and how
       * is the payload's business. The name is copied for the usual reason,
       * and here it is not even a precaution — the row is being deleted in this
       * very changeset.
       */
      {
        journal: gone.map((one) => ({
          seatId: null,
          round: snapshot.game.round,
          kind: "left-table" as const,
          payload: { user: one.id, name: one.name, kicked: false, swept: true },
        })),
      },
      chairs.length > 0 ? { seatsRemoved: chairs } : {},
      gameGone ? {} : handover,
    ),
    result: { gameGone },
  };
}

