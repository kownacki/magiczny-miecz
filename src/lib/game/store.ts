/** Every database read and write for a game, so route handlers never touch Supabase directly. */

import { randomInt } from "node:crypto";
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
  /** Set when the player behind this seat walked away; the character stays. */
  abandoned_at: string | null;
  /** When this seat's device was last heard from (see `AWAY_AFTER_MS`). */
  seen_at: string | null;
  /** The player has said they are ready to start (docs/LOBBY.md). */
  ready: boolean;
  /** Seated by the host in companion mode; nobody behind it holds a device. */
  no_device: boolean;
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
  "id,seat_index,player_name,character_id,field_id,miecz_own,magia_own,miecz_floor,magia_floor,zycie,zloto,nature,turns_lost,stone_until_turn,bridge_blocked_until_turn,nature_changed_turn,abandoned_at,seen_at,ready,no_device,eliminated,is_host";

/**
 * Creates a table and returns the host's seat token.
 *
 * Retries on a join-code collision rather than trusting randomness: codes are
 * five characters from a 28-glyph alphabet, and a collision would otherwise
 * surface as a unique-constraint error in front of the players.
 */
export type GameMode = "simulation" | "companion";

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
): Promise<{ game: GameRow; hostToken: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = makeJoinCode();
    const { data, error } = await db
      .from("games")
      .insert({ join_code: joinCode, mode })
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
  const { data, error } = await db
    .from("games")
    .select("id,join_code,status,mode,turn,last_played_at,created_at")
    .order("last_played_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listGames: ${error.message}`);

  const games = data ?? [];
  if (games.length === 0) return [];

  const { data: seats } = await db
    .from("seats")
    .select("game_id,seat_index,player_name,character_id,abandoned_at")
    .in("game_id", games.map((game) => game.id))
    .order("seat_index");

  return games.map((game) => ({
    joinCode: game.join_code as string,
    status: game.status as string,
    mode: game.mode as string,
    turn: game.turn as number,
    lastPlayedAt: game.last_played_at as string,
    createdAt: game.created_at as string,
    players: (seats ?? [])
      .filter((seat) => seat.game_id === game.id)
      .map((seat) => ({
        name: seat.player_name as string | null,
        characterId: seat.character_id as string | null,
        abandoned: seat.abandoned_at !== null,
      })),
  }));
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
  /** True when the host is seating somebody who has no device of their own. */
  noDevice = false,
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
      no_device: noDevice,
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
/**
 * Gives a seat its character.
 *
 * No two seats may hold the same one. The box has 27 Karty Postaci and one
 * plastic figure per card, and setup deals *one* to each player — there is no
 * second Kapłanka to hand out. The UI greys taken characters out; this is the
 * rule itself, since two devices can reach for the same one in the same second
 * and only the server sees both.
 */
export async function chooseCharacter(
  gameId: string,
  seatId: string,
  characterId: string,
): Promise<void> {
  const character = CHARACTERS.find((c) => c.id === characterId);
  if (!character) throw new Error(`Nieznana postać: ${characterId}`);

  const { data: rivals } = await db
    .from("seats")
    .select("id,character_id")
    .eq("game_id", gameId)
    .eq("character_id", characterId);
  if ((rivals ?? []).some((seat) => seat.id !== seatId)) {
    throw new Error(`${character.name} jest już wybrana przez kogoś innego.`);
  }

  // Swapping character un-readies you. Otherwise a player who said they were
  // ready and then changed their mind is still counted, and the host starts a
  // game somebody was still deciding about.
  await db.from("seats").update({ ready: false }).eq("id", seatId);

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

/**
 * Shuffles the Karty Postaci and deals one to each seat — which is what the
 * rulebook actually says to do:
 *
 * > Przed rozpoczęciem rozgrywki należy potasować Karty Postaci, a następnie
 * > rozłożyć losowo, po jednej przed każdym z graczy. Jeżeli zgodzą się na to
 * > wszyscy uczestnicy, można zrezygnować z losowego podziału […]
 *
 * Free choice is the variant, agreed to by everybody; the random deal is the
 * default, and the app had only ever offered the variant. Seats that already
 * hold a character keep it, so this fills the table in rather than overturning
 * choices people have made.
 */
export async function dealCharacters(gameId: string): Promise<void> {
  const seats = await seatsFor(gameId);
  const empty = seats.filter((seat) => !seat.character_id && !seat.abandoned_at);
  if (empty.length === 0) return;

  const taken = new Set(seats.map((seat) => seat.character_id).filter(Boolean));
  const pool = CHARACTERS.filter((character) => !taken.has(character.id));
  // Fisher–Yates with a real CSPRNG. Nobody is attacking a character deal, but
  // the one already in the file is correct and `Math.random` is not.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (const [index, seat] of empty.entries()) {
    const character = pool[index];
    if (!character) break; // 27 cards, 6 seats — unreachable, but not assumed
    await chooseCharacter(gameId, seat.id, character.id);
  }
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

/**
 * Says whether a player is ready to start (docs/LOBBY.md).
 *
 * Only ever your own seat: readiness is a statement about yourself, and a host
 * who could mark everyone ready would have a start button with extra steps.
 */
export async function setReady(seatId: string, ready: boolean): Promise<void> {
  const { error } = await db.from("seats").update({ ready }).eq("id", seatId);
  if (error) throw new Error(`setReady: ${error.message}`);
}

/** Changes the name shown for a seat. Only ever your own. */
export async function renameSeat(seatId: string, name: string | null): Promise<void> {
  const { error } = await db.from("seats").update({ player_name: name }).eq("id", seatId);
  if (error) throw new Error(`renameSeat: ${error.message}`);
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
  // Before the game starts a seat is just an intention, so leaving deletes it.
  if (status === "lobby") {
    const { error } = await db.from("seats").delete().eq("id", seat.id);
    if (error) throw new Error(`leaveGame: ${error.message}`);
    await promoteHostIfNeeded(gameId, seat);
    return { removed: true, passedTo: null, gameFinished: false };
  }

  // Once play has begun it is not. A player walking away is not a character
  // dying: the figure stays on its Obszar with its points, its Przedmioty and
  // its Przyjaciele, because other players may already have acted on all of
  // them and 4.4's death is a different event with different consequences.
  //
  // What is released is the *claim*. The token is rotated so the departing
  // device cannot act as this seat any more, and the seat is marked as having
  // nobody behind it — free for somebody to take over, and shown as such.
  const { error } = await db
    .from("seats")
    .update({ abandoned_at: new Date().toISOString(), claim_token: makeClaimToken() })
    .eq("id", seat.id);
  if (error) throw new Error(`leaveGame: ${error.message}`);
  await promoteHostIfNeeded(gameId, seat);

  // Play does not stop for an empty chair, but it must not wait on one either:
  // if it was their turn, it moves on.
  if (activeSeat !== seat.seat_index) {
    return { removed: false, passedTo: null, gameFinished: false };
  }
  const others = (await seatsFor(gameId)).filter(
    (other) => other.character_id && !other.eliminated && other.id !== seat.id,
  );
  if (others.length === 0) {
    return { removed: false, passedTo: null, gameFinished: false };
  }
  const next = others.find((other) => other.seat_index > seat.seat_index) ?? others[0];
  await db
    .from("games")
    .update({ active_seat: next.seat_index, turn_state: { phase: "rzut" } })
    .eq("id", gameId);
  return { removed: false, passedTo: next.seat_index, gameFinished: false };
}

/**
 * Picks up a seat nobody is behind.
 *
 * The counterpart to leaving: a fresh token is issued for that seat and handed
 * to the device asking, which then plays that character exactly as its previous
 * player did. This is also how somebody rejoins after closing the tab, which is
 * the commonest way a seat is abandoned in the first place.
 */
export async function claimSeat(
  gameId: string,
  seatId: string,
  /** A new player's name; null keeps whoever the table already knows this seat as. */
  playerName: string | null = null,
): Promise<string> {
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  // Either nobody is behind it, or nobody has been for long enough that the
  // difference stopped mattering. A player who closed their tab never said
  // they were leaving, so the seat is only quiet — and refusing it would strand
  // the character for the rest of the evening. The people in the room settle
  // who picks it up; the server only refuses a seat somebody is actively using.
  if (seat.no_device) {
    throw new Error("Tym miejscem kieruje gospodarz przy wspólnym ekranie.");
  }
  if (!seat.abandoned_at && !isQuiet(seat)) {
    throw new Error("To miejsce ma już swojego gracza.");
  }

  const token = makeClaimToken();
  const { error } = await db
    .from("seats")
    .update({
      abandoned_at: null,
      claim_token: token,
      // Left alone when nobody supplied one, because the commonest takeover by
      // far is the same person on a new tab, and renaming them to nothing —
      // or making them retype it — would be the app being obtuse.
      ...(playerName ? { player_name: playerName } : {}),
    })
    .eq("id", seatId);
  if (error) throw new Error(`claimSeat: ${error.message}`);
  return token;
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
export async function removeSeat(
  gameId: string,
  seatId: string,
  status: string,
  by: SeatRow,
): Promise<void> {
  // Removing somebody else is the host's job. Removing yourself is not — that
  // is just leaving, and nobody should need permission for it.
  if (!by.is_host && by.id !== seatId) {
    throw new Error("Tylko gospodarz może usuwać graczy.");
  }
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");

  // Mid-game the character goes with the player, and the seat is free for
  // somebody new. What it was carrying does not vanish with it: the Przedmioty,
  // Przyjaciele and gold are left face up on its Obszar, where 12.1 lets the
  // next character to stop there pick them up. Deleting the row would take them
  // out of the game silently, and the board would be quietly poorer for it.
  if (status === "playing" && seat.field_id) {
    const held = await holdingsFor(gameId);
    const mine = held.filter((holding) => holding.seat_id === seatId);
    const dropped = [
      ...mine.filter((holding) => holding.kind !== "spell").map((holding) => holding.card_id),
      ...Array.from({ length: seat.zloto }, () => "1-sztuka-zlota"),
    ];
    if (dropped.length > 0) {
      await db.from("field_cards").insert(
        dropped.map((cardId) => ({
          game_id: gameId,
          field_id: seat.field_id,
          card_id: cardId,
        })),
      );
    }
  }

  const { error } = await db.from("seats").delete().eq("id", seatId);
  if (error) throw new Error(`removeSeat: ${error.message}`);
  await promoteHostIfNeeded(gameId, seat);
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
  if (error) throw new Error(`deleteGame: ${error.message}`);
}

/**
 * Hands the host role to a seat.
 *
 * Two ways in, and only two. The host may give it away deliberately, and any
 * player may take it when the host's own seat has been abandoned — without that
 * second door, a table whose host closed their laptop can never be configured
 * or started again, which is the whole reason host migration exists.
 *
 * Taking it from a host who is present is not a door. There is no co-host.
 */
export async function claimTableScreen(
  gameId: string,
  seatId: string,
  by: SeatRow,
): Promise<void> {
  const seats = await seatsFor(gameId);
  const host = seats.find((seat) => seat.is_host);

  if (host && host.id !== by.id && !host.abandoned_at) {
    throw new Error("Rolę gospodarza może przekazać tylko obecny gospodarz.");
  }
  const target = seats.find((seat) => seat.id === seatId);
  if (!target) throw new Error("Nie ma takiego miejsca.");
  if (target.abandoned_at) throw new Error("To miejsce nie ma gracza.");

  for (const seat of seats) {
    if (seat.is_host && seat.id !== seatId) {
      await db.from("seats").update({ is_host: false }).eq("id", seat.id);
    }
  }
  const { error } = await db.from("seats").update({ is_host: true }).eq("id", seatId);
  if (error) throw new Error(`claimTableScreen: ${error.message}`);
}

/**
 * How long a seat may go unheard-from before it is shown as away.
 *
 * The browser polls every two seconds, so this is generous: a tab in the
 * background, a phone that slept, or a slow network should not make somebody
 * look like they have left the table.
 */
export const AWAY_AFTER_MS = 45_000;

/**
 * A seat that checked in once and then stopped.
 *
 * A seat that has *never* checked in is not quiet — it is either brand new or a
 * player the host seated by hand, and neither is free for the taking.
 */
export function isQuiet(seat: Pick<SeatRow, "seen_at">): boolean {
  if (!seat.seen_at) return false;
  return Date.now() - new Date(seat.seen_at).getTime() > AWAY_AFTER_MS;
}

/** Records that this seat's device is still there. */
export async function markSeen(seatId: string): Promise<void> {
  await db.from("seats").update({ seen_at: new Date().toISOString() }).eq("id", seatId);
}

/**
 * Keeps a table hosted. The host flag only decides who sees the lobby controls,
 * but a table whose host walked away with it would strand everyone else.
 */
async function promoteHostIfNeeded(gameId: string, leaving: SeatRow): Promise<void> {
  if (!leaving.is_host) return;
  // The longest-standing player takes over. Seats are appended in join order,
  // so the lowest index is whoever has been at the table longest — a stable,
  // explicable rule, which matters because nobody chose it in the moment.
  // Somebody who has themselves walked away is skipped; handing the role to an
  // empty chair is how a table ends up unstartable.
  const candidate = (await seatsFor(gameId))
    .filter((seat) => seat.id !== leaving.id && !seat.eliminated && !seat.abandoned_at)
    .sort((a, b) => a.seat_index - b.seat_index)[0];
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
  // Every change is a moment the table was being played, which is what a list
  // of games needs to sort by — not when it was opened.
  await db
    .from("games")
    .update({ revision: next, last_played_at: new Date().toISOString() })
    .eq("id", gameId);
  return next;
}
