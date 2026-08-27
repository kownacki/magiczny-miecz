/** Every database read and write for a game, so route handlers never touch Supabase directly. */

import type { EqMode } from "@/lib/engine/slots";
import { db, type DbHandle } from "@/lib/supabase";
import * as tables from "./tables";
import { makeClaimToken, makeJoinCode } from "./codes";
import { MAX_SEATS, type GameMode } from "./modes";
import { isQuiet } from "./commands/lobby";
import { asSeatCharacter, type SeatCharacter } from "@/lib/engine/characters";
import { asFieldId, type FieldId } from "@/lib/engine/board";
import { Failure } from "./failure";
import type { TurnPhase } from "@/lib/engine/turn";

/**
 * A place at the table and the Postać standing in it — and nobody's name.
 *
 * The person who drives this is a `UserRow`, which is a different row for a
 * different lifetime: figures stay in their seats for the whole game and people
 * come and go past them. See db/schema.sql for the four states the two make
 * between them.
 */
export interface SeatRow {
  id: string;
  seat_index: number;
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
  created_at: string;
  /** 7.3: the turn this seat last changed its Natura on. */
  nature_changed_turn: number | null;
  eliminated: boolean;
}

/**
 * Somebody at the table. Unbounded, unlike the seats.
 *
 * `seat_index` is what they are driving and null is a spectator — which is a
 * thing to be rather than the absence of one, since 4.4 lets a player whose
 * Postać died decline to take another.
 */
export interface UserRow {
  /** Four characters, globally unique. See `makeUserId`. */
  id: string;
  name: string;
  /** What the browser calls itself, from localStorage. Survives the tab closing. */
  device_id: string | null;
  is_host: boolean;
  /** They have said they are ready to start (docs/LOBBY.md). */
  ready: boolean;
  /** The seat they drive; null while they are only watching. */
  seat_index: number | null;
  /** When this device was last heard from (see `AWAY_AFTER_MS`). */
  seen_at: string | null;
  /** Set when the device said its page was going away. See `sayGoodbye`. */
  left_at: string | null;
  /** Join order, which is how the host role finds a successor. */
  created_at: string;
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
  /**
   * The Karty Postaci that are out of the game (4.4).
   *
   * A list because nothing else remembers. "Jej Kartę odłożyć do pozostałych
   * nie biorących udziału w grze" — and the dead character's id used to be read
   * off the seat that held it, which works exactly until that player picks
   * again and the id is overwritten. So 4.4 survived until the first death and
   * then quietly returned every dead character to the pool.
   */
  characters_out: string[];
}

/**
 * Everything a client is allowed to know about the table. Listed once so a
 * column added to the schema cannot silently go missing from the API — which is
 * exactly how turn_state was absent from every response the first time.
 */
export const GAME_COLUMNS =
  "id,join_code,mode,eq_mode,die_source,status,active_seat,turn,revision,journal_seq,turn_state,deck,characters_out";

/** Columns safe to send to any device at the table. `claim_token` is never among them. */
const SEAT_COLUMNS =
  "id,seat_index,character_id,field_id,sword_own,magic_own,sword_floor,magic_floor,life,gold,nature,turns_lost,stone_until_turn,bridge_blocked_until_turn,nature_changed_turn,eliminated,created_at";

/** The same for a user. `claim_token` is never among them. */
export const USER_COLUMNS =
  "id,name,device_id,is_host,ready,seat_index,seen_at,left_at,created_at";

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
  /** Which browser this is, so the host can be recognised coming back. */
  deviceId: string | null = null,
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

    /**
     * The first chair, and the person who opened the table standing in it.
     *
     * Two rows, and they were one: the seat carried the name, the claim and the
     * host flag, and every one of those is a fact about a *person*. The seat is
     * a place with a Postać in it and nothing else, so the only thing it needs
     * here is its number.
     *
     * The device is written here, with the row, because this was the one case
     * `resumeAs` could not answer. The comment that used to stand here said the
     * id was unknown at this point and would be "written on the first poll" —
     * it was not, by anything, and nothing ever wrote `device_id` outside
     * `joinGame`. So whoever opened a table could never be recognised on the
     * way back: the host, the person likeliest of anyone to reload the page.
     *
     * Null when the browser refuses storage, exactly as in `joinGame`. Nothing
     * is gated on it — it buys a way back, and its absence costs only that.
     */
    const hostToken = makeClaimToken();
    const { error: seatError } = await tables.seats.insert({ game_id: data.id, seat_index: 0 });
    if (seatError) throw new Error(`createGame seat: ${seatError.message}`);

    const { error: userError } = await tables.users.insert({
      id: makeUserId(),
      game_id: data.id,
      name: hostName ?? "Gospodarz",
      claim_token: hostToken,
      device_id: deviceId,
      is_host: true,
      seat_index: 0,
    });
    if (userError) throw new Error(`createGame user: ${userError.message}`);

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

/** What Postacie are standing at each of several tables, in one query rather than one each. */
export async function seatsInGames(gameIds: readonly string[]): Promise<Record<string, unknown>[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await db
    .from("seats")
    .select("game_id,seat_index,character_id")
    .in("game_id", gameIds)
    .order("seat_index");
  if (error) throw new Failure(`seatsInGames: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Who is *at* each of several tables — the other half of the same question.
 *
 * Two queries where there used to be one, because there are now two rows: the
 * chair with a Postać in it and the person driving it. The list of tables needs
 * both — what is being played, and whether anybody is still there to play it —
 * and neither answers for the other.
 */
export async function usersInGames(gameIds: readonly string[]): Promise<Record<string, unknown>[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await db
    .from("users")
    .select("game_id,id,name,seat_index,is_host,seen_at,left_at")
    .in("game_id", gameIds)
    .order("created_at");
  if (error) throw new Failure(`usersInGames: ${error.message}`);
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

/**
 * One game by its row id, for callers that already have one.
 *
 * `findGame` takes a join code, which is what a URL carries; everything past
 * the route already holds the id. This lived in `turnStore.ts` as a private
 * `loadGame` — the one `db` call left outside this file, and invisible to a
 * `db.from` grep because the handle and the call sat on separate lines.
 *
 * `GAME_COLUMNS` and not a hand-written list: the copy that used to be here
 * drifted the moment a column was added, and a game that does not know its own
 * `eq_mode` silently behaves as though the variant were off.
 */
export async function gameById(
  gameId: string,
): Promise<GameRow & { turn_state: TurnPhase }> {
  const { data, error } = await db
    .from("games")
    .select(GAME_COLUMNS)
    .eq("id", gameId)
    .single();
  if (error) throw new Failure(`gameById: ${error.message}`);
  return data as GameRow & { turn_state: TurnPhase };
}

/**
 * The tail of a game's journal, as rows.
 *
 * Turning them into sentences is `journalText.ts`'s and happens in the route,
 * because `moves` is the complete private record and some of what it holds is
 * nobody else's business (9.3). Reading it is this file's, like every other
 * query: the route that owns this one was the last place in the app holding
 * the service-role handle itself.
 *
 * Newest first, so a window is the tail of a long game rather than its opening.
 */
export async function journalRows(
  gameId: string,
  options: { after: number; limit: number },
): Promise<Record<string, unknown>[]> {
  let query = db
    .from("moves")
    .select("seq,seat_id,actor_name,turn,kind,payload,manual")
    .eq("game_id", gameId)
    .order("seq", { ascending: false })
    .limit(options.limit);
  if (options.after > 0) query = query.gt("seq", options.after);
  const { data, error } = await query;
  if (error) throw new Failure(`journalRows: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Everybody at the table, in join order.
 *
 * By `created_at` rather than by seat, because most of what asks this asks
 * about people — who is host, who is quiet, who arrived first — and half of
 * them are in no seat at all.
 */
export async function usersFor(gameId: string, on: DbHandle = db): Promise<UserRow[]> {
  const { data, error } = await on
    .from("users")
    .select(USER_COLUMNS)
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Failure(`usersFor: ${error.message}`);
  return (data ?? []) as UserRow[];
}

/**
 * A fresh id: four characters from an alphabet with no 0/O and no 1/l.
 *
 * Short enough to read off a roster and type into `kick`, and unique across the
 * whole schema rather than per table, so a person can be pointed at without
 * naming where they are sitting. Thirty characters to the power of four is
 * eight hundred thousand of them; the caller retries on the unique violation
 * rather than checking first, because checking first is a race.
 */
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function makeUserId(pick: () => number = Math.random): string {
  let out = "";
  for (let at = 0; at < 4; at++) {
    out += ID_ALPHABET[Math.floor(pick() * ID_ALPHABET.length)];
  }
  return out;
}

export async function seatsFor(gameId: string, on: DbHandle = db): Promise<SeatRow[]> {
  const { data, error } = await on
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

/**
 * Somebody arrives, and sits down if there is anywhere to sit.
 *
 * Two rows now, and they are not the same kind of thing. The **user** is the
 * person, and there is always room for one: a table can hold any number of
 * people watching. The **seat** is the place at the table, and there are six.
 * So joining a full table is not a refusal any more — it is arriving as a
 * spectator, which is a thing to be.
 *
 * Which place is free can only be decided by looking at the others, and by the
 * time the insert lands somebody else may have taken it. So the database
 * decides: `unique (game_id, seat_index)` rejects the loser of a tie and it
 * looks again. Working it out more cleverly cannot help — between any read and
 * any write there is a gap.
 */
export async function joinGame(
  gameId: string,
  playerName: string | null,
  deviceId: string | null = null,
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
  /**
   * A chair they came back for, rather than whichever one is free.
   *
   * This is the join gate's "wolne Postacie": somebody arriving to take over a
   * particular abandoned Postać, which is the commonest way anybody rejoins a
   * table after closing the tab on a device that does not remember them.
   */
  wanted: number | null = null,
): Promise<{ user: UserRow; seat: SeatRow | null; token: string }> {
  const token = makeClaimToken();
  const name = (playerName ?? "").trim() || null;

  // A name has to be unique at the table for `kick Michał` to mean one person,
  // so the collision is refused rather than quietly suffixed.
  if (name) {
    const here = await usersFor(gameId);
    if (here.some((one) => one.name === name)) {
      throw new Error(`Przy stole jest już ${name}.`);
    }
  }

  for (let attempt = 0; attempt < MAX_SEATS + 4; attempt++) {
    const existing = await seatsFor(gameId);
    const here = await usersFor(gameId);
    const driven = new Set(
      here.map((one) => one.seat_index).filter((at): at is number => at !== null),
    );

    /**
     * The lowest place nobody is in, and none at all when the table is full —
     * which seats them as a spectator rather than turning them away.
     *
     * "Nobody is in" is about the *pair*: no driver, and no Postać standing
     * there. A chair whose person was kicked or swept is free again and is sat
     * back down in; a chair with a Postać on it is not, because picking that
     * figure up is a deliberate act with its own door (`takeSeat`, off the
     * takeover gate) rather than something that happens to whoever arrives
     * next.
     *
     * It used to skip every seat row that *existed*, which meant a freed chair
     * was never reused: each arrival cut a new one until the sixth, and then a
     * table with one player at it could seat nobody at all.
     */
    const taken = new Set(existing.map((seat) => seat.seat_index));
    const standing = new Set(
      existing.filter((seat) => seat.character_id).map((seat) => seat.seat_index),
    );
    let seatIndex: number | null = 0;
    if (wanted !== null) {
      /**
       * A chair they came back for, rather than whichever one is free.
       *
       * Refused only when somebody is *actively* driving it. A user row still
       * pointing at the seat is not enough — that is exactly what an abandoned
       * Postać looks like, and taking one over is the whole reason for asking
       * for a seat by name. `takeSeat` has drawn the line at `isQuiet` since it
       * was written; this used to refuse anybody at all, so the join gate
       * offered "gracz się rozłączył" and the server said the seat was taken.
       *
       * The quiet one is stood up first, or two people hold one seat and the
       * unique index refuses the write with a message nobody can act on.
       */
      const holder = here.find((one) => one.seat_index === wanted);
      if (holder && !isQuiet(holder, Date.now())) {
        throw new Error("To miejsce ma już swojego gracza.");
      }
      if (holder) {
        const { error } = await tables.users.update({ seat_index: null }).eq("id", holder.id);
        if (error) throw new Failure(`joinGame(displace): ${error.message}`);
      }
      seatIndex = wanted;
    } else {
      while (seatIndex < MAX_SEATS && (standing.has(seatIndex) || driven.has(seatIndex))) seatIndex++;
      if (seatIndex >= MAX_SEATS) seatIndex = null;
    }

    let seat: SeatRow | null = null;
    if (seatIndex !== null && !taken.has(seatIndex)) {
      const made = await tables.seats.insert({ game_id: gameId, seat_index: seatIndex, eliminated: midGame })
        .select(SEAT_COLUMNS)
        .single();
      if (made.error) {
        if (made.error.code !== "23505") throw new Failure(`joinGame(seat): ${made.error.message}`);
        continue; // Somebody took that place between the read and the write.
      }
      seat = made.data as SeatRow;
    } else if (seatIndex !== null) {
      seat = existing.find((one) => one.seat_index === seatIndex) ?? null;
    }

    const { data, error } = await db
      .from("users")
      .insert({
        id: makeUserId(),
        game_id: gameId,
        name: name ?? `Gracz ${(existing.length + 1).toString()}`,
        device_id: deviceId,
        claim_token: token,
        seat_index: seatIndex,
      })
      .select(USER_COLUMNS)
      .single();

    if (!error) return { user: data as UserRow, seat, token };
    // A minted id already in use, or a seat somebody took first. Both are the
    // unique index doing its job; both are answered by trying again.
    if (error.code !== "23505") throw new Failure(`joinGame(user): ${error.message}`);
  }
  throw new Error("Nie udało się usiąść — spróbujcie jeszcze raz.");
}

/**
 * Who a device's token proves it is, and what they are driving.
 *
 * Both, because almost every route wants both: the person is who may act, and
 * the seat is what they act *on*. A spectator holds a perfectly good token and
 * drives nothing, so the seat is null and the route decides whether that is a
 * refusal — which is the question that used to be impossible to ask, back when
 * holding a token and holding a seat were the same fact.
 */
export async function verifyActor(
  gameId: string,
  token: string,
): Promise<{ user: UserRow; seat: SeatRow | null } | null> {
  const user = await verifyUser(gameId, token);
  if (!user) return null;
  if (user.seat_index === null) return { user, seat: null };
  const seats = await seatsFor(gameId);
  return { user, seat: seats.find((one) => one.seat_index === user.seat_index) ?? null };
}

/** The person a device's token proves it is, or nobody. */
export async function verifyUser(gameId: string, token: string): Promise<UserRow | null> {
  const { data, error } = await db
    .from("users")
    .select(USER_COLUMNS)
    .eq("game_id", gameId)
    .eq("claim_token", token)
    .maybeSingle();
  if (error) throw new Failure(`verifyUser: ${error.message}`);
  return (data as UserRow) ?? null;
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

export async function holdingsFor(gameId: string, on: DbHandle = db): Promise<HoldingRow[]> {
  const { data, error } = await on
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

export async function fieldCardsFor(gameId: string, on: DbHandle = db): Promise<FieldCardRow[]> {
  const { data, error } = await on
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
export async function markSeenUser(userId: string): Promise<void> {
  // Also cancels a goodbye. A page that said it was going away and then asked
  // for the state has come back — a reload, or a tab restored — and reloading
  // is the commonest reason a page goes away at all.
  await db
    .from("users")
    .update({ seen_at: new Date().toISOString(), left_at: null })
    .eq("id", userId);
}

/**
 * A device saying its page is about to go away.
 *
 * Waiting for somebody to fall silent takes minutes, because a hidden tab polls
 * at whatever rate the browser feels like — so a table sat there showing people
 * who had closed it. The page now says so on the way out, and the difference is
 * between ten seconds and two and a half minutes.
 *
 * The *person's*, like `seen_at` beside it: a chair does not close a tab. Which
 * also means somebody who is only watching says goodbye too, and is swept for
 * it — before the split they had no row to say it with.
 */
export async function sayGoodbye(userId: string): Promise<void> {
  await tables.users.update({ left_at: new Date().toISOString() }).eq("id", userId);
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
