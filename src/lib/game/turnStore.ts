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
import type { CardClass, EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { beastCombatKind, beastStrength, compareCombat } from "@/lib/engine/combat";
import { kindForCard } from "@/lib/engine/holdings";
import {
  buildDeck,
  cardRef,
  discardTo,
  drawFrom,
  shuffleWith,
  type DeckState,
} from "@/lib/engine/deck";

const EVENTS = events as EventCard[];

/** Card lookup by slice reference — the only key that distinguishes duplicates. */
const BY_REF = new Map(EVENTS.map((card) => [cardRef(card.source), card]));

/**
 * The shuffle bound to real randomness.
 *
 * This is the whole of what simulation mode adds over companion mode: the app
 * decides which card comes up instead of a human naming the one they drew. The
 * rules either side of it are identical, which is why the engine never learns
 * which mode it is running in.
 */
const shuffle = shuffleWith(Math.random);

import spellsData from "@/data/spells.json";
import type { Spell } from "@/data/types";

const SPELLS = spellsData as Spell[];
const SPELL_BY_REF = new Map(SPELLS.map((s) => [cardRef(s.source), s]));

/**
 * Both piles a simulated game deals from.
 *
 * Kept separate because they recycle separately: rule 9.5 says the Spell pile
 * is reshuffled from used spells when it runs out, and the event deck does the
 * same for its own discards. Merging them would let a spent Zaklęcie come back
 * as a Karta Zdarzeń.
 */
export interface Decks {
  events: DeckState;
  spells: DeckState;
}

export function freshDecks(): Decks {
  return {
    events: buildDeck(EVENTS.map((card) => cardRef(card.source)), shuffle),
    spells: buildDeck(SPELLS.map((card) => cardRef(card.source)), shuffle),
  };
}

/** Reads the stored decks, tolerating a game started before spells existed. */
function decksOf(game: { deck: unknown }): Decks {
  const stored = game.deck as Partial<Decks> | null;
  if (!stored?.events) return freshDecks();
  return { events: stored.events, spells: stored.spells ?? buildDeck(SPELLS.map((c) => cardRef(c.source)), shuffle) };
}
import { bumpRevision, holdingsFor, seatsFor, type GameRow, type SeatRow } from "./store";
import { bonusFromHoldings } from "@/lib/engine/holdings";
import { BASE_CARRY_LIMIT, carriedCount, carryLimit } from "@/lib/engine/derive";
import { HEAL_CEILING, heal, mayHold, spellCapacity } from "@/lib/engine/derive";
import type { Seat } from "@/lib/engine/state";

async function loadGame(gameId: string): Promise<GameRow & { turn_state: TurnPhase }> {
  const { data, error } = await db
    .from("games")
    .select("id,join_code,mode,die_source,status,active_seat,turn,revision,turn_state,deck")
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

  const game = await loadGame(gameId);
  await db
    .from("games")
    .update({
      status: "playing",
      turn: 1,
      active_seat: ready[0].seat_index,
      turn_state: startTurn(),
      started_at: new Date().toISOString(),
      // Only a simulation needs a deck. In companion mode the deck is the
      // physical one on the table and the app must not pretend to own it.
      deck: game.mode === "simulation" ? freshDecks() : null,
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

/**
 * Records a drawn card.
 *
 * Companion mode is told which card came up, because the physical deck decided.
 * Simulation mode draws one itself. Both end in the same place — a card added
 * to the turn's stack in rule 15.2 order — which is the DeckPort distinction
 * made concrete.
 */
export async function drawCard(
  gameId: string,
  named: { cardId: string; cardClass: CardClass } | null,
): Promise<{ card: EventCard | null; recycled: boolean }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na ciągnięcie kart.");

  if (game.mode === "companion") {
    if (!named) throw new Error("Podaj nazwę wyciągniętej karty.");
    const next = afterDraw(game.turn_state, named);
    await db.from("games").update({ turn_state: next }).eq("id", gameId);
    await journal(gameId, seat.id, game.turn, "karta", { ...named, source: "fizyczna" });
    await bumpRevision(gameId);
    return { card: EVENTS.find((c) => c.id === named.cardId) ?? null, recycled: false };
  }

  const decks = decksOf(game);
  const { deck: after, drawn, recycled } = drawFrom(decks.events, 1, shuffle);
  if (drawn.length === 0) throw new Error("Talia Kart Zdarzeń jest pusta.");

  const card = BY_REF.get(drawn[0]);
  if (!card) throw new Error(`Nieznana karta w talii: ${drawn[0]}`);

  const next = afterDraw(game.turn_state, {
    cardId: card.id,
    cardClass: card.cardClass,
    ref: drawn[0],
  });
  await db
    .from("games")
    .update({ turn_state: next, deck: { ...decks, events: after } })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "karta", {
    cardId: card.id,
    ref: drawn[0],
    source: "talia",
    recycled,
  });
  await bumpRevision(gameId);
  return { card, recycled };
}

/** Sets this turn's resolved cards aside, so the deck can recycle them later. */
export async function discardDrawn(gameId: string, refs: string[]): Promise<void> {
  const game = await loadGame(gameId);
  if (game.mode !== "simulation" || refs.length === 0) return;
  const decks = decksOf(game);
  await db
    .from("games")
    .update({ deck: { ...decks, events: discardTo(decks.events, refs) } })
    .eq("id", gameId);
}

/**
 * Deals a spell to a seat, if its Magia allows one more (2.6, 9.2).
 *
 * The capacity check is the rule that actually bites: a character with Magia 1
 * may hold no spells at all, and one that gains a spell it cannot hold must
 * shed the excess immediately (9.4).
 */
export async function drawSpell(gameId: string, seatId: string): Promise<string> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const held = await db
    .from("holdings")
    .select("id")
    .eq("seat_id", seatId)
    .eq("kind", "spell");
  const holdings = await holdingsFor(gameId);
  const mine = holdings
    .filter((h) => h.seat_id === seatId)
    .map((h) => ({ cardId: h.card_id, kind: h.kind, face: h.face }));
  const bonus = bonusFromHoldings(mine);
  const capacity = spellCapacity(seat.magia_own + bonus.magia);

  if ((held.data?.length ?? 0) >= capacity) {
    // Polish numerals agree with the noun: 2-4 take "Zaklęcia", 5 and up take
    // "Zaklęć". The capacity table tops out at 3, so both forms occur.
    const noun = capacity >= 2 && capacity <= 4 ? "Zaklęcia" : "Zaklęć";
    throw new Error(
      capacity === 0
        ? "Magia tej Postaci nie pozwala na żadne Zaklęcia (2.6)."
        : `Ta Postać może mieć najwyżej ${capacity} ${noun} (2.6).`,
    );
  }

  if (game.mode === "companion") {
    throw new Error("Przy planszy Zaklęcia ciągnie się z fizycznego stosu.");
  }

  const decks = decksOf(game);
  const { deck: after, drawn } = drawFrom(decks.spells, 1, shuffle);
  if (drawn.length === 0) throw new Error("Stos Kart Zaklęć jest pusty.");
  const spell = SPELL_BY_REF.get(drawn[0]);
  if (!spell) throw new Error(`Nieznane Zaklęcie: ${drawn[0]}`);

  await db.from("holdings").insert({
    game_id: gameId,
    seat_id: seatId,
    card_id: spell.id,
    kind: "spell",
    // Concealed from the other players (9.3).
    face: "hidden",
  });
  await db
    .from("games")
    .update({ deck: { ...decks, spells: after } })
    .eq("id", gameId);
  await journal(gameId, seatId, game.turn, "zaklecie", { spellId: spell.id });
  await bumpRevision(gameId);
  return spell.id;
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
  // Only a Wróg fights. The Miecz on Excalibur and the Magia on Pierścień Mocy
  // are bonuses to their holder (1.5, 2.5), not creatures to be rolled against.
  const foe = combatValueOf(card);
  if (!foe) throw new Error("Ta karta nie jest Wrogiem.");

  const next = startFight(
    game.turn_state,
    {
      cardId: card.id,
      cardName: card.name,
      ...(foe.kind === "magiczna" ? { magia: foe.total } : { miecz: foe.total }),
    },
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

  // In a duel the loser may be either side; against a card only the character
  // can lose. Rule 17.9 gives the winner a choice of spoils, so only the life
  // is applied automatically and the rest is left to the players.
  const loserSeat =
    fight.result.outcome === "przegrana"
      ? seat
      : fight.result.outcome === "wygrana" && fight.opponentSeat !== undefined
        ? seats.find((s) => s.seat_index === fight.opponentSeat)
        : undefined;

  if (loserSeat) {
    const left = Math.max(0, loserSeat.zycie - 1);
    await db.from("seats").update({ zycie: left }).eq("id", loserSeat.id);
    if (left === 0) await killSeat(gameId, loserSeat.id);
  }

  await db.from("games").update({ turn_state: endFight(game.turn_state) }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-koniec", {
    cardId: fight.cardId,
    outcome: fight.result.outcome,
  });
  await bumpRevision(gameId);
}

/**
 * Takes a drawn card into a seat's keeping.
 *
 * Which pile it joins comes from its class (16.6, 1.4), not from the caller, so
 * a defeated Wróg cannot be filed as equipment and start adding its Miecz to
 * its killer. Spells are the only kind held concealed (9.3).
 */
export async function takeCard(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<void> {
  const game = await loadGame(gameId);
  const card = EVENTS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Nieznana karta: ${cardId}`);

  const kind = kindForCard(card);
  if (!kind) throw new Error("Tej karty nie można zabrać ze sobą.");

  // Rule 5.4: four Przedmioty at a time unless the character has transport.
  // Friends and trophies are not Przedmioty and do not count (6.3 puts no limit
  // on Friends at all), and Sztuki Złota never count (3.5).
  if (kind === "item") {
    const holdings = await holdingsFor(gameId);
    const mine = holdings
      .filter((h) => h.seat_id === seatId)
      .map((h) => ({ cardId: h.card_id, kind: h.kind, face: h.face }));
    if (carriedCount(mine) >= carryLimit(mine)) {
      throw new Error(
        `Postać może nieść najwyżej ${BASE_CARRY_LIMIT} Przedmioty (5.4). Odrzuć coś najpierw.`,
      );
    }
  }

  await db.from("holdings").insert({
    game_id: gameId,
    seat_id: seatId,
    card_id: cardId,
    kind,
    face: "open",
  });
  await journal(gameId, seatId, game.turn, "zabranie", { cardId, kind });
  await bumpRevision(gameId);
}

/**
 * Drops a held card.
 *
 * Rule 5.5 lets a character discard an item at any moment, and 5.6 forces it
 * when over the carrying limit. Either way the card leaves the hand; where it
 * physically goes is the players' business at a table and not tracked yet.
 */
export async function dropCard(gameId: string, holdingId: string): Promise<void> {
  const game = await loadGame(gameId);
  const { data } = await db
    .from("holdings")
    .select("seat_id,card_id,kind")
    .eq("id", holdingId)
    .maybeSingle();
  await db.from("holdings").delete().eq("id", holdingId);
  await journal(gameId, (data?.seat_id as string) ?? null, game.turn, "odrzucenie", {
    cardId: data?.card_id,
    kind: data?.kind,
  });
  await bumpRevision(gameId);
}

/**
 * Trades trophies for a point of Miecz.
 *
 * Rule 1.4: seven points' worth of defeated Wrogowie buys one point of Miecz,
 * and anything past a multiple of seven is lost. The traded cards go to the
 * used pile.
 */
export const TROPHY_RATE = 7;

export async function tradeTrophies(gameId: string, seatId: string): Promise<number> {
  const game = await loadGame(gameId);
  const { data } = await db
    .from("holdings")
    .select("id,card_id")
    .eq("seat_id", seatId)
    .eq("kind", "trophy");
  const trophies = (data ?? []) as { id: string; card_id: string }[];

  const points = trophies.reduce((sum, t) => {
    const card = EVENTS.find((c) => c.id === t.card_id);
    return sum + (combatValueOf(card ?? { cardClass: "wrog" })?.total ?? 0);
  }, 0);
  const gained = Math.floor(points / TROPHY_RATE);
  if (gained < 1) throw new Error(`Potrzeba ${TROPHY_RATE} punktów Miecza pokonanych Wrogów.`);

  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  // Everything is handed in: rule 1.4 says points above a multiple of seven are
  // lost, not banked.
  await db.from("holdings").delete().eq("seat_id", seatId).eq("kind", "trophy");
  await db
    .from("seats")
    .update({ miecz_own: seat.miecz_own + gained })
    .eq("id", seatId);
  await journal(gameId, seatId, game.turn, "wymiana-trofeow", {
    points,
    gained,
    lost: points - gained * TROPHY_RATE,
  });
  await bumpRevision(gameId);
  return gained;
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
  // Turns owed. Spent one per pass in finishTurn, so "tracisz 1 turę" costs
  // exactly one trip round the table.
  tury: "turns_lost",
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

  if (stat === "zycie" && next === 0 && !seat.eliminated) await killSeat(gameId, seatId);
  await bumpRevision(gameId);
}

/**
 * Rule 4.4: a character that has lost all its Życie is dead.
 *
 * It comes off the board, and its Przedmioty and Przyjaciele stay on the field
 * where it died — which is why they are dropped rather than deleted silently.
 * Its Zaklęcia go to the used pile, and its Miecz and Magia tokens go back to
 * the reserve, which is what clearing the seat's own points represents.
 *
 * The player is not out of the game: 4.4 lets them start again with a new
 * character. Choosing one is left to them rather than done automatically.
 */
async function killSeat(gameId: string, seatId: string): Promise<void> {
  const game = await loadGame(gameId);
  const holdings = (await holdingsFor(gameId)).filter((h) => h.seat_id === seatId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);

  const left = holdings.filter((h) => h.kind === "item" || h.kind === "friend");
  if (left.length > 0 && seat?.field_id) {
    await db.from("field_cards").insert(
      left.map((h) => ({ game_id: gameId, field_id: seat.field_id, card_id: h.card_id })),
    );
  }
  await db.from("holdings").delete().eq("seat_id", seatId);

  const spells = holdings.filter((h) => h.kind === "spell").length;
  await db.from("seats").update({ eliminated: true }).eq("id", seatId);
  await journal(gameId, seatId, game.turn, "smierc", {
    droppedOnField: left.map((h) => h.card_id),
    spellsDiscarded: spells,
    field: seat?.field_id ?? null,
  });

  // With the character gone, play must move on if it was their turn.
  if (game.active_seat === seat?.seat_index) await finishTurn(gameId);
}

/**
 * Heals a character (4.7).
 *
 * Distinct from adding Życie with the +/-, and the distinction is a rule:
 * healing restores only up to the four a character started with (4.2), while
 * gains from encounters and exploration are uncapped (4.6). Routing this
 * through the engine's `heal` keeps the ceiling in one place — an earlier
 * version of this button used the generic adjustment and would have healed a
 * character past four.
 */
export async function healSeat(gameId: string, seatId: string, amount = 1): Promise<number> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const healed = heal(
    {
      ...(seat as unknown as Seat),
      zycie: seat.zycie,
    },
    amount,
  ).zycie;

  if (healed === seat.zycie) {
    throw new Error(`Uzdrowienie przywraca punkty tylko do ${HEAL_CEILING} (4.7).`);
  }

  await db.from("seats").update({ zycie: healed }).eq("id", seatId);
  await journal(gameId, seatId, game.turn, "uzdrowienie", { from: seat.zycie, to: healed });
  await bumpRevision(gameId);
  return healed;
}

/**
 * Changes a character's Nature (7.2).
 *
 * Rule 7.3 allows it at most once per turn. Rule 7.4 is the consequence that
 * bites: a Magic Item the new Nature may not use has to be dropped at once
 * (5.5), so the caller is told which held cards have become forbidden rather
 * than the app silently discarding somebody's Excalibur.
 */
export async function changeNature(
  gameId: string,
  seatId: string,
  nature: "dobra" | "zla" | "chaotyczna",
): Promise<{ nowForbidden: string[] }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  if (seat.nature === nature) return { nowForbidden: [] };

  await db.from("seats").update({ nature }).eq("id", seatId);

  const holdings = (await holdingsFor(gameId)).filter((h) => h.seat_id === seatId);
  const nowForbidden = holdings
    .filter((h) => h.kind === "item" || h.kind === "friend")
    .filter((h) => {
      const card = EVENTS.find((c) => c.id === h.card_id);
      return card ? !mayHold({ ...card, forbiddenTo: forbiddenFor(card) }, nature) : false;
    })
    .map((h) => h.card_id);

  await journal(gameId, seatId, game.turn, "zmiana-natury", {
    from: seat.nature,
    to: nature,
    nowForbidden,
  });
  await bumpRevision(gameId);
  return { nowForbidden };
}

/**
 * Which Natures a card forbids, read from its own printed text.
 *
 * The deck states these in prose rather than as a field — "jego Natura jest
 * Zła, a Przedmiotem tym mogą posługiwać się jedynie Dobre i Chaotyczne
 * Postacie" — so this looks for the phrasing the cards use and returns nothing
 * when it finds none, which is the common case.
 */
function forbiddenFor(card: EventCard): ("dobra" | "zla" | "chaotyczna")[] | undefined {
  const text = card.text.toLowerCase();
  const allowed: ("dobra" | "zla" | "chaotyczna")[] = [];
  if (/dobr[aey]/.test(text) && /jedynie|tylko/.test(text)) allowed.push("dobra");
  if (/z[łl][aey]/.test(text) && /jedynie|tylko/.test(text)) allowed.push("zla");
  if (/chaotyczn/.test(text) && /jedynie|tylko/.test(text)) allowed.push("chaotyczna");
  if (allowed.length === 0 || allowed.length === 3) return undefined;
  return (["dobra", "zla", "chaotyczna"] as const).filter((n) => !allowed.includes(n));
}

/**
 * Turns a character to stone for three turns (20.1).
 *
 * While stone it cannot move (20.4), holds nothing (20.2) and cannot be robbed
 * of a point of Życie (20.5). Its Miecz and Magia are unchanged but unusable
 * (20.3), which is why nothing is written to them here — the seat is simply
 * skipped in turn order until the timer runs out.
 */
export const STONE_TURNS = 3;

export async function turnToStone(gameId: string, seatId: string): Promise<void> {
  const game = await loadGame(gameId);
  await db
    .from("seats")
    .update({ stone_until_turn: game.turn + STONE_TURNS })
    .eq("id", seatId);
  await journal(gameId, seatId, game.turn, "kamien", { until: game.turn + STONE_TURNS });
  await bumpRevision(gameId);
}

/**
 * Attacks another character standing on the same field (13.3, 17.6).
 *
 * Rule 13.1 restricts encounters to the field a move ENDED on, so an attack is
 * only legal against someone actually standing there — passing through does not
 * count. Both sides fight with their full totals (1.5, 2.5), and rule 17.9 lets
 * the winner take a point of Życie, an item, or a Sztuka Złota, which is a
 * choice and so is left to the player.
 */
export async function attackSeat(gameId: string, targetSeatId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const attacker = activeSeatOf(seats, game);
  const target = seats.find((s) => s.id === targetSeatId);
  if (!target) throw new Error("Nieznane miejsce.");
  if (target.id === attacker.id) throw new Error("Postać nie walczy sama ze sobą.");
  if (target.eliminated) throw new Error("Ta Postać nie żyje.");
  if (target.field_id !== attacker.field_id) {
    throw new Error("Spotkanie jest możliwe tylko na tym samym Obszarze (13.1).");
  }
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na spotkanie.");

  const holdings = await holdingsFor(gameId);
  const totalsOf = (seatId: string, own: { miecz: number; magia: number }) => {
    const mine = holdings
      .filter((h) => h.seat_id === seatId)
      .map((h) => ({ cardId: h.card_id, kind: h.kind, face: h.face }));
    const bonus = bonusFromHoldings(mine);
    return { miecz: own.miecz + bonus.miecz, magia: own.magia + bonus.magia };
  };

  const mine = totalsOf(attacker.id, { miecz: attacker.miecz_own, magia: attacker.magia_own });
  const theirs = totalsOf(target.id, { miecz: target.miecz_own, magia: target.magia_own });

  const next = startFight(
    game.turn_state,
    {
      cardId: `seat:${target.seat_index}`,
      cardName: target.player_name ?? `Miejsce ${target.seat_index + 1}`,
      miecz: theirs.miecz,
      opponentSeat: target.seat_index,
    },
    mine,
  );
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, attacker.id, game.turn, "pojedynek", {
    target: target.seat_index,
    field: attacker.field_id,
  });
  await bumpRevision(gameId);
}

/**
 * Fights the Beast, which is how the game is won or the attempt fails (14.7, 22).
 *
 * The Beast is not a card: rule 14.7 rolls for it twice. One die decides the
 * kind of fight (1-3 ordinary, 4-6 magical) and a second sets its strength from
 * 10 to 15. A character that reaches the Zamek and has announced it is fighting
 * MUST go through with it (10.5) — there is no backing out at this point.
 *
 * Winning ends the game there and then (22). Losing costs two points of Życie,
 * not one, and forces a retreat off the bridge; the character may come back and
 * try again.
 */
export async function fightBeast(
  gameId: string,
  kindRoll: number | null,
  strengthRoll: number | null,
  playerRoll: number | null,
  beastRoll: number | null,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);

  const kindDie = kindRoll ?? 1 + Math.floor(Math.random() * 6);
  const strengthDie = strengthRoll ?? 1 + Math.floor(Math.random() * 6);
  for (const die of [kindDie, strengthDie]) {
    if (!Number.isInteger(die) || die < 1 || die > 6) {
      throw new Error("Kostka daje wynik od 1 do 6.");
    }
  }

  const holdings = (await holdingsFor(gameId))
    .filter((h) => h.seat_id === seat.id)
    .map((h) => ({ cardId: h.card_id, kind: h.kind, face: h.face }));
  const bonus = bonusFromHoldings(holdings);

  const kind = beastCombatKind(kindDie);
  const beastTotal = beastStrength(strengthDie);
  const mine =
    kind === "magiczna" ? seat.magia_own + bonus.magia : seat.miecz_own + bonus.miecz;

  const myDie = playerRoll ?? 1 + Math.floor(Math.random() * 6);
  const itsDie = beastRoll ?? 1 + Math.floor(Math.random() * 6);
  const result = compareCombat(
    { label: "Postać", total: mine, roll: myDie },
    { label: "Bestia", total: beastTotal, roll: itsDie },
    kind,
  );

  if (result.outcome === "wygrana") {
    await db
      .from("games")
      .update({ status: "finished", turn_state: { phase: "koniec" } })
      .eq("id", gameId);
    await journal(gameId, seat.id, game.turn, "zwyciestwo", {
      kind,
      beastTotal,
      rolls: { kindDie, strengthDie, myDie, itsDie },
    });
  } else if (result.outcome === "przegrana") {
    // Two points, not one (14.7).
    await db
      .from("seats")
      .update({ zycie: Math.max(0, seat.zycie - 2) })
      .eq("id", seat.id);
    await journal(gameId, seat.id, game.turn, "bestia-porazka", { kind, beastTotal });
    if (seat.zycie - 2 <= 0) await killSeat(gameId, seat.id);
  } else {
    await journal(gameId, seat.id, game.turn, "bestia-remis", { kind, beastTotal });
  }
  await bumpRevision(gameId);
}

/**
 * Whether this character may set foot on the Kamienny Most.
 *
 * Rule 11.9 lets a character step on only from Wymarłe Miasto or Ruiny
 * Twierdzy, and the "CEL GRY" section requires a Magiczny Miecz to walk it at
 * all. Rule 14.7 adds that the Tarcza Tolimana is what gets you into the Zamek
 * — without one you must walk past it.
 */
export function bridgeRequirements(holdings: readonly { cardId: string }[]): {
  hasSword: boolean;
  hasShield: boolean;
} {
  const ids = new Set(holdings.map((h) => h.cardId));
  return {
    hasSword: ids.has("magiczny-miecz"),
    hasShield: ids.has("tarcza-tolimana") || ids.has("tarcza-boga-tolimana"),
  };
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
