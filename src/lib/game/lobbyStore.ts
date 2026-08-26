/** The poczekalnia's edge: the reads, the tokens, and one Command each. */

import { change } from "./change";
import { makeClaimToken } from "./codes";
import {
  claimSeat as claimSeatOn,
  leaveSeat as leaveSeatOn,
  needsSweep,
  removeSeat as removeSeatOn,
  renameSeat as renameSeatOn,
  setReady as setReadyOn,
  sweepLobby as sweepLobbyOn,
  takeHostRole as takeHostRoleOn,
  isQuiet,
  HOST_MISSING_AFTER_MS,
  type LeaveResult,
} from "./commands/lobby";
import { deleteGame, recentGames, seatsFor, seatsInGames } from "./store";

export type { LeaveResult };

/**
 * What the rules in `commands/lobby.ts` cannot do for themselves.
 *
 * Three things, and they are the same three every edge in this app does:
 * reading, minting, and the one write a changeset cannot describe. A fresh
 * claim token is `node:crypto` and a command that reached for one could not be
 * replayed by a retried commit, so it is made here and handed in. And deleting
 * the game is here because a changeset can write every table this app has
 * except the one it is a change *to*.
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

  // Every table's seats in one query, and the reason it is worth the trouble is
  // below: this used to read them a table at a time, inside the sweep, so
  // opening the list of games cost one round trip per game on the list.
  const seats = await seatsInGames(rows.map((game) => game.id as string));
  const now = Date.now();
  const seatsOf = (gameId: unknown) => seats.filter((seat) => seat.game_id === gameId);
  const presence = (gameId: unknown) =>
    seatsOf(gameId).map((seat) => ({
      no_device: seat.no_device as boolean,
      left_at: seat.left_at as string | null,
      seen_at: seat.seen_at as string | null,
      is_host: seat.is_host as boolean,
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
    return presence(game.id).some(
      (seat) => seat.no_device || !isQuiet(seat, now, HOST_MISSING_AFTER_MS),
    );
  });

  return listed.map((game) => ({
    joinCode: game.join_code as string,
    status: game.status as string,
    mode: game.mode as string,
    turn: game.turn as number,
    lastPlayedAt: game.last_played_at as string,
    createdAt: game.created_at as string,
    players: seatsOf(game.id).map((seat) => ({
      name: seat.player_name as string | null,
      characterId: seat.character_id as string | null,
      abandoned: seat.abandoned_at !== null,
    })),
  }));
}

/* --------------------------------------------------------------------------
 * One Command each.
 * ----------------------------------------------------------------------- */

/** Says whether a player is ready to start (docs/LOBBY.md). Only ever your own seat. */
export async function setReady(gameId: string, seatId: string, ready: boolean): Promise<void> {
  await change(gameId, setReadyOn, { seatId, ready });
}

/** Changes the name shown for a seat. Only ever your own. */
export async function renameSeat(
  gameId: string,
  seatId: string,
  name: string | null,
): Promise<void> {
  await change(gameId, renameSeatOn, { seatId, name });
}

/**
 * Gives up a seat: deleted before the game starts, retired once it has begun.
 *
 * The fresh token is minted here and rotated in by the rule, so the departing
 * device cannot act as this seat any more. One token per call rather than one
 * per attempt, so a retried commit places the same one.
 */
export async function leaveGame(gameId: string, seatId: string): Promise<LeaveResult> {
  return change(gameId, leaveSeatOn, { seatId, token: makeClaimToken() });
}

/** Picks up a seat nobody is behind, and returns the token that now holds it. */
export async function claimSeat(
  gameId: string,
  seatId: string,
  playerName: string | null = null,
): Promise<string> {
  const token = makeClaimToken();
  await change(gameId, claimSeatOn, { seatId, playerName, token });
  return token;
}

/** Takes a seat out of the table, leaving what it was carrying on its Obszar (12.1). */
export async function removeSeat(gameId: string, seatId: string, byId: string): Promise<void> {
  await change(gameId, removeSeatOn, { seatId, byId });
}

/** Hands the host role to a seat, or takes it from a host who has gone. */
export async function claimTableScreen(
  gameId: string,
  seatId: string,
  byId: string,
): Promise<void> {
  await change(gameId, takeHostRoleOn, { seatId, byId });
}

/**
 * Clears out a poczekalnia that people have closed their tabs on.
 *
 * Returns true when the table itself went with them.
 *
 * The cheap question first. This is called from the busiest request in the app
 * — every device asks for the state every two seconds and every one of those
 * polls comes through here — and the answer is almost always "nobody". A
 * snapshot is five reads; the seat list is one, and it is enough to know
 * whether the other four are worth paying for. Callers holding the seats
 * already may pass them and pay nothing at all.
 */
export async function sweepLobby(
  gameId: string,
  status: string,
  known?: Parameters<typeof needsSweep>[0],
): Promise<boolean> {
  if (status !== "lobby") return false;
  const seats = known ?? (await seatsFor(gameId));
  if (!needsSweep(seats, Date.now())) return false;

  const { gameGone } = await change(gameId, sweepLobbyOn, undefined);
  if (gameGone) await deleteGame(gameId);
  return gameGone;
}
