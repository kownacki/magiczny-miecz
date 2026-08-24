/** Every database read and write for a game, so route handlers never touch Supabase directly. */

import { db } from "@/lib/supabase";
import { makeClaimToken, makeJoinCode } from "./codes";
import characters from "@/data/characters.json";
import type { Character } from "@/data/types";

export const CHARACTERS = characters as Character[];

export interface SeatRow {
  id: string;
  seat_index: number;
  player_name: string | null;
  character_id: string | null;
  field_id: string | null;
  miecz_own: number;
  magia_own: number;
  miecz_floor: number;
  magia_floor: number;
  zycie: number;
  zloto: number;
  nature: string | null;
  turns_lost: number;
  stone_until_turn: number | null;
  eliminated: boolean;
  is_host: boolean;
}

export interface GameRow {
  id: string;
  join_code: string;
  mode: string;
  die_source: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  turn_state: unknown;
}

/**
 * Everything a client is allowed to know about the table. Listed once so a
 * column added to the schema cannot silently go missing from the API — which is
 * exactly how turn_state was absent from every response the first time.
 */
const GAME_COLUMNS =
  "id,join_code,mode,die_source,status,active_seat,turn,revision,turn_state";

/** Columns safe to send to any device at the table. `claim_token` is never among them. */
const SEAT_COLUMNS =
  "id,seat_index,player_name,character_id,field_id,miecz_own,magia_own,miecz_floor,magia_floor,zycie,zloto,nature,turns_lost,stone_until_turn,eliminated,is_host";

/**
 * Creates a table and returns the host's seat token.
 *
 * Retries on a join-code collision rather than trusting randomness: codes are
 * five characters from a 28-glyph alphabet, and a collision would otherwise
 * surface as a unique-constraint error in front of the players.
 */
export async function createGame(
  hostName: string | null = null,
): Promise<{ game: GameRow; hostToken: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = makeJoinCode();
    const { data, error } = await db
      .from("games")
      .insert({ join_code: joinCode })
      .select(GAME_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") continue; // taken, try another
      throw new Error(`createGame: ${error.message}`);
    }

    const hostToken = makeClaimToken();
    const { error: seatError } = await db.from("seats").insert({
      game_id: data.id,
      seat_index: 0,
      claim_token: hostToken,
      is_host: true,
      player_name: hostName,
    });
    if (seatError) throw new Error(`createGame seat: ${seatError.message}`);

    return { game: data as GameRow, hostToken };
  }
  throw new Error("createGame: could not find a free join code");
}

export async function findGame(joinCode: string): Promise<GameRow | null> {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLUMNS)
    .eq("join_code", joinCode)
    .maybeSingle();
  if (error) throw new Error(`findGame: ${error.message}`);
  return (data as GameRow) ?? null;
}

export async function seatsFor(gameId: string): Promise<SeatRow[]> {
  const { data, error } = await db
    .from("seats")
    .select(SEAT_COLUMNS)
    .eq("game_id", gameId)
    .order("seat_index");
  if (error) throw new Error(`seatsFor: ${error.message}`);
  return (data ?? []) as SeatRow[];
}

/**
 * Adds a seat and returns its token.
 *
 * Rule-wise the game seats two to six (the box says 2-6), and the cap is
 * enforced here rather than in the UI so a stale lobby page cannot squeeze in a
 * seventh player.
 */
export const MAX_SEATS = 6;

export async function joinGame(
  gameId: string,
  playerName: string | null,
): Promise<{ seat: SeatRow; token: string }> {
  const existing = await seatsFor(gameId);

  // Every seat that exists is already claimed by a device — the host's included,
  // created with the table. An earlier version handed a joiner any seat with no
  // player_name, which meant the second person to arrive silently took over the
  // unnamed host's seat and overwrote their character. Joining always adds a
  // seat; it never adopts one.
  if (existing.length >= MAX_SEATS) throw new Error("Stół jest pełny — gra jest na 2-6 graczy.");

  const token = makeClaimToken();

  const { data, error } = await db
    .from("seats")
    .insert({
      game_id: gameId,
      seat_index: existing.length,
      claim_token: token,
      player_name: playerName,
    })
    .select(SEAT_COLUMNS)
    .single();
  if (error) throw new Error(`joinGame: ${error.message}`);
  return { seat: data as SeatRow, token };
}

/**
 * Assigns a character and sets the seat's opening values.
 *
 * The starting Miecz and Magia become both the current value and the floor,
 * because rules 1.3 and 2.3 forbid a character ever dropping below what it
 * began with. Życie starts at 4 (4.2) and Złoto at 1 (3.2) unless the card says
 * otherwise, and those are already the column defaults.
 */
export async function chooseCharacter(seatId: string, characterId: string): Promise<void> {
  const character = CHARACTERS.find((c) => c.id === characterId);
  if (!character) throw new Error(`Nieznana postać: ${characterId}`);

  const field = startingFieldId(character.start);
  const { error } = await db
    .from("seats")
    .update({
      character_id: character.id,
      field_id: field,
      miecz_own: character.miecz,
      magia_own: character.magia,
      miecz_floor: character.miecz,
      magia_floor: character.magia,
      // Kat prints "dowolna" and picks at setup, so it is left unset here for
      // the player to choose rather than being silently defaulted.
      nature: character.nature === "dowolna" ? null : character.nature,
    })
    .eq("id", seatId);
  if (error) throw new Error(`chooseCharacter: ${error.message}`);
}

/** Character cards name their starting field in prose; the board uses slugs. */
function startingFieldId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function verifySeat(gameId: string, token: string): Promise<SeatRow | null> {
  const { data, error } = await db
    .from("seats")
    .select(SEAT_COLUMNS)
    .eq("game_id", gameId)
    .eq("claim_token", token)
    .maybeSingle();
  if (error) throw new Error(`verifySeat: ${error.message}`);
  return (data as SeatRow) ?? null;
}

/**
 * Bumps the revision counter. Clients hold the last value they rendered and
 * refetch when they see a higher one, which is why every mutation must call
 * this — a change that does not bump is a change nobody else sees.
 */
export async function bumpRevision(gameId: string): Promise<number> {
  const { data, error } = await db
    .from("games")
    .select("revision")
    .eq("id", gameId)
    .single();
  if (error) throw new Error(`bumpRevision: ${error.message}`);
  const next = (data.revision as number) + 1;
  await db.from("games").update({ revision: next }).eq("id", gameId);
  return next;
}
