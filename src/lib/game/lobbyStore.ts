/** The poczekalnia's edge: the reads, the tokens, and one Command each. */

import { change } from "./change";
import { makeClaimToken } from "./codes";
import {
  takeSeat as takeSeatOn,
  unseat as unseatOn,
  leaveTable as leaveTableOn,
  noteArrival as noteArrivalOn,
  openTable as openTableOn,
  setEqMode as setEqModeOn,
  needsSweep,
  renameUser as renameUserOn,
  setReady as setReadyOn,
  sweepLobby as sweepLobbyOn,
  takeHostRole as takeHostRoleOn,
  resumeAs as resumeAsOn,
  isQuiet,
  HOST_MISSING_AFTER_MS,
  type LeaveResult,
} from "./commands/lobby";
import { deleteGame, recentGames, seatsInGames, usersFor, usersInGames } from "./store";

export type { LeaveResult };

/**
 * What the rules in `commands/lobby.ts` cannot do for themselves.
 *
 * Three things, and they are the same three every edge in this app does:
 * reading, minting, and the one write a changeset cannot describe. Deleting the
 * game is here because a changeset can write every table this app has except
 * the one it is a change *to*.
 *
 * Minting moved rather than went. Leaving no longer reissues anything — the
 * token is the *person's* now, so `unseat` leaves them holding it and
 * `leaveTable` takes the row and the token together — and `resumeAs` mints
 * instead: a browser coming back gets a fresh claim, which is `node:crypto` and
 * so cannot be inside a command a retried commit would replay.
 */

/* --------------------------------------------------------------------------
 * The list of tables.
 * ----------------------------------------------------------------------- */

export interface GameSummary {
  joinCode: string;
  status: string;
  mode: string;
  turn: number;
  lastPlayedAt: string;
  createdAt: string;
  players: { name: string | null; characterId: string | null; abandoned: boolean }[];
}

/**
 * The tables that exist, most recently played first.
 *
 * A game of this length is not finished in one sitting — the box is a two-hour
 * game and it takes longer — so "which table were we on?" is a real question,
 * and until now the only answer was a five-character code somebody had to have
 * written down.
 *
 * Everything here is already public to anyone holding the code, and this is a
 * private, unpublished app on a table people are sitting at together.
 */
export async function listGames(limit = 20): Promise<GameSummary[]> {
  const rows = await recentGames(limit);
  if (rows.length === 0) return [];

  // Every table's seats and everybody at them, in two queries rather than two
  // per game: this used to read them a table at a time, inside the sweep, so
  // opening the list of games cost a round trip per game on the list.
  const ids = rows.map((game) => game.id as string);
  const [seats, users] = await Promise.all([seatsInGames(ids), usersInGames(ids)]);
  const now = Date.now();
  const seatsOf = (gameId: unknown) => seats.filter((seat) => seat.game_id === gameId);
  const usersOf = (gameId: unknown) => users.filter((one) => one.game_id === gameId);
  /**
   * Presence is a person's, and only a person's.
   *
   * It used to be read off the seats, which is why `no_device` was here: a chair
   * the host had filled in by hand never checked in and had to be kept out of
   * the sweep. There is no such chair any more — a seat nobody drives is simply
   * one with no user behind it, and there is nothing to sweep.
   */
  const presence = (gameId: unknown) =>
    usersOf(gameId).map((one) => ({
      left_at: one.left_at as string | null,
      seen_at: one.seen_at as string | null,
      is_host: one.is_host as boolean,
    }));

  /**
   * A poczekalnia everybody closed their tab on has nobody polling it, so it
   * never hears that it is empty. This is the other place anybody looks, and
   * the list is precisely where an abandoned table does its damage: it reads as
   * a game you could join.
   */
  const swept = new Set<string>();
  for (const game of rows) {
    if (game.status !== "lobby") continue;
    if (!needsSweep(presence(game.id), now)) continue;
    if (await sweepLobby(game.id as string, game.status as string)) {
      swept.add(game.id as string);
    }
  }

  /**
   * A poczekalnia everybody has walked away from stops being advertised well
   * before it is deleted. It has minutes left on the clock and is still listed
   * as somewhere you could go and play, which is the one thing it is not; and
   * deleting it the moment it looks quiet would take the table away from
   * somebody whose laptop had merely gone to sleep. So: unlisted first, removed
   * later.
   */
  const listed = rows.filter((game) => {
    if (swept.has(game.id as string)) return false;
    if (game.status !== "lobby") return true;
    // Somebody still there: anybody the table has heard from lately. The
    // `no_device` half of this test went with the column — a chair nobody is
    // driving is not somebody quietly sitting there any more.
    return presence(game.id).some((one) => !isQuiet(one, now, HOST_MISSING_AFTER_MS));
  });

  return listed.map((game) => ({
    joinCode: game.join_code as string,
    status: game.status as string,
    mode: game.mode as string,
    turn: game.turn as number,
    lastPlayedAt: game.last_played_at as string,
    createdAt: game.created_at as string,
    /**
     * One entry to a chair: what is standing in it, and who is driving it.
     *
     * "Abandoned" is now a fact about the pair rather than a column — a Postać
     * with nobody behind it — which is exactly what somebody scanning this list
     * wants to know before sitting down. People who are only watching are not
     * here: this line says what is being played, not who is in the room.
     */
    players: seatsOf(game.id).map((seat) => {
      const driver = usersOf(game.id).find((one) => one.seat_index === seat.seat_index);
      return {
        name: (driver?.name as string | undefined) ?? null,
        characterId: seat.character_id as string | null,
        abandoned: !driver && seat.character_id !== null,
      };
    }),
  }));
}

/* --------------------------------------------------------------------------
 * One Command each.
 * ----------------------------------------------------------------------- */

/** Says whether somebody is ready to start (docs/LOBBY.md). Only ever yourself. */
export async function setReady(gameId: string, userId: string, ready: boolean): Promise<void> {
  await change(gameId, setReadyOn, { userId, ready });
}

/** Changes what somebody is called. Unique per table, so it can be refused. */
export async function renameUser(gameId: string, userId: string, name: string): Promise<void> {
  await change(gameId, renameUserOn, { userId, name });
}

/** Out of the chair, still at the table. The Postać stays exactly where it is. */
export async function unseat(gameId: string, userId: string): Promise<LeaveResult> {
  return change(gameId, unseatOn, { userId });
}

/**
 * Out of the table altogether — by their own choice, or by somebody else's.
 *
 * The only difference the two make is the line in the journal, and it is worth
 * making: being thrown off a table is not the same event as walking away from
 * one, and a log that cannot tell them apart cannot settle the argument it will
 * be opened to settle.
 */
export async function leaveTable(
  gameId: string,
  userId: string,
  kicked = false,
  /** Who is doing the kicking. Only the host may, and only somebody else. */
  byUser?: string,
): Promise<LeaveResult> {
  return change(gameId, leaveTableOn, { userId, kicked, byUser });
}

/** The equipment variant, while the table is still the poczekalnia. */
export async function setEqMode(gameId: string, eqMode: "slots" | "classic"): Promise<void> {
  await change(gameId, setEqModeOn, { eqMode });
}

/**
 * Writes the two lines a new table opens with.
 *
 * Called after `createGame` for the reason `noteArrival` is called after
 * `joinGame`: both mint a claim token, so both write their own rows and neither
 * can be a command. The table exists either way — this only says so.
 */
export async function openTable(
  gameId: string,
  hostName: string,
  hostSeatId: string | null,
): Promise<void> {
  await change(gameId, openTableOn, { hostName, hostSeatId });
}

/**
 * Writes down that somebody arrived.
 *
 * Called *after* `joinGame` rather than as part of it, because that one is the
 * app's single read-modify-write: it inserts the user row and hands back a
 * claim token, and a Changeset can do neither. So the arrival is a fact by the
 * time this runs, and this only records it — which also means a failure here
 * must not undo the join. The caller keeps it off the response path.
 */
export async function noteArrival(
  gameId: string,
  name: string,
  seatId: string | null,
): Promise<void> {
  await change(gameId, noteArrivalOn, { name, seatId });
}

/** Sits somebody down in a seat. Refused only if somebody is actively driving it. */
export async function takeSeat(
  gameId: string,
  userId: string,
  seatIndex: number,
): Promise<void> {
  await change(gameId, takeSeatOn, { userId, seatIndex });
}

/**
 * Who this browser was here, handed a fresh claim so it can be them again.
 *
 * `{ user: null, live: true }` says this browser is already somebody at this
 * table in another window, which is a question for the person rather than a
 * refusal: come back as nobody, or join as somebody new.
 */
export async function resumeDevice(
  gameId: string,
  deviceId: string,
): Promise<{ user: Awaited<ReturnType<typeof usersFor>>[number] | null; live: boolean; token: string }> {
  const token = makeClaimToken();
  const { user, live } = await change(gameId, resumeAsOn, { deviceId, token });
  return { user, live, token };
}

/** Hands the host role to somebody, or takes it from a host who has gone. */
export async function claimTableScreen(
  gameId: string,
  userId: string,
  byUser: string,
): Promise<void> {
  await change(gameId, takeHostRoleOn, { userId, byUser });
}

/**
 * Clears out a poczekalnia that people have closed their tabs on.
 *
 * Returns true when the table itself went with them.
 *
 * The cheap question first. This is called from the busiest request in the app
 * — every device asks for the state every two seconds and every one of those
 * polls comes through here — and the answer is almost always "nobody". A
 * snapshot is six reads; the user list is one, and it is enough to know
 * whether the other five are worth paying for. Callers holding the users
 * already may pass them and pay nothing at all.
 */
export async function sweepLobby(
  gameId: string,
  status: string,
  known?: Parameters<typeof needsSweep>[0],
): Promise<boolean> {
  if (status !== "lobby") return false;
  const here = known ?? (await usersFor(gameId));
  if (!needsSweep(here, Date.now())) return false;

  const { gameGone } = await change(gameId, sweepLobbyOn, undefined);
  if (gameGone) await deleteGame(gameId);
  return gameGone;
}
