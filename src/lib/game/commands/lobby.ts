/** The poczekalnia: seats arriving, going quiet, being taken over, and going away. */

import {
  apply,
  merge,
  mergeAll,
  type Changeset,
  type CommandPorts,
  type Outcome,
  type Snapshot,
} from "../change";
import type { SeatRow, UserRow } from "../store";

/**
 * The part that is not Magiczny Miecz.
 *
 * Nothing in this file has a rule number, because the rulebook has nothing to
 * say about a browser tab closing. It is all the app's own — see
 * `docs/LOBBY.md` — and it is the last of the store's writing to come across to
 * the command shape.
 *
 * Two reasons it had to. It was untested, and it is not simple: who becomes
 * host when the host walks away, how long a hidden tab may stay hidden before
 * its seat is somebody else's, and which of two thresholds a quiet seat has
 * crossed are decisions with consequences, and they were only ever asked of a
 * live database. And it ran without a compare-and-swap while being called from
 * the busiest path in the app — every device polls the state every two seconds
 * and every one of those polls swept the lobby, so six devices at one table ran
 * six concurrent host promotions against a row none of them had locked.
 */

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
 * Who runs the table.
 * ----------------------------------------------------------------------- */

/**
 * Whoever takes over when `leaving` stops being host.
 *
 * Whoever has been at the table longest of those left — a stable, explicable
 * rule, which matters because nobody chose it in the moment.
 *
 * By `created_at` and not by `seat_index`: places freed in the middle are
 * filled by the next person to arrive, so a low index now means "sat in a gap",
 * not "got here first". Ties break on index, which is the old rule and is what
 * every seat that predates the column will do.
 *
 * Somebody who has themselves walked away is skipped; handing the role to an
 * empty chair is how a table ends up unstartable.
 */
export function nextHost(users: readonly UserRow[], leaving: UserRow): UserRow | null {
  return (
    users
      .filter((one) => one.id !== leaving.id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] ?? null
  );
}

/**
 * Keeps a table hosted.
 *
 * The host flag only decides who sees the lobby controls, but a table whose
 * host walked away with it would strand everyone else.
 *
 * The role is handed over rather than copied: a retired seat keeps its row so
 * the journal's references survive, and leaving it marked host would leave the
 * table with two — the outgoing one being a seat nobody is sitting in. When the
 * outgoing seat is being removed in the same change the demotion patch lands on
 * nothing, which is exactly why removals are applied first (see `seatsRemoved`).
 */
export function promoteHost(users: readonly UserRow[], leaving: UserRow): Changeset {
  if (!leaving.is_host) return {};
  const candidate = nextHost(users, leaving);
  if (!candidate) return {};
  return {
    users: [
      { id: candidate.id, patch: { is_host: true } },
      { id: leaving.id, patch: { is_host: false } },
    ],
  };
}

/** The person, or a refusal naming the thing that is not there. */
export function userOf(snapshot: Snapshot, userId: string): UserRow {
  const user = snapshot.users.find((one) => one.id === userId);
  if (!user) throw new Error("Nie ma takiego gracza.");
  return user;
}

/** The seat somebody is driving, or a refusal. */
export function seatUnder(snapshot: Snapshot, user: UserRow): SeatRow {
  const seat =
    user.seat_index === null
      ? undefined
      : snapshot.seats.find((one) => one.seat_index === user.seat_index);
  if (!seat) throw new Error("Ten gracz nie prowadzi żadnej Postaci.");
  return seat;
}

/** Whoever is driving this seat, or nobody. */
export function driverOf(snapshot: Snapshot, seatIndex: number): UserRow | null {
  return snapshot.users.find((one) => one.seat_index === seatIndex) ?? null;
}

/**
 * What to call a seat in a sentence somebody reads.
 *
 * The person driving it, and the chair when nobody is — which is the honest
 * answer rather than a fallback, because an empty seat is a real state now and
 * has no name of its own. Seats used to carry `player_name` and every message
 * reached for it; there is nothing to reach for any more, so this is the one
 * place that decides.
 */
export function nameOfSeat(snapshot: Snapshot, seatIndex: number): string {
  return driverOf(snapshot, seatIndex)?.name ?? `miejsce ${seatIndex + 1}`;
}

/** The seat, or a refusal naming the thing that is not there. */
function seatOf(snapshot: Snapshot, seatId: string): SeatRow {
  const seat = snapshot.seats.find((one) => one.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  return seat;
}

/* --------------------------------------------------------------------------
 * Saying who you are and whether you are ready.
 * ----------------------------------------------------------------------- */

/**
 * Says whether a player is ready to start (docs/LOBBY.md).
 *
 * Only ever your own seat: readiness is a statement about yourself, and a host
 * who could mark everyone ready would have a start button with extra steps.
 * Which seat is asking is settled by the route, off the token, before this is
 * reached.
 */
export function setReady(
  snapshot: Snapshot,
  command: { userId: string; ready: boolean },
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  if (user.ready === command.ready) return { writes: {}, result: undefined };
  return {
    writes: { users: [{ id: user.id, patch: { ready: command.ready } }] },
    result: undefined,
  };
}

/**
 * Changes what somebody is called.
 *
 * Unique per table, and refused rather than quietly suffixed: the whole reason
 * names are unique is that `kick Michał` has to mean one person, and a table
 * holding a Michał and a "Michał (2)" has given that up to avoid one refusal.
 */
export function renameUser(
  snapshot: Snapshot,
  command: { userId: string; name: string },
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  const wanted = command.name.trim();
  if (!wanted) throw new Error("Imię nie może być puste.");
  if (user.name === wanted) return { writes: {}, result: undefined };
  if (snapshot.users.some((one) => one.id !== user.id && one.name === wanted)) {
    throw new Error(`Przy stole jest już ${wanted}.`);
  }
  return {
    writes: { users: [{ id: user.id, patch: { name: wanted } }] },
    result: undefined,
  };
}

/* --------------------------------------------------------------------------
 * Leaving, and being left.
 * ----------------------------------------------------------------------- */

export interface LeaveResult {
  removed: boolean;
  /** Set when the leaver was the active player and the turn had to move on. */
  passedTo: number | null;
  gameFinished: boolean;
}

/**
 * Whoever plays after the seat at `seatIndex` stops being able to.
 *
 * Wraps: the next seat by number that still has a Postać able to act, and the
 * first of them when there is none after. Null when nobody is left, which is a
 * table with nothing to pass to rather than an error.
 */
function playsNext(snapshot: Snapshot, seatIndex: number): number | null {
  const able = snapshot.seats.filter(
    (seat) => seat.character_id && !seat.eliminated && seat.seat_index !== seatIndex,
  );
  if (able.length === 0) return null;
  const after = able.find((seat) => seat.seat_index > seatIndex) ?? able[0];
  return after.seat_index;
}

/**
 * Out of the seat, still at the table.
 *
 * The Postać stays exactly where it is standing with everything it owns, and
 * the seat is left for somebody to take over — the same person on a new tab, or
 * anybody else in the room. This is what the rulebook has no word for at all,
 * because in 1993 everybody was in one room and a person who stood up came
 * back.
 *
 * Play does not stop for an empty chair but must not wait on one either: if it
 * was that seat's turn, it moves on.
 */
export function unseat(snapshot: Snapshot, command: { userId: string }): Outcome<LeaveResult> {
  const user = userOf(snapshot, command.userId);
  if (user.seat_index === null) {
    return { writes: {}, result: { removed: false, passedTo: null, gameFinished: false } };
  }

  const released: Changeset = { users: [{ id: user.id, patch: { seat_index: null } }] };
  if (snapshot.game.active_seat !== user.seat_index) {
    return { writes: released, result: { removed: false, passedTo: null, gameFinished: false } };
  }
  const next = playsNext(snapshot, user.seat_index);
  if (next === null) {
    return { writes: released, result: { removed: false, passedTo: null, gameFinished: false } };
  }
  return {
    writes: merge(released, {
      game: { active_seat: next, turn_state: { phase: "roll" } },
    }),
    result: { removed: false, passedTo: next, gameFinished: false },
  };
}

/**
 * Out of the table altogether.
 *
 * Which is `unseat` and then the person themselves — the row goes, the name is
 * free again, and the host role moves on if they were holding it. The Postać is
 * untouched: it is not theirs to take away, and 4.4 is the only thing in the
 * book that removes one.
 *
 * Two ways in, and the only difference is the journal. `leave` is somebody
 * going by their own choice, or the tab closing, which is the same act without
 * the click. `kick` is somebody else deciding — and being thrown off a table is
 * worth being able to tell apart from having walked away from it.
 */
export function leaveTable(
  snapshot: Snapshot,
  command: { userId: string; kicked?: boolean },
): Outcome<LeaveResult> {
  const user = userOf(snapshot, command.userId);
  const stood = unseat(snapshot, { userId: user.id });
  const after = apply(snapshot, stood.writes);

  const gone: Changeset = {
    usersRemoved: [user.id],
    journal: [
      {
        seatId: null,
        turn: snapshot.game.turn,
        kind: "left-behind",
        payload: { user: user.id, name: user.name, kicked: command.kicked ?? false },
      },
    ],
  };

  return {
    writes: mergeAll(stood.writes, promoteHost(after.users, user), gone),
    result: { ...stood.result, removed: true },
  };
}

/**
 * Somebody sits down.
 *
 * Refused only when a seat is actively being driven. A person who closed their
 * tab never said they were leaving, so the seat is merely quiet — and refusing
 * it would strand the Postać for the rest of the evening. The people in the
 * room settle who picks it up; the server only refuses a chair somebody is
 * using.
 */
export function takeSeat(
  snapshot: Snapshot,
  command: { userId: string; seatIndex: number },
  ports: CommandPorts,
): Outcome<void> {
  const user = userOf(snapshot, command.userId);
  const driver = snapshot.users.find(
    (one) => one.id !== user.id && one.seat_index === command.seatIndex,
  );
  if (driver && !isQuiet(driver, ports.now())) {
    throw new Error("To miejsce ma już swojego gracza.");
  }
  if (user.seat_index === command.seatIndex) return { writes: {}, result: undefined };

  // The quiet one is stood up first, or two people hold one seat and the unique
  // index refuses the write with a message nobody can act on.
  const displaced: Changeset = driver
    ? { users: [{ id: driver.id, patch: { seat_index: null } }] }
    : {};
  return {
    writes: merge(displaced, {
      users: [{ id: user.id, patch: { seat_index: command.seatIndex } }],
    }),
    result: undefined,
  };
}

/**
 * Hands the host role to somebody, or takes it from a host who has gone.
 *
 * Two ways in, and only two. The host may give it away deliberately, and
 * anybody may take it when the host has gone quiet — without that second door,
 * a table whose host closed their laptop can never be configured or started
 * again, which is the whole reason host migration exists.
 *
 * Taking it from a host who is present is not a door. There is no co-host.
 */
export function takeHostRole(
  snapshot: Snapshot,
  command: { userId: string; byId: string },
  ports: CommandPorts,
): Outcome<void> {
  const by = userOf(snapshot, command.byId);
  const host = snapshot.users.find((one) => one.is_host);
  if (host && host.id !== by.id && !isQuiet(host, ports.now(), HOST_MISSING_AFTER_MS)) {
    throw new Error("Rolę gospodarza może przekazać tylko obecny gospodarz.");
  }
  const target = userOf(snapshot, command.userId);
  if (target.is_host) return { writes: {}, result: undefined };

  return {
    writes: {
      users: [
        { id: target.id, patch: { is_host: true } },
        ...(host ? [{ id: host.id, patch: { is_host: false } }] : []),
      ],
    },
    result: undefined,
  };
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
      ? promoteHost(staying, host)
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
      chairs.length > 0 ? { seatsRemoved: chairs } : {},
      gameGone ? {} : handover,
    ),
    result: { gameGone },
  };
}
