/** Applies turn actions against the database, journalling each one so a wrong call at the table can be seen and undone. */

import { db } from "@/lib/supabase";
import { GAME_COLUMNS, fieldCardsFor, type HoldingRow } from "./store";
import {
  FERRY_TOLL,
  FIELDS,
  KAMIENNY_MOST,
  type BridgeEntrance,
  isFerry,
  ringOf,
} from "@/lib/engine/board";
import { crossingFrom, trzesawiskaOutcome } from "@/lib/engine/rings";
import { crossingDice, heldAbilities, tollIsWaived } from "@/lib/engine/abilities";
import { spellScript } from "@/lib/engine/spells";
import { abilitiesOfCharacter, startingKit } from "@/lib/engine/characters";
import {
  afterDraw,
  afterMove,
  afterRoll,
  atBridge,
  bridgeBlockUntil,
  bridgeBlocked,
  endFight,
  recordGuardianStrength,
  startGuardianFight,
  strengthPending,
  endTurn,
  nextSeat,
  recordFightRoll,
  setFightTotal,
  startFight,
  startTurn,
  type TurnPhase,
} from "@/lib/engine/turn";
import events from "@/data/events.json";
import items from "@/data/items.json";
import type { CardClass, EventCard, Item } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { scriptFor } from "@/lib/engine/cardScript";
import type { TurnCard } from "@/lib/engine/state";
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
// Duplicated spells share an id, so first-wins is the right and only sensible
// reading — the copies are the same card.
const SPELL_BY_ID = new Map<string, (typeof SPELLS)[number]>(
  SPELLS.map((s) => [s.id, s] as const),
);

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
import { SLOT_LABEL, fitsIn, isWearable, type EqMode, type Slot } from "@/lib/engine/slots";
import type { Holding } from "@/lib/engine/state";
import { bumpRevision, holdingsFor, seatsFor, type GameRow, type SeatRow } from "./store";
import { bonusFromHoldings, inEffect } from "@/lib/engine/holdings";
import { BASE_CARRY_LIMIT, carriedCount, carryLimit } from "@/lib/engine/derive";
import { HEAL_CEILING, heal, mayHold, spellCapacity } from "@/lib/engine/derive";
import type { Seat } from "@/lib/engine/state";

/**
 * A stored row as the engine wants it — including where it is worn, which every
 * one of these call sites used to drop on the floor while building the same
 * object by hand.
 */
/**
 * The table's equipment variant, as the engine's type.
 *
 * A column rather than an enum in here, so this is where the string becomes
 * something the rules can switch on — and where an unrecognised value falls
 * back to the game as printed rather than to a house rule.
 */
function eq(game: { eq_mode: string }): EqMode {
  return game.eq_mode === "slotowy" ? "slotowy" : "klasyczny";
}

/** A card's printed name, for messages a player reads. */
function cardName(cardId: string): string {
  return (
    (events as EventCard[]).find((card) => card.id === cardId)?.name ??
    (items as Item[]).find((item) => item.id === cardId)?.name ??
    cardId
  );
}

function asHolding(row: HoldingRow): Holding {
  return {
    cardId: row.card_id,
    kind: row.kind,
    face: row.face,
    slot: (row.slot ?? null) as Slot | null,
  };
}

async function loadGame(gameId: string): Promise<GameRow & { turn_state: TurnPhase }> {
  const { data, error } = await db
    .from("games")
    // The shared list, not a copy: this one had drifted the moment a column
    // was added, and a game that does not know its own eq_mode silently
    // behaves as though the variant were off.
    .select(GAME_COLUMNS)
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
  // `chosen`, not `ready`: having picked a character and having said you are
  // ready are two different things, and conflating them is what let a game
  // start while somebody was still deciding.
  const chosen = seats.filter((seat) => seat.character_id);
  if (chosen.length < 2) throw new Error("Do gry potrzeba co najmniej 2 postaci.");

  // Everybody with a character has to have said so (docs/LOBBY.md). A seat
  // nobody is behind cannot say anything, so it is not asked.
  const dithering = chosen.filter((seat) => !seat.ready && !seat.abandoned_at);
  if (dithering.length > 0) {
    throw new Error(
      `Nie wszyscy są gotowi: ${dithering
        .map((seat) => seat.player_name ?? `miejsce ${seat.seat_index + 1}`)
        .join(", ")}.`,
    );
  }

  const game = await loadGame(gameId);
  await db
    .from("games")
    .update({
      status: "playing",
      turn: 1,
      active_seat: chosen[0].seat_index,
      turn_state: startTurn(),
      started_at: new Date().toISOString(),
      // Only a simulation needs a deck. In companion mode the deck is the
      // physical one on the table and the app must not pretend to own it.
      deck: game.mode === "simulation" ? freshDecks() : null,
    })
    .eq("id", gameId);
  // Ten of the twenty-seven characters own something before anyone rolls: the
  // Książę his purse of five and a Hełm, the Mag two Zaklęcia, the Zdobywca a
  // Miecz and a Tarcza. Dealing everyone one Sztuka Złota and nothing else is
  // wrong from the first turn, and wrong in the direction that flattens the
  // characters into each other.
  for (const seat of chosen) {
    await dealStartingKit(gameId, seat);
  }

  await journal(gameId, null, 1, "start", { seats: chosen.length });
  await bumpRevision(gameId);
}

async function dealStartingKit(gameId: string, seat: SeatRow): Promise<void> {
  if (!seat.character_id) return;
  const kit = startingKit(seat.character_id);

  if (kit.items?.length) {
    await db.from("holdings").insert(
      kit.items.map((cardId) => ({
        game_id: gameId,
        seat_id: seat.id,
        card_id: cardId,
        kind: "item",
        face: "open",
      })),
    );
  }

  // 3.2: everyone starts on one "chyba, że jej Karta daje w tym względzie inne
  // instrukcje" — so the column default stands unless the character overrides.
  if (kit.zloto !== undefined) {
    await db.from("seats").update({ zloto: kit.zloto }).eq("id", seat.id);
  }

  // Spells go through the ordinary draw so the deck stays honest about what has
  // left it, and so 2.6's capacity is checked the same way as at any other time.
  for (let i = 0; i < (kit.spells ?? 0); i++) {
    await drawSpell(gameId, seat.id);
  }

  if (kit.items?.length || kit.zloto !== undefined || kit.spells) {
    await journal(gameId, seat.id, 1, "wyposazenie-poczatkowe", {
      character: seat.character_id,
      ...kit,
    });
  }
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

  // 11.10 offers the bridge as part of the move, so whether it is on the table
  // has to be settled before the destinations are drawn: a Magiczny Miecz is
  // required, and 11.11 bars anyone who failed there on their last turn.
  const holdings = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const { hasSword } = bridgeRequirements(holdings.map((h) => ({ cardId: h.card_id })));
  const blocked = bridgeBlocked(seat.bridge_blocked_until_turn, game.turn);

  await db
    .from("games")
    .update({
      turn_state: afterRoll(seat.field_id, roll, {
        bridgeOffered: hasSword && !blocked,
      }),
    })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "rzut", { roll, manual: value !== null }, value !== null);
  await bumpRevision(gameId);
}

export async function moveTo(
  gameId: string,
  fieldId: string,
  viaBridge = false,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "ruch") throw new Error("Nie czas na ruch.");

  // Only the squares the roll actually reaches are accepted, so a stale page
  // cannot post a destination from a previous roll. A bridge attempt shares its
  // fieldId with the entrance it stops at, so the two are told apart by intent
  // rather than by destination.
  const chosen = game.turn_state.options.find(
    (option) => option.fieldId === fieldId && !!option.bridge === viaBridge,
  );
  if (!chosen) throw new Error("To pole nie jest w zasięgu tego rzutu.");

  const field = FIELDS.get(fieldId);
  if (!field) throw new Error(`Nieznane pole: ${fieldId}`);

  await db.from("seats").update({ field_id: fieldId }).eq("id", seat.id);
  await db
    .from("games")
    .update({
      // Turning off the ring onto the bridge stops the walk at the entrance with
      // the guardian still to be faced (11.10); the field itself is not resolved,
      // and its card is not drawn ("nie ciągnij Karty ... gdy wchodzisz na Most").
      turn_state: chosen.bridge
        ? atBridge(chosen.bridge)
        : afterMove(field, seat.field_id, await liftFieldCards(gameId, field.id)),
    })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, chosen.bridge ? "proba-mostu" : "ruch", {
    from: seat.field_id,
    to: fieldId,
    direction: chosen.direction,
    ...(chosen.bridge ? { guardian: chosen.bridge.guardian } : {}),
  });
  await bumpRevision(gameId);
}

/**
 * Picks up whatever is lying face up on a field, into the arriving character's
 * turn (12.1, 13.4, 16.8).
 *
 * They leave the board here and come back in `finishTurn` if they are still
 * unclaimed then, which is what makes a field accumulate: a Wróg nobody beat
 * and a Przedmiot nobody could carry are both waiting for the next character
 * to stop there.
 */
async function liftFieldCards(gameId: string, fieldId: string): Promise<TurnCard[]> {
  const waiting = (await fieldCardsFor(gameId)).filter((row) => row.field_id === fieldId);
  if (waiting.length === 0) return [];
  await db
    .from("field_cards")
    .delete()
    .in("id", waiting.map((row) => row.id));
  return waiting.flatMap((row) => {
    const card = EVENTS.find((c) => c.id === row.card_id);
    return card ? [{ cardId: card.id, cardClass: card.cardClass }] : [];
  });
}

/**
 * Leaves behind whatever the character did not take (16.8).
 *
 * "Karty, które pozostają na danym Obszarze ... muszą leżeć koszulkami do dołu"
 * — cards that remain, remain, face up, for whoever stops here next. So the
 * default is to leave everything.
 *
 * The exception is the cards that are used up by being read: a Spotkanie, a
 * Nieznajomy or a Miejsce whose own text ends "a następnie ją odłóż" has done
 * its work by the end of the turn, because 16.1 and 16.5 make obeying it
 * compulsory. A Przedmiot is not like that. The gold card also says "odłóż",
 * but only *after* you have converted it — leave it lying there and it is still
 * a Sztuka Złota waiting for the next character, which is exactly what the
 * first version of this got wrong.
 */
const CONSUMED_BY_READING = new Set(["spotkanie", "nieznajomy", "miejsce"]);

async function leaveCardsBehind(
  gameId: string,
  fieldId: string,
  remaining: readonly TurnCard[],
): Promise<void> {
  const stays = remaining.filter((card) => {
    const spent =
      CONSUMED_BY_READING.has(card.cardClass) &&
      scriptFor(card.cardId)?.disposition.kind === "odloz";
    return !spent;
  });
  if (stays.length === 0) return;
  await db.from("field_cards").insert(
    stays.map((card) => ({ game_id: gameId, field_id: fieldId, card_id: card.cardId })),
  );
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
    .map(asHolding);
  const bonus = bonusFromHoldings(mine, eq(game));
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

/**
 * Speaks a Zaklęcie (9.6).
 *
 * The card leaves the caster's hand for the used pile and the table is told
 * what was cast and at whom. What the spell *does* is not applied: these are
 * the most interconnected cards in the box — Zwierciadło reflects whatever was
 * just cast, Władca Zaklęć negates it, Wojna Żywiołów switches every spell and
 * magic item off until the caster's next turn — and a referee that got one of
 * those subtly wrong would be worse than one that stayed out of it.
 *
 * What the app does own is the bookkeeping a table actually loses: whose hand
 * it left, that it is spent, and that everybody heard.
 *
 * 9.7 is the one hard prohibition and is enforced: nothing works on the
 * creatures of the Kamienny Most, nor on the Bestia.
 */
export async function castSpell(
  gameId: string,
  seatId: string,
  holdingId: string,
  target: { seatIndex?: number; note?: string } = {},
): Promise<{ spell: string; effect: string }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const caster = seats.find((s) => s.id === seatId);
  if (!caster) throw new Error("Nie ma takiego gracza.");

  const held = (await holdingsFor(gameId)).find(
    (h) => h.id === holdingId && h.seat_id === seatId && h.kind === "spell",
  );
  if (!held) throw new Error("Ta Postać nie ma tego Zaklęcia.");

  const script = spellScript(held.card_id);
  const spell = SPELL_BY_ID.get(held.card_id);

  // 9.7: "Żadne Zaklęcie nie działa na istoty napotkane na Kamiennym Moście ani
  // na samą Bestię." Where the caster stands is what decides it.
  const onTheBridge = caster.field_id ? ringOf(caster.field_id) === KAMIENNY_MOST : false;
  const aimedAtSomethingThere =
    script?.target === "wrog" || script?.target === "postac-lub-wrog";
  if (onTheBridge && aimedAtSomethingThere) {
    throw new Error("Na Kamiennym Moście Zaklęcia nie działają na tutejsze istoty (9.7).");
  }

  await db.from("holdings").delete().eq("id", holdingId);

  // Back to the used pile, so the spell deck can be reshuffled honestly (9.5).
  if (game.mode === "simulation") {
    const decks = decksOf(game);
    await db
      .from("games")
      .update({ deck: { ...decks, spells: discardTo(decks.spells, [held.card_id]) } })
      .eq("id", gameId);
  }

  const victim =
    target.seatIndex !== undefined
      ? (seats.find((s) => s.seat_index === target.seatIndex)?.player_name ?? null)
      : null;

  await journal(gameId, caster.id, game.turn, "zaklecie", {
    cardId: held.card_id,
    name: spell?.name ?? held.card_id,
    ...(victim ? { target: victim } : {}),
    ...(target.note ? { note: target.note } : {}),
  });
  await bumpRevision(gameId);

  return {
    spell: spell?.name ?? held.card_id,
    effect: script?.effect ?? spell?.text ?? "",
  };
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

  // A guardian is not a card: it charges what its doorway charges rather than
  // the usual point of Życie, and winning carries the character through instead
  // of returning it to the field the fight interrupted.
  if (fight.guardian) {
    const outcome = fight.result.outcome;
    if (fight.guardian.kind === "most") {
      await settleBridge(gameId, fight.guardian.entrance, outcome);
    } else {
      await settleCrossing(gameId, fight.guardian.crossing, outcome);
    }
    await journal(gameId, seat.id, game.turn, "straznik-koniec", {
      guardian: fight.cardName,
      outcome,
      enemyTotal: fight.enemyTotal,
    });
    await bumpRevision(gameId);
    return;
  }

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
      .map(asHolding);
    // In slotowy the limit is on the pack alone — what a character is wearing
    // hangs on the character. Picking a card up always puts it in the pack, so
    // this is the pack's question either way.
    const variant = eq(game);
    if (carriedCount(mine, variant) >= carryLimit(mine, variant)) {
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

  // Taking a card lifts it off the field's stack, so what is still listed when
  // the turn ends is exactly what nobody claimed — which is what 16.8 leaves
  // lying there for the next character.
  if (game.turn_state.phase === "pole") {
    const at = game.turn_state.drawn.findIndex((entry) => entry.cardId === cardId);
    if (at !== -1) {
      const drawn = game.turn_state.drawn.filter((_, index) => index !== at);
      await db
        .from("games")
        .update({ turn_state: { ...game.turn_state, drawn } })
        .eq("id", gameId);
    }
  }
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

  // 7.3: "Żadna Postać nie może zmienić swojej Natury częściej niż raz w
  // trakcie tury gry." Magog is the exception — its own card says the Natura
  // may be changed freely, and 8.2 puts a Charakterystyka above the general
  // rule.
  const freely = seat.character_id === "magog";
  if (!freely && seat.nature_changed_turn === game.turn) {
    throw new Error("Naturę można zmienić najwyżej raz na turę (7.3).");
  }

  await db
    .from("seats")
    .update({ nature, nature_changed_turn: game.turn })
    .eq("id", seatId);

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
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  // 20.2: stone carries nothing. Przedmioty and gold are left on the field the
  // change happened on and can be picked up by whoever passes (12.1); the
  // Przyjaciele simply leave — "wszyscy Przyjaciele opuszczają Zamienionego w
  // Kamień, odłóż ich Karty na stos Kart zużytych" — and are not recoverable.
  //
  // Zaklęcia stay: 20.5 is explicit that the character keeps them and may use
  // them once it is flesh again.
  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seatId);
  const dropped = held.filter((h) => h.kind === "item");
  const friends = held.filter((h) => h.kind === "friend");

  if (held.length > 0) {
    await db
      .from("holdings")
      .delete()
      .in("id", [...dropped, ...friends].map((h) => h.id));
  }

  if (seat.field_id) {
    // Gold is left there too, and the deck already has a card that *is* one
    // Sztuka Złota — so a purse of three becomes three of them lying on the
    // field, which is exactly what 12.1 lets the next character pick up.
    const gold = Array.from({ length: seat.zloto }, () => "1-sztuka-zlota");
    const onField = [...dropped.map((h) => h.card_id), ...gold];
    if (onField.length > 0) {
      await db.from("field_cards").insert(
        onField.map((cardId) => ({
          game_id: gameId,
          field_id: seat.field_id,
          card_id: cardId,
        })),
      );
    }
  }

  await db
    .from("seats")
    .update({ stone_until_turn: game.turn + STONE_TURNS, zloto: 0 })
    .eq("id", seatId);
  await journal(gameId, seatId, game.turn, "kamien", {
    until: game.turn + STONE_TURNS,
    left: dropped.length,
    zloto: seat.zloto,
    friendsLost: friends.length,
  });
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
      .map(asHolding);
    const bonus = bonusFromHoldings(mine, eq(game));
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
 * Squares up to whatever is guarding the way through.
 *
 * The bridge entrances and the Lodowy Las all print a creature with a strength
 * and expect a normal fight, so they get one rather than a pair of buttons
 * asking the table who won. Which creature it is comes from where the character
 * is standing and what it is trying to do.
 */
export async function fightGuardian(gameId: string): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  const holdings = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const bonus = bonusFromHoldings(holdings.map(asHolding), eq(game));
  const totals = {
    miecz: seat.miecz_own + bonus.miecz,
    magia: seat.magia_own + bonus.magia,
  };

  if (game.turn_state.phase === "most") {
    const next = startGuardianFight(
      { kind: "most", entrance: game.turn_state.bridge },
      totals,
      seat.field_id,
    );
    await db.from("games").update({ turn_state: next }).eq("id", gameId);
    await journal(gameId, seat.id, game.turn, "straznik-start", {
      guardian: game.turn_state.bridge.guardian,
    });
    await bumpRevision(gameId);
    return;
  }

  const crossing = crossingFrom(seat.field_id);
  if (!crossing || crossing.test?.kind !== "walka") {
    throw new Error("Nie ma tu nikogo, z kim trzeba walczyć.");
  }
  const next = startGuardianFight({ kind: "przeprawa", crossing }, totals, seat.field_id);
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "straznik-start", {
    guardian: crossing.test.guardian,
  });
  await bumpRevision(gameId);
}

/** Throws the die that gives a bridge guardian its Miecz or Magia (5 to 10). */
export async function rollGuardianStrength(
  gameId: string,
  value: number | null,
): Promise<{ strength: number }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");
  if (!strengthPending(game.turn_state.fight)) {
    throw new Error("Siła przeciwnika jest już znana.");
  }

  const roll = value ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error("Kostka daje wynik od 1 do 6.");
  }
  const next = recordGuardianStrength(game.turn_state, roll);
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "straznik-sila", { roll }, value !== null);
  await bumpRevision(gameId);
  return {
    strength: next.phase === "walka" ? next.fight.enemyTotal : 0,
  };
}

/**
 * The ferryman at a Przeprawa.
 *
 * "Musisz przeprawić się przez rzekę płacąc przewoźnikowi 1 Sz. Z. lub wracasz
 * na Obszar, z którego rozpocząłeś ruch." Landing here is a toll, not a stop:
 * pay it and the turn goes on as normal, or the whole move is undone and the
 * character finishes the turn where it began.
 *
 * A character with no gold has no choice, which is why refusing is always
 * available and paying is not.
 */
export async function payFerry(gameId: string, pay: boolean): Promise<{ at: string }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole" || !isFerry(game.turn_state.fieldId)) {
    throw new Error("Nie stoisz na Przeprawie.");
  }
  const here = game.turn_state.fieldId;

  if (pay) {
    // The Przewoźnik among your Przyjaciele is the ferryman's colleague: "nie
    // będziesz musiał płacić 1 Sztuki Złota za Przeprawę".
    const abilities = [
      ...heldAbilities(
        inEffect(
          (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id).map(asHolding),
          eq(game),
        ).map((h) => h.cardId),
      ),
      // 8.2: a character's own powers sit alongside what it is carrying, and
      // override the general rules where they disagree.
      ...abilitiesOfCharacter(seat.character_id),
    ];
    const toll = tollIsWaived(abilities, here) ? 0 : FERRY_TOLL;
    if (seat.zloto < toll) {
      throw new Error("Nie masz czym zapłacić przewoźnikowi.");
    }
    if (toll > 0) {
      await db.from("seats").update({ zloto: seat.zloto - toll }).eq("id", seat.id);
    }
    await journal(gameId, seat.id, game.turn, "przewoznik", { field: here, paid: toll });
    await bumpRevision(gameId);
    return { at: here };
  }

  // Sent back to where the move started. The turn ends there rather than
  // resolving that field again — the character never left it in the first place.
  const back = game.turn_state.from;
  if (!back) throw new Error("Nie wiadomo, skąd zaczął się ten ruch.");
  await db.from("seats").update({ field_id: back }).eq("id", seat.id);
  await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "przewoznik-odmowa", { field: here, back });
  await bumpRevision(gameId);
  return { at: back };
}

/**
 * What a fight came to, from the character's side.
 *
 * The same three words the combat engine produces, used here so a guardian
 * settled by an actual fight and one settled by the table saying how it went
 * travel through exactly the same code.
 */
export type FightOutcome = "wygrana" | "remis" | "przegrana";

/**
 * Applies the result of a bridge guardian (11.9-11.11).
 *
 * Three outcomes, not two. 11.11 gives a draw its own consequence: "Jeżeli
 * wynik walki jest remisowy Postać nie traci punktu Magii lub Miecza, lecz
 * również nie może w następnej turze podjąć kolejnej próby wejścia na Most."
 * So a draw is cheap but not free — it costs the next turn's attempt, the same
 * as a loss does, and only a loss takes the point.
 *
 * Whichever way it goes the turn ends here: on a win at the bridge entrance
 * (11.10), otherwise back on the ring at the field the attempt was made from.
 */
async function settleBridge(
  gameId: string,
  entrance: BridgeEntrance,
  outcome: FightOutcome,
): Promise<{ at: string | null }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);

  if (outcome === "wygrana") {
    const field = FIELDS.get(entrance.entersAt);
    if (!field) throw new Error(`Nieznane pole: ${entrance.entersAt}`);
    await db.from("seats").update({ field_id: entrance.entersAt }).eq("id", seat.id);
    // 11.10: "Jeżeli próba wkroczenia na Most jest udana, tura Postaci kończy
    // się na Wejściu na Most" — the square is reached but not resolved.
    await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
    await journal(gameId, seat.id, game.turn, "wejscie-na-most", {
      from: entrance.from,
      guardian: entrance.guardian,
    });
    return { at: entrance.entersAt };
  }

  if (outcome === "przegrana") {
    const column = entrance.stat === "magia" ? "magia_own" : "miecz_own";
    const floor = entrance.stat === "magia" ? seat.magia_floor : seat.miecz_floor;
    const current = entrance.stat === "magia" ? seat.magia_own : seat.miecz_own;
    await db
      .from("seats")
      .update({ [column]: Math.max(floor, current - 1) })
      .eq("id", seat.id);
  }

  // Both a loss and a draw bar the next turn's attempt (11.11). The character
  // stays on the ring at the entrance and carries on from there.
  //
  // `turn` counts rounds, not seat-turns, so a seat gets exactly one go per
  // number — see bridgeBlockUntil for why that is turn + 2 and not turn + 1.
  await db
    .from("seats")
    .update({ bridge_blocked_until_turn: bridgeBlockUntil(game.turn) })
    .eq("id", seat.id);
  await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "most-nieudane", {
    from: entrance.from,
    guardian: entrance.guardian,
    outcome,
  });
  return { at: null };
}

/**
 * Applies the result of a crossing between rings (11.4, 11.8).
 *
 * Failure costs a point of Życie and stops the journey. A draw costs nothing
 * but still stops it. Either way the character stays put and may try again next
 * turn, which 11.4 says is exactly what the next turn is for.
 */
async function settleCrossing(
  gameId: string,
  crossing: NonNullable<ReturnType<typeof crossingFrom>>,
  outcome: FightOutcome,
  extra: Record<string, unknown> = {},
): Promise<{ to: string | null }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);

  if (outcome !== "wygrana") {
    if (outcome === "przegrana") {
      const left = Math.max(0, seat.zycie - 1);
      await db.from("seats").update({ zycie: left }).eq("id", seat.id);
      if (left === 0) await killSeat(gameId, seat.id);
    }
    // The turn state is left where it was: still standing on the crossing field,
    // free to try again next turn.
    await journal(gameId, seat.id, game.turn, "przeprawa-nieudana", {
      from: crossing.from,
      obstacle: crossing.obstacle,
      outcome,
      ...extra,
    });
    return { to: null };
  }

  const field = FIELDS.get(crossing.to);
  if (!field) throw new Error(`Nieznane pole: ${crossing.to}`);
  await db.from("seats").update({ field_id: crossing.to }).eq("id", seat.id);
  await db
    .from("games")
    .update({ turn_state: afterMove(field, crossing.from) })
    .eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "przeprawa", {
    from: crossing.from,
    to: crossing.to,
    obstacle: crossing.obstacle,
    ...extra,
  });
  return { to: crossing.to };
}

/**
 * The table reporting how a bridge guardian went, where it is not being fought
 * through the app — companion mode with the creature resolved on the table.
 */
export type BridgeOutcome = "wygrana" | "remis" | "porazka";

export async function enterBridge(
  gameId: string,
  outcome: BridgeOutcome,
): Promise<{ at: string | null }> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "most") {
    throw new Error("Nie ma teraz próby wejścia na Most.");
  }
  const at = await settleBridge(
    gameId,
    game.turn_state.bridge,
    outcome === "porazka" ? "przegrana" : outcome,
  );
  await bumpRevision(gameId);
  return at;
}

/**
 * Crosses between rings (11.1-11.8).
 *
 * Only two places on the whole board allow it, only one direction of each is
 * defended, and the two obstacles are different in kind. The Trzęsawiska are a
 * threshold — two dice against the character's Magia — so the app settles them
 * outright. The Lodowy Las is a fight with the Rycerz Wiecznych Śniegów, which
 * normally goes through `fightGuardian` and the combat engine; this route is
 * what remains for a table resolving that fight themselves.
 */
export type CrossOutcome = "udana" | "remis" | "nieudana";

export async function crossRing(
  gameId: string,
  input: { outcome?: CrossOutcome; dice?: number[] | null } = {},
): Promise<{ to: string | null; outcome: CrossOutcome; dice?: number[]; magia?: number }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  const crossing = crossingFrom(seat.field_id);
  if (!crossing) {
    throw new Error("Z tego Obszaru nie można przejść do innego Kręgu (11.1, 11.5).");
  }

  let outcome: CrossOutcome = "udana";
  let dice: number[] | undefined;
  let magia: number | undefined;

  if (crossing.test?.kind === "magia") {
    // The app owns this one: it is a threshold against a number it already
    // knows, so there is nothing for a player to adjudicate. A physical die
    // still overrides, which is what die_source is for.
    const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
    const abilities = [
      ...heldAbilities(inEffect(held.map(asHolding), eq(game)).map((h) => h.cardId)),
      ...abilitiesOfCharacter(seat.character_id),
    ];
    // Rusałka's friendship is exactly this: one die at the Trzęsawiska instead
    // of two, which is the difference between a hard crossing and a likely one.
    const count = crossingDice(abilities, crossing.obstacle, crossing.test.dice);
    const rolled =
      input.dice && input.dice.length === count
        ? input.dice
        : Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
    for (const die of rolled) {
      if (!Number.isInteger(die) || die < 1 || die > 6) {
        throw new Error("Kostka daje wynik od 1 do 6.");
      }
    }
    const bonus = bonusFromHoldings(held.map(asHolding), eq(game));
    magia = seat.magia_own + bonus.magia;
    dice = rolled;
    outcome = trzesawiskaOutcome(rolled, magia);
  } else if (crossing.test) {
    outcome = input.outcome ?? "udana";
  }

  const extra = dice ? { dice, magia } : {};
  const { to } = await settleCrossing(
    gameId,
    crossing,
    outcome === "udana" ? "wygrana" : outcome === "remis" ? "remis" : "przegrana",
    extra,
  );
  await bumpRevision(gameId);
  return { to, outcome, ...extra };
}

/**
 * Declines a fight (17.2, 19).
 *
 * Rule 17.2 makes fleeing a decision taken BEFORE any dice, and 19.1 says
 * whether it works depends on the character's own special abilities or the
 * Krąg Płomieni spell — which are prose on the character card, not a die roll
 * the app can adjudicate. So this records the attempt and its outcome as the
 * players judge it, rather than inventing a mechanic the rulebook does not have.
 *
 * Rule 19.3 is the one hard limit: on the Kamienny Most you may only escape
 * other characters, never the creatures guarding it.
 */
export async function escape(gameId: string, succeeded: boolean): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);

  if (game.turn_state.phase !== "walka" && game.turn_state.phase !== "pole") {
    throw new Error("Nie ma przed czym uciekać.");
  }

  const onBridge = ringOf(seat.field_id ?? "") === KAMIENNY_MOST;
  const fleeingACard =
    game.turn_state.phase === "walka" && game.turn_state.fight.opponentSeat === undefined;
  if (onBridge && fleeingACard) {
    throw new Error("Na Kamiennym Moście można wymknąć się tylko innym Postaciom (19.3).");
  }

  if (succeeded && game.turn_state.phase === "walka") {
    // 19.1: having escaped, the character can no longer act on what it fled,
    // so the fight simply ends and the field resumes.
    await db.from("games").update({ turn_state: endFight(game.turn_state) }).eq("id", gameId);
  }
  await journal(gameId, seat.id, game.turn, succeeded ? "ucieczka" : "ucieczka-nieudana", {
    onBridge,
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
    .map(asHolding);
  const bonus = bonusFromHoldings(holdings, eq(game));

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

  // Whatever was drawn or found here and not taken stays on the field (16.8).
  if (game.turn_state.phase === "pole" && game.turn_state.drawn.length > 0) {
    await leaveCardsBehind(gameId, game.turn_state.fieldId, game.turn_state.drawn);
  }

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

/**
 * Puts a Przedmiot on, or takes it off.
 *
 * Only in the slotted variant — in klasyczny play there is nowhere to put
 * anything, because the rulebook has one kind of possession and one limit
 * (5.4). A table playing by the book must not find its cards quietly acquiring
 * positions on a body the rules do not have.
 *
 * `slot` of null takes the card off and puts it back in the pack. Anything
 * already in the place being filled comes off in the same breath, which is what
 * a player means by putting on a different sword.
 */
export async function equipCard(
  gameId: string,
  holdingId: string,
  slot: Slot | null,
): Promise<void> {
  const game = await loadGame(gameId);
  if (game.eq_mode !== "slotowy") {
    throw new Error("Ten stół gra klasycznym ekwipunkiem — nie ma miejsc na przedmioty.");
  }

  const holdings = await holdingsFor(gameId);
  const held = holdings.find((h) => h.id === holdingId);
  if (!held) throw new Error("Nie ma takiej karty.");
  if (held.kind !== "item") throw new Error("Zakładać można tylko Przedmioty.");

  if (slot === null) {
    // Taking something off puts it in the pack, and the pack is still the four
    // of 5.4. A character with four things already carried has nowhere to put
    // its helmet, and the rulebook's answer to being over the limit is to drop
    // something (5.6) — so it says so rather than quietly making a fifth place.
    const mine = holdings.filter((h) => h.seat_id === held.seat_id).map(asHolding);
    if (carriedCount(mine, "slotowy") >= carryLimit(mine, "slotowy")) {
      throw new Error("Plecak jest pełny — najpierw coś odrzuć (5.4, 5.6).");
    }
    await db.from("holdings").update({ slot: null }).eq("id", holdingId);
    await bumpRevision(gameId);
    return;
  }

  if (!fitsIn(held.card_id, slot)) {
    // Two different refusals wearing one sentence. "It does not go there" is
    // useful when there is somewhere it does go; when there is nowhere at all,
    // it reads as a puzzle about which place to try next.
    const name = cardName(held.card_id);
    throw new Error(
      isWearable(held.card_id)
        ? `${name} nie pasuje w to miejsce (${SLOT_LABEL[slot]}).`
        : `${name} to nie jest rzecz do noszenia — zostaje w plecaku.`,
    );
  }

  // One thing per place, and the thing already there goes back in the pack
  // rather than vanishing. Only this seat's — everybody else's Miecz stays on.
  const occupant = holdings.find(
    (h) => h.seat_id === held.seat_id && h.slot === slot && h.id !== holdingId,
  );
  if (occupant) {
    await db.from("holdings").update({ slot: null }).eq("id", occupant.id);
  }
  await db.from("holdings").update({ slot }).eq("id", holdingId);
  await bumpRevision(gameId);
}
