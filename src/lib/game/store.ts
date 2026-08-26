/** Every database read and write for a game, so route handlers never touch Supabase directly. */

import type { EqMode } from "@/lib/engine/slots";
import { db } from "@/lib/supabase";
import { makeClaimToken, makeJoinCode } from "./codes";
import { MAX_SEATS, type GameMode } from "./modes";
import { asSeatCharacter, type SeatCharacter } from "@/lib/engine/characters";
import { asFieldId, type FieldId } from "@/lib/engine/board";
import { Failure } from "./failure";

export interface SeatRow {
  id: string;
  seat_index: number;
  player_name: string | null;
  /** One of the 27 cards, the surprise sentinel, or nothing chosen yet. */
  character_id: SeatCharacter | null;
  field_id: FieldId | null;
  sword_own: number;
  magic_own: number;
  sword_floor: number;
  magic_floor: number;
  life: number;
  gold: number;
  nature: string | null;
  turns_lost: number;
  stone_until_turn: number | null;
  /** 11.11: the turn a failed bridge attempt stops barring another. */
  bridge_blocked_until_turn: number | null;
  /** Set when the player behind this seat walked away; the character stays. */
  abandoned_at: string | null;
  /** When this seat's device was last heard from (see `AWAY_AFTER_MS`). */
  seen_at: string | null;
  /** The player has said they are ready to start (docs/LOBBY.md). */
  ready: boolean;
  /** Seated by the host in companion mode; nobody behind it holds a device. */
  no_device: boolean;
  /** When this seat joined. Join order, now that seat_index no longer records it. */
  created_at: string;
  /** Set when the device said its page was going away. See `sayGoodbye`. */
  left_at: string | null;
  /** 7.3: the turn this seat last changed its Natura on. */
  nature_changed_turn: number | null;
  eliminated: boolean;
  is_host: boolean;
}

export interface GameRow {
  id: string;
  join_code: string;
  mode: string;
  /** Which equipment variant this table plays: see `EqMode` in `slots.ts`. */
  eq_mode: string;
  die_source: string;
  status: string;
  active_seat: number | null;
  turn: number;
  revision: number;
  /**
   * The last line number this game's journal has handed out.
   *
   * On the games row rather than worked out from `max(seq)`, so that claiming
   * the next line and winning the right to write at all are the same act: see
   * `commit`.
   */
  journal_seq: number;
  turn_state: unknown;
  /** Shuffled event deck; null in companion mode, where the table holds it. */
  deck: unknown;
}

/**
 * Everything a client is allowed to know about the table. Listed once so a
 * column added to the schema cannot silently go missing from the API — which is
 * exactly how turn_state was absent from every response the first time.
 */
export const GAME_COLUMNS =
  "id,join_code,mode,eq_mode,die_source,status,active_seat,turn,revision,journal_seq,turn_state,deck";

/** Columns safe to send to any device at the table. `claim_token` is never among them. */
const SEAT_COLUMNS =
  "id,seat_index,player_name,character_id,field_id,sword_own,magic_own,sword_floor,magic_floor,life,gold,nature,turns_lost,stone_until_turn,bridge_blocked_until_turn,nature_changed_turn,abandoned_at,seen_at,ready,no_device,eliminated,is_host,created_at,left_at";

/**
 * Creates a table and returns the host's seat token.
 *
 * Retries on a join-code collision rather than trusting randomness: codes are
 * five characters from a 28-glyph alphabet, and a collision would otherwise
 * surface as a unique-constraint error in front of the players.
 */
export type { GameMode } from "./modes";


/**
 * Opens a table.
 *
 * The mode is decided here and not later. It is not a setting — it is what kind
 * of evening this is: whether the board is on the table in front of you or only
 * in the app. Everything downstream branches on it (whether the host seats
 * people by hand, whether a deck is shuffled, who is asked to roll), so a table
 * that does not know yet is a table nothing can be decided about.
 */
export async function createGame(
  hostName: string | null = null,
  mode: GameMode = "simulation",
  eqMode: EqMode = "slots",
): Promise<{ game: GameRow; hostToken: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = makeJoinCode();
    const { data, error } = await db
      .from("games")
      .insert({ join_code: joinCode, mode, eq_mode: eqMode })
      .select(GAME_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") continue; // taken, try another
      throw new Failure(`createGame: ${error.message}`);
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

/**
 * The games worth listing, most recently played first.
 *
 * A raw read, and the whole of what the database knows about the question.
 * Which of these tables is still worth advertising, and which one everybody has
 * closed their tab on, is a rule — it lives in `lobbyStore.ts` with the rest of
 * the poczekalnia.
 */
export async function recentGames(limit: number): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from("games")
    .select("id,join_code,status,mode,turn,last_played_at,created_at")
    .order("last_played_at", { ascending: false })
    .limit(limit);
  if (error) throw new Failure(`recentGames: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/** Who is sitting at each of several tables, in one query rather than one each. */
export async function seatsInGames(gameIds: readonly string[]): Promise<Record<string, unknown>[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await db
    .from("seats")
    .select("game_id,seat_index,player_name,character_id,abandoned_at,seen_at,no_device,is_host")
    .in("game_id", gameIds)
    .order("seat_index");
  if (error) throw new Failure(`seatsInGames: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

export async function findGame(joinCode: string): Promise<GameRow | null> {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLUMNS)
    .eq("join_code", joinCode)
    .maybeSingle();
  if (error) throw new Failure(`findGame: ${error.message}`);
  return (data as GameRow) ?? null;
}

export async function seatsFor(gameId: string): Promise<SeatRow[]> {
  const { data, error } = await db
    .from("seats")
    .select(SEAT_COLUMNS)
    .eq("game_id", gameId)
    .order("seat_index");
  if (error) throw new Failure(`seatsFor: ${error.message}`);
  // The one place a stored `field_id` becomes a `FieldId`, so that nothing
  // downstream has to wonder. A column is a string and the board is a closed
  // set; narrowing here means every rule that asks where a character is
  // standing gets an answer the compiler has already checked.
  //
  // A value that is not a field becomes null rather than throwing. Null is a
  // state the game already has — a seat that has not picked a character is
  // nowhere — and it degrades to "figure is off the board, put it back with the
  // override", which a table can act on. Throwing would take the whole table
  // down over one bad row.
  type StoredSeat = Omit<SeatRow, "field_id" | "character_id"> & {
    field_id: string | null;
    character_id: string | null;
  };
  return ((data ?? []) as StoredSeat[]).map((row) => ({
    ...row,
    field_id: asFieldId(row.field_id),
    character_id: asSeatCharacter(row.character_id),
  }));
}

/** Adds a seat and returns its token. The 2-6 of `modes.ts` is enforced here. */
export async function joinGame(
  gameId: string,
  playerName: string | null,
  /** True when the host is seating somebody who has no device of their own. */
  noDevice = false,
  /**
   * True when the table is already playing.
   *
   * The seat is created out of play: `eliminated` is what the turn order reads
   * to mean "skip this one", and a seat with no character yet must be skipped
   * or the round will stop on somebody who is not there. `takeNewCharacter`
   * clears it as it deals them in, which is the same thing it does for a player
   * coming back from a death — see the note there.
   */
  midGame = false,
): Promise<{ seat: SeatRow; token: string }> {
  const token = makeClaimToken();

  // Which place is free can only be decided by looking at the others, and by
  // the time the insert lands somebody else may have taken it. So the database
  // decides: `unique (game_id, seat_index)` rejects the loser of a tie and it
  // simply looks again. Working out the answer more cleverly in here cannot
  // help — between any read and any write there is a gap.
  for (let attempt = 0; attempt < MAX_SEATS + 2; attempt++) {
    const existing = await seatsFor(gameId);

    // Every seat that exists is already claimed by a device — the host's
    // included, created with the table. An earlier version handed a joiner any
    // seat with no player_name, which meant the second person to arrive
    // silently took over the unnamed host's seat and overwrote their character.
    // Joining always adds a seat; it never adopts one.
    if (existing.length >= MAX_SEATS) {
      throw new Error("Stół jest pełny — gra jest na 2-6 graczy.");
    }

    // The lowest place nobody is in, rather than one past the end: seats are
    // deleted from the middle now — the host removes somebody, or a tab closes
    // in the poczekalnia — so counting them gives a number already in use.
    const taken = new Set(existing.map((seat) => seat.seat_index));
    let seatIndex = 0;
    while (taken.has(seatIndex)) seatIndex++;

    const { data, error } = await db
      .from("seats")
      .insert({
        game_id: gameId,
        seat_index: seatIndex,
        claim_token: token,
        player_name: playerName,
        no_device: noDevice,
        eliminated: midGame,
      })
      .select(SEAT_COLUMNS)
      .single();

    if (!error) return { seat: data as SeatRow, token };
    if (error.code !== "23505") throw new Failure(`joinGame: ${error.message}`);
    // Somebody took that place between the read and the write. Look again.
  }
  throw new Error("Nie udało się usiąść — spróbujcie jeszcze raz.");
}

export async function verifySeat(gameId: string, token: string): Promise<SeatRow | null> {
  const { data, error } = await db
    .from("seats")
    .select(SEAT_COLUMNS)
    .eq("game_id", gameId)
    .eq("claim_token", token)
    .maybeSingle();
  if (error) throw new Failure(`verifySeat: ${error.message}`);
  return (data as SeatRow) ?? null;
}

export interface HoldingRow {
  id: string;
  seat_id: string;
  card_id: string;
  kind: "spell" | "item" | "friend" | "trophy";
  face: "open" | "hidden";
  /** Where it is worn in the slotted variant; null when it is in the pack. */
  slot: string | null;
  /** Where the owner put it in their pack; null when they never said. */
  ordinal: number | null;
  /**
   * Conjured by the test shortcut rather than drawn, bought or found.
   *
   * The whole of what it means: this card is not from the box, so it never
   * joins a used pile and the deck still holds its own copy. See the column's
   * note in `db/schema.sql`.
   */
  granted: boolean;
}

export async function holdingsFor(gameId: string): Promise<HoldingRow[]> {
  const { data, error } = await db
    .from("holdings")
    .select("id,seat_id,card_id,kind,face,slot,ordinal,granted")
    .eq("game_id", gameId)
    // A pack the player has arranged first, in the order they arranged it;
    // everything else after it, oldest first, which is how the whole table read
    // before anybody could arrange anything.
    .order("ordinal", { nullsFirst: false })
    .order("created_at");
  if (error) throw new Failure(`holdingsFor: ${error.message}`);
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
  /** Dropped here by a test grant; it goes nowhere when it leaves again. */
  granted: boolean;
}

export async function fieldCardsFor(gameId: string): Promise<FieldCardRow[]> {
  const { data, error } = await db
    .from("field_cards")
    .select("id,field_id,card_id,granted")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as FieldCardRow[];
}

/**
 * Removes a table and everything on it.
 *
 * Every other table in this app survives its players walking away, because a
 * game of this length is played over several sittings. This is the one way one
 * ends on purpose — and it has to exist, or the list of tables becomes a
 * graveyard of abandoned experiments nobody can clear.
 *
 * Not guarded by a token. All tables are public here, the code is the only lock
 * there is, and everybody who can see the list is somebody who was told a code
 * by a person. The guard is the confirmation in the interface, not the server.
 */
export async function deleteGame(gameId: string): Promise<void> {
  const { error } = await db.from("games").delete().eq("id", gameId);
  if (error) throw new Failure(`deleteGame: ${error.message}`);
}

/** Records that this seat's device is still there. */
export async function markSeen(seatId: string): Promise<void> {
  // Also cancels a goodbye. A page that said it was going away and then asked
  // for the state has come back — a reload, or a tab restored — and reloading
  // is the commonest reason a page goes away at all.
  await db
    .from("seats")
    .update({ seen_at: new Date().toISOString(), left_at: null })
    .eq("id", seatId);
}

/**
 * A device saying its page is about to go away.
 *
 * Waiting for a seat to fall silent takes minutes, because a hidden tab polls
 * at whatever rate the browser feels like — so a table sat there showing people
 * who had closed it. The page now says so on the way out, and the difference is
 * between ten seconds and two and a half minutes.
 */
export async function sayGoodbye(seatId: string): Promise<void> {
  await db.from("seats").update({ left_at: new Date().toISOString() }).eq("id", seatId);
}

/**
 * Says the table changed, for the one change that is not a Command.
 *
 * Clients hold the last revision they rendered and refetch when they see a
 * higher one. Everything that writes a game goes through `commit`, which claims
 * the next revision in the same statement that wins the right to write at all —
 * every mutation except one. `joinGame` inserts a seat row and hands its token
 * back to the device that asked, and a `Changeset` can do neither: it has no
 * seat insert, deliberately, and nothing in it comes back.
 *
 * So this is the last read-modify-write in the app, and it does the same
 * compare-and-swap `commit` does rather than the bare read-then-write it used
 * to. Two people joining a table in the same second both read revision 5 and
 * both wrote 6, and the table advanced once for two changes — so a device that
 * had already seen 6 never asked again, and sat there missing a player.
 */
export async function bumpRevision(gameId: string): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("games")
      .select("revision")
      .eq("id", gameId)
      .single();
    if (error) throw new Failure(`bumpRevision: ${error.message}`);
    const base = data.revision as number;
    const { data: won, error: raceError } = await db
      .from("games")
      .update({
        revision: base + 1,
        // Every change is a moment the table was being played, which is what a
        // list of games needs to sort by — not when it was opened.
        last_played_at: new Date().toISOString(),
      })
      .eq("id", gameId)
      .eq("revision", base)
      .select("revision");
    if (raceError) throw new Failure(`bumpRevision: ${raceError.message}`);
    if (won && won.length > 0) return base + 1;
  }
  throw new Failure("bumpRevision: przegrana z każdą próbą");
}
