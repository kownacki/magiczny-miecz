/** Applies turn actions against the database, journalling each one so a wrong call at the table can be seen and undone. */

import { db } from "@/lib/supabase";
import { FIELDS } from "@/lib/engine/board";
import {
  afterDraw,
  afterMove,
  afterRoll,
  endFight,
  nextSeat,
  recordFightRoll,
  setFightTotal,
  startFight,
  startTurn,
  type TurnPhase,
} from "@/lib/engine/turn";
import events from "@/data/events.json";
import type { EventCard } from "@/data/types";

const EVENTS = events as EventCard[];
import type { CardClass } from "@/data/types";
import { bumpRevision, seatsFor, type GameRow, type SeatRow } from "./store";

async function loadGame(gameId: string): Promise<GameRow & { turn_state: TurnPhase }> {
  const { data, error } = await db
    .from("games")
    .select("id,join_code,mode,die_source,status,active_seat,turn,revision,turn_state")
    .eq("id", gameId)
    .single();
  if (error) throw new Error(`loadGame: ${error.message}`);
  return data as GameRow & { turn_state: TurnPhase };
}

/**
 * Appends to the journal. Every mutation writes one, because at a physical
 * table the app and the board *will* disagree eventually, and the only way to
 * settle it is to show what the app thought happened.
 */
async function journal(
  gameId: string,
  seatId: string | null,
  turn: number,
  kind: string,
  payload: Record<string, unknown>,
  manual = false,
): Promise<void> {
  const { data } = await db
    .from("moves")
    .select("seq")
    .eq("game_id", gameId)
    .order("seq", { ascending: false })
    .limit(1);
  const seq = ((data?.[0]?.seq as number) ?? 0) + 1;
  await db
    .from("moves")
    .insert({ game_id: gameId, seq, seat_id: seatId, turn, kind, payload, manual });
}

export async function startGame(gameId: string): Promise<void> {
  const seats = await seatsFor(gameId);
  const ready = seats.filter((seat) => seat.character_id);
  if (ready.length < 2) throw new Error("Do gry potrzeba co najmniej 2 postaci.");

  await db
    .from("games")
    .update({
      status: "playing",
      turn: 1,
      active_seat: ready[0].seat_index,
      turn_state: startTurn(),
      started_at: new Date().toISOString(),
    })
    .eq("id", gameId);
  await journal(gameId, null, 1, "start", { seats: ready.length });
  await bumpRevision(gameId);
}

function activeSeatOf(seats: SeatRow[], game: GameRow): SeatRow {
  const seat = seats.find((s) => s.seat_index === game.active_seat);
  if (!seat) throw new Error("Brak aktywnego gracza.");
  return seat;
}

/**
 * Records the movement roll.
 *
 * `value` is supplied when the table is rolling physical dice — the RandomPort
 * bound to a human. The server still validates the range, because a mistyped 8
 * would otherwise walk a character off the ring.
 */
export async function rollForMove(gameId: string, value: number | null): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "rzut") throw new Error("Nie czas na rzut.");

  const roll = value ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error("Kostka daje wynik od 1 do 6.");
  }
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  await db
    .from("games")
    .update({ turn_state: afterRoll(seat.field_id, roll) })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "rzut", { roll, manual: value !== null }, value !== null);
  await bumpRevision(gameId);
}

export async function moveTo(gameId: string, fieldId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "ruch") throw new Error("Nie czas na ruch.");

  // Only the two squares the roll actually reaches are accepted, so a stale
  // page cannot post a destination from a previous roll.
  const chosen = game.turn_state.options.find((option) => option.fieldId === fieldId);
  if (!chosen) throw new Error("To pole nie jest w zasięgu tego rzutu.");

  const field = FIELDS.get(fieldId);
  if (!field) throw new Error(`Nieznane pole: ${fieldId}`);

  await db.from("seats").update({ field_id: fieldId }).eq("id", seat.id);
  await db.from("games").update({ turn_state: afterMove(field) }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "ruch", {
    from: seat.field_id,
    to: fieldId,
    direction: chosen.direction,
  });
  await bumpRevision(gameId);
}

/** Records which card the player drew from the physical deck. */
export async function drawCard(
  gameId: string,
  cardId: string,
  cardClass: CardClass,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na ciągnięcie kart.");

  const next = afterDraw(game.turn_state, { cardId, cardClass });
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "karta", { cardId, cardClass });
  await bumpRevision(gameId);
}

/**
 * Opens a fight against a card already drawn this turn.
 *
 * The player's total is seeded from their own points only. Items and friends
 * count towards it under 1.5, but those are physical cards on the table that
 * the referee does not track yet — so the number is seeded low and left
 * editable rather than being quietly wrong.
 */
export async function beginFight(gameId: string, cardId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na walkę.");

  const card = EVENTS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Nieznana karta: ${cardId}`);
  if (card.miecz === undefined && card.magia === undefined) {
    throw new Error("Ta karta nie ma parametru walki.");
  }

  const next = startFight(
    game.turn_state,
    { cardId: card.id, cardName: card.name, miecz: card.miecz, magia: card.magia },
    { miecz: seat.miecz_own, magia: seat.magia_own },
  );
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-start", { cardId });
  await bumpRevision(gameId);
}

export async function setFightPlayerTotal(gameId: string, total: number): Promise<void> {
  const game = await loadGame(gameId);
  await db
    .from("games")
    .update({ turn_state: setFightTotal(game.turn_state, total) })
    .eq("id", gameId);
  await bumpRevision(gameId);
}

export async function fightRoll(
  gameId: string,
  side: "player" | "enemy",
  value: number | null,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");

  const roll = value ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error("Kostka daje wynik od 1 do 6.");
  }
  const next = recordFightRoll(game.turn_state, side, roll);
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-rzut", { side, roll }, value !== null);
  await bumpRevision(gameId);
}

/**
 * Closes a fight and applies its cost.
 *
 * A loss costs one point of Życie (17.4). A draw costs nothing at all (17.10) —
 * which is the detail tables most often get wrong, so the referee is careful to
 * apply literally nothing. What the *winner* takes is a choice under 17.9 and
 * is left to the player rather than assumed.
 */
export async function resolveFight(gameId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");

  const { fight } = game.turn_state;
  if (!fight.result) throw new Error("Walka nie jest rozstrzygnięta.");

  if (fight.result.outcome === "przegrana") {
    await db
      .from("seats")
      .update({ zycie: Math.max(0, seat.zycie - 1) })
      .eq("id", seat.id);
  }

  await db.from("games").update({ turn_state: endFight(game.turn_state) }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-koniec", {
    cardId: fight.cardId,
    outcome: fight.result.outcome,
  });
  await bumpRevision(gameId);
}

/**
 * Adjusts a tracked value directly.
 *
 * This is the manual override, and it is not a debug affordance — the physical
 * board is the source of truth, so anything the referee cannot yet compute (a
 * card effect not transcribed, a house ruling, a miscount) has to be
 * expressible. Journalled with `manual` set so the log distinguishes what the
 * engine decided from what a human asserted.
 */
const ADJUSTABLE = {
  miecz: "miecz_own",
  magia: "magia_own",
  zycie: "zycie",
  zloto: "zloto",
} as const;

export type Adjustable = keyof typeof ADJUSTABLE;

export async function adjust(
  gameId: string,
  seatId: string,
  stat: Adjustable,
  delta: number,
  reason: string | null,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const column = ADJUSTABLE[stat];
  const current = seat[column] as number;
  // Rules 1.3 and 2.3: own Miecz and Magia can never be pushed below the value
  // the character started with. Życie and Złoto simply floor at zero.
  const floor =
    stat === "miecz" ? seat.miecz_floor : stat === "magia" ? seat.magia_floor : 0;
  const next = Math.max(floor, current + delta);

  await db.from("seats").update({ [column]: next }).eq("id", seatId);
  await journal(
    gameId,
    seatId,
    game.turn,
    "korekta",
    { stat, delta, from: current, to: next, reason },
    true,
  );
  await bumpRevision(gameId);
}

/**
 * Ends the turn and hands play on.
 *
 * A seat sitting out spends one lost turn here rather than being passed over
 * silently, so "tracisz 1 turę" costs exactly one trip round the table.
 */
export async function finishTurn(gameId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);

  const order = seats
    .filter((s) => s.character_id)
    .map((s) => ({
      index: s.seat_index,
      eliminated: s.eliminated,
      turnsLost: s.turns_lost,
      stoneUntilTurn: s.stone_until_turn,
    }));

  const { seat: next, skipped } = nextSeat(order, game.active_seat, game.turn);
  for (const index of skipped) {
    const skippedSeat = seats.find((s) => s.seat_index === index);
    if (skippedSeat && skippedSeat.turns_lost > 0) {
      await db
        .from("seats")
        .update({ turns_lost: skippedSeat.turns_lost - 1 })
        .eq("id", skippedSeat.id);
    }
  }

  // The turn counter advances when play comes back round to or past the first
  // seat, which is what the three-turn Stone timer in 20.1 counts.
  const wrapped = next !== null && next <= (game.active_seat ?? 0);
  await db
    .from("games")
    .update({
      active_seat: next,
      turn: wrapped ? game.turn + 1 : game.turn,
      turn_state: startTurn(),
    })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "koniec-tury", { next, skipped });
  await bumpRevision(gameId);
}
