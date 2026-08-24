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
  /** 11.11: the turn a failed bridge attempt stops barring another. */
  bridge_blocked_until_turn: number | null;
  /** 7.3: the turn this seat last changed its Natura on. */
  nature_changed_turn: number | null;
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
  /** Shuffled event deck; null in companion mode, where the table holds it. */
  deck: unknown;
}

/**
 * Everything a client is allowed to know about the table. Listed once so a
 * column added to the schema cannot silently go missing from the API — which is
 * exactly how turn_state was absent from every response the first time.
 */
const GAME_COLUMNS =
  "id,join_code,mode,die_source,status,active_seat,turn,revision,turn_state,deck";

/** Columns safe to send to any device at the table. `claim_token` is never among them. */
const SEAT_COLUMNS =
  "id,seat_index,player_name,character_id,field_id,miecz_own,magia_own,miecz_floor,magia_floor,zycie,zloto,nature,turns_lost,stone_until_turn,bridge_blocked_until_turn,nature_changed_turn,eliminated,is_host";

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

export interface HoldingRow {
  id: string;
  seat_id: string;
  card_id: string;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
}

export async function holdingsFor(gameId: string): Promise<HoldingRow[]> {
  const { data, error } = await db
    .from("holdings")
    .select("id,seat_id,card_id,kind,face")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Error(`holdingsFor: ${error.message}`);
  return (data ?? []) as HoldingRow[];
}

/**
 * A card lying face up on a field, waiting for whoever stops there next.
 *
 * Rule 16.8 makes these public — "koszulkami do dołu, tak, by ich treść była
 * widoczna dla wszystkich graczy" — so unlike a hand of Zaklęcia there is
 * nothing to conceal here and every seat sees the same list.
 */
export interface FieldCardRow {
  id: string;
  field_id: string;
  card_id: string;
}

export async function fieldCardsFor(gameId: string): Promise<FieldCardRow[]> {
  const { data, error } = await db
    .from("field_cards")
    .select("id,field_id,card_id")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as FieldCardRow[];
}

export interface LeaveResult {
  removed: boolean;
  /** Set when the leaver was the active player and the turn had to move on. */
  passedTo: number | null;
  gameFinished: boolean;
}

/**
 * Gives up a seat.
 *
 * Before the game starts the seat is deleted outright — nothing references it
 * and someone who joined the wrong table should leave no trace. Once play has
 * begun it is retired instead, by marking it eliminated: the journal holds
 * `seat_id` references to everything that seat did, and deleting the row would
 * cascade those away and take the game's history with them.
 *
 * Seat indexes are deliberately not compacted. `nextSeat` walks the seat array
 * rather than counting indexes, so a gap is harmless, whereas renumbering would
 * silently change who `active_seat` points at.
 */
export async function leaveGame(
  gameId: string,
  seat: SeatRow,
  status: string,
  activeSeat: number | null,
): Promise<LeaveResult> {
  if (status === "lobby") {
    const { error } = await db.from("seats").delete().eq("id", seat.id);
    if (error) throw new Error(`leaveGame: ${error.message}`);
    await promoteHostIfNeeded(gameId, seat);
    return { removed: true, passedTo: null, gameFinished: false };
  }

  const { error } = await db
    .from("seats")
    .update({ eliminated: true })
    .eq("id", seat.id);
  if (error) throw new Error(`leaveGame: ${error.message}`);
  await promoteHostIfNeeded(gameId, seat);

  const remaining = (await seatsFor(gameId)).filter(
    (other) => other.character_id && !other.eliminated,
  );

  // A table with nobody left in it is over. One player left is not a game
  // either — the box says two to six — so it ends there rather than leaving
  // someone rolling against themselves.
  if (remaining.length <= 1) {
    await db.from("games").update({ status: "finished", active_seat: null }).eq("id", gameId);
    return { removed: false, passedTo: null, gameFinished: true };
  }

  if (activeSeat !== seat.seat_index) {
    return { removed: false, passedTo: null, gameFinished: false };
  }

  // The leaver was mid-turn, so play has to move on or the table deadlocks.
  const next = remaining.find((other) => other.seat_index > seat.seat_index) ?? remaining[0];
  await db
    .from("games")
    .update({ active_seat: next.seat_index, turn_state: { phase: "rzut" } })
    .eq("id", gameId);
  return { removed: false, passedTo: next.seat_index, gameFinished: false };
}

/**
 * Moves the table-screen role to a seat.
 *
 * At a physical table the shared device changes hands — someone's laptop goes
 * flat, or the person who opened the table is not the one sitting in front of
 * it. Any seated player may claim it, which is the right trust model here:
 * they are all in the same room, and in companion mode the app holds nothing
 * the others cannot already see.
 *
 * It also recovers a table whose host seat became unreachable, which is easy to
 * do by joining twice from one browser and overwriting the stored token.
 */
/**
 * Takes a seat out of the table before the game starts.
 *
 * Only in the lobby, and only by someone already seated. Once play has begun a
 * character cannot simply be deleted — its Przedmioty and Przyjaciele are on
 * the board and other players may have acted on them — so leaving mid-game is
 * `leaveGame`, which eliminates rather than erases (4.4).
 *
 * Removing yourself is allowed and behaves exactly the same; a lobby where the
 * host cannot drop out is worse than one where anybody can tidy up.
 */
export async function removeSeat(gameId: string, seatId: string, status: string): Promise<void> {
  if (status !== "lobby") {
    throw new Error("Gracza można usunąć tylko przed rozpoczęciem gry.");
  }
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");

  const { error } = await db.from("seats").delete().eq("id", seatId);
  if (error) throw new Error(`removeSeat: ${error.message}`);
  await promoteHostIfNeeded(gameId, seat);
}

export async function claimTableScreen(gameId: string, seatId: string): Promise<void> {
  const seats = await seatsFor(gameId);
  for (const seat of seats) {
    if (seat.is_host && seat.id !== seatId) {
      await db.from("seats").update({ is_host: false }).eq("id", seat.id);
    }
  }
  const { error } = await db.from("seats").update({ is_host: true }).eq("id", seatId);
  if (error) throw new Error(`claimTableScreen: ${error.message}`);
}

/**
 * Keeps a table hosted. The host flag only decides who sees the lobby controls,
 * but a table whose host walked away with it would strand everyone else.
 */
async function promoteHostIfNeeded(gameId: string, leaving: SeatRow): Promise<void> {
  if (!leaving.is_host) return;
  const candidate = (await seatsFor(gameId)).find(
    (seat) => seat.id !== leaving.id && !seat.eliminated,
  );
  if (!candidate) return;

  await db.from("seats").update({ is_host: true }).eq("id", candidate.id);
  // Hand the flag over rather than copying it. A retired seat keeps its row so
  // the journal's references survive, and leaving it marked host would leave
  // the table with two — the outgoing one being a seat nobody is sitting in.
  await db.from("seats").update({ is_host: false }).eq("id", leaving.id);
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
