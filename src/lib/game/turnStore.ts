/** Applies turn actions against the database, journalling each one so a wrong call at the table can be seen and undone. */

import { randomInt } from "node:crypto";
import { db } from "@/lib/supabase";
import {
  GAME_COLUMNS,
  chooseCharacter,
  fieldCardsFor,
  resolveRandomPicks,
  type HoldingRow,
} from "./store";
import {
  FERRY_TOLL,
  FIELDS,
  requireFieldId,
  type FieldId,
  KAMIENNY_MOST,
  type BridgeEntrance,
  isFerry,
  ringOf,
} from "@/lib/engine/board";
import { crossingFrom, trzesawiskaOutcome } from "@/lib/engine/rings";
import {
  bestShield,
  canEscapeAt,
  crossingDice,
  heldAbilities,
  tollIsWaived,
  type EscapeTarget,
} from "@/lib/engine/abilities";
import { castableNow, spellScript, type SpellScript } from "@/lib/engine/spells";
import { seatsTargeted, type TargetSeat } from "@/lib/engine/targets";
import { chooseLosses, describeLoss, goldLost } from "@/lib/engine/losses";
import {
  BRIDGE_GUARDIAN,
  BRIDGE_ORDEAL,
  BRIDGE_SIDE,
  cerberLoss,
  deathGameOutcome,
  guardianStrength,
  keptAfterFall,
  rollDice,
  trapOutcome,
} from "@/lib/engine/bridge";
import {
  abilitiesOfCharacter,
  asCharacterId,
  isRandomPick,
  startingKit,
} from "@/lib/engine/characters";
import type { SpellId } from "@/data/ids";
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
  type SpellFloor,
} from "@/lib/engine/turn";
import events from "@/data/events.json";
import items from "@/data/items.json";
import charactersData from "@/data/characters.json";
import type { CardClass, Character, EventCard, Item, Nature } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { helpLines, type Command } from "@/lib/engine/console";
import { findByName } from "@/lib/engine/search";
import { combinedEnemyTotal } from "@/lib/engine/combat";
import { PRINTED_STOCK, fromTheShop, stockLeft } from "@/lib/engine/stock";
import { isConsumedOnResolve, scriptFor, type Effect } from "@/lib/engine/cardScript";
import { usageOf } from "@/lib/engine/uses";
import { forbiddenNatures } from "@/lib/engine/abilityText";
import {
  afterFight,
  afterTurn,
  type Ends,
  type Modifier,
  type Status,
} from "@/lib/engine/status";
import { describeEffect } from "@/lib/engine/effectText";
import { fieldScriptFor, offerKey } from "@/lib/engine/fieldScript";
import { isSettled } from "@/lib/engine/resolve";
import { goodsId } from "@/lib/engine/goods";
import type { TurnCard } from "@/lib/engine/state";
import { beastCombatKind, beastStrength, compareCombat } from "@/lib/engine/combat";
import { kindForCard } from "@/lib/engine/holdings";
import {
  buildDeck,
  cardRef,
  discardTo,
  returningRef,
  drawFrom,
  shuffleWith,
  type DeckState,
} from "@/lib/engine/deck";

const EVENTS = events as EventCard[];
const CHARACTERS = charactersData as Character[];

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
 * The one Zaklęcie the rules name inside another rule.
 *
 * 19.1 does not say "a spell that lets you escape" — it says the Krąg Płomieni,
 * by name, and it is the only way in the game to slip away from another Postać.
 * So it is looked up here rather than left to the generic casting path, which
 * has nowhere to put a mechanical effect.
 */
const KRAG_PLOMIENI: SpellId = "krag-plomieni";

/**
 * How many Zaklęcia a character was dealt at setup (9.5).
 *
 * The Różdżka Zaklęć is measured against this rather than against 2.6's table,
 * so the limit cannot be worked out from Magia alone — see `spellAllowance`.
 * A stored `character_id` is narrowed on the way in, and an unseated seat has
 * no starting hand.
 */
const ROZDZKA_ZAKLEC = "rozdzka-zaklec";

/**
 * Every copy of every card, by id — the lookup a discard needs.
 *
 * Drawing knows the ref and forgets it: a `holdings` row and a `field_cards`
 * row both store an id, because a player holds "the Magiczny Miecz", not
 * "zdarzenia-4#11". Returning one to the used pile has to name a copy again,
 * and `returningRef` picks whichever copy the piles are not already counting.
 */
const EVENT_COPIES = new Map<string, string[]>();
for (const card of EVENTS) {
  const list = EVENT_COPIES.get(card.id) ?? [];
  list.push(cardRef(card.source));
  EVENT_COPIES.set(card.id, list);
}
const SPELL_COPIES = new Map<string, string[]>();
for (const card of SPELLS) {
  const list = SPELL_COPIES.get(card.id) ?? [];
  list.push(cardRef(card.source));
  SPELL_COPIES.set(card.id, list);
}

/**
 * Puts cards on the used pile — "stos zużytych Kart Zdarzeń", and the spells'
 * own (9.5, 9.6, 4.4, 1.4, 6.4, 16.6, 20.2).
 *
 * One door for all of it, because the rulebook keeps sending cards through it
 * from seven different chapters and every one of those used to end in a bare
 * `delete`. A card that is deleted has not been "odłożona na stos zużytych" —
 * it has left the game, and 9.5 can never bring it back.
 *
 * Simulation only: at a physical table the pile is a pile.
 *
 * An id with no copies is not an error. The Wyposażenie is a stock and not a
 * deck (21.2), so a Hełm handed back has nowhere here to go and is counted by
 * `shopStock` instead.
 */
/** A row from either table, as the thing that has to be put away. */
function asReturnable(row: { card_id: string; granted: boolean }): Returnable {
  return { cardId: row.card_id, granted: row.granted };
}

/** What a card needs to say about itself to be put away. */
interface Returnable {
  cardId: string;
  /** Conjured by a test: it belongs to no pile and joins none. */
  granted?: boolean;
}

async function returnToPile(
  gameId: string,
  pile: "events" | "spells",
  cards: readonly Returnable[],
): Promise<void> {
  // 21.2: the Wyposażenie is a stock, not a deck. "Kart Przedmiotów zakupionych
  // nie należy jednak odrzucać (umieszcza się je powtórnie w stosie Kart
  // zakupów) ponieważ możliwe jest ponowne dokonanie ich zakupu." A Hełm that
  // leaves a hand goes back to the pile it can be bought from again, and
  // `stockLeft` puts it there by arithmetic the moment it stops being in play —
  // so there is nothing to do here but stay out of the way.
  //
  // This is why it needs saying at all: eleven of the twelve Wyposażenie cards
  // are *also* in the event deck. Pushing a sold Hełm onto the used pile would
  // hand the deck a thirteenth Hełm and the shop its own back at once.
  //
  // A granted card is kept out for the opposite reason: the deck never gave it
  // up, so it has nothing to give back. Putting one on the pile is how a table
  // ends up with two Cyklopy — the conjured one on the used pile and the real
  // one still waiting in the draw.
  const real = cards.filter((card) => !card.granted).map((card) => card.cardId);
  await pushToPile(
    gameId,
    pile,
    pile === "events" ? real.filter((cardId) => !fromTheShop(cardId)) : real,
  );
}

/**
 * The drawn copy, once its Wyposażenie card has taken its place (16.6, 21.1).
 *
 * The one case that runs the other way: this card *did* come off the deck, so
 * the deck is exactly where it goes. 16.6 says it outright for the two relics —
 * "musi je zamienić na identyczne z Wyposażenia, a wyciągnięte odłożyć na stos
 * zużytych" — and 21.1 extends the same exchange to every card in the chapter,
 * which is what makes `stockLeft` count copies in play rather than keeping a
 * tally.
 */
async function discardDrawnCopy(gameId: string, cardId: string): Promise<void> {
  await pushToPile(gameId, "events", [cardId]);
}

async function pushToPile(
  gameId: string,
  pile: "events" | "spells",
  cardIds: readonly string[],
): Promise<void> {
  if (cardIds.length === 0) return;
  const game = await loadGame(gameId);
  if (game.mode !== "simulation") return;

  const copies = pile === "events" ? EVENT_COPIES : SPELL_COPIES;
  const decks = decksOf(game);
  let deck = decks[pile];
  const returned: string[] = [];
  for (const cardId of cardIds) {
    const mine = copies.get(cardId);
    if (!mine) continue;
    const ref = returningRef(deck, mine);
    if (!ref) continue;
    returned.push(ref);
    // Folded in as we go, so two copies of the same card in one call take two
    // different refs rather than both taking the first free one.
    deck = discardTo(deck, [ref]);
  }
  if (returned.length === 0) return;
  await db
    .from("games")
    .update({ deck: { ...decks, [pile]: deck } })
    .eq("id", gameId);
}

function spellsAtSetup(characterId: string | null): number {
  return startingKit(asCharacterId(characterId)).spells ?? 0;
}

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
import type { CombatKind } from "@/lib/engine/combat";
import { BASE_CARRY_LIMIT, carriedCount, carryLimit } from "@/lib/engine/derive";
import { HEAL_CEILING, heal, mayHold, spellAllowance } from "@/lib/engine/derive";
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
    // Zaklęcia are cards too, and are named on the one occasion the app says
    // so out loud: 12.5 has a cast spoken, and the console reports a draw.
    SPELL_BY_ID.get(cardId)?.name ??
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
  // Everybody who asked to be surprised finds out now, and not a moment
  // earlier — the sentinel sits in the seat for the whole poczekalnia so that
  // no device, the player's included, can see what is coming.
  await resolveRandomPicks(gameId);

  const seats = await seatsFor(gameId);
  // `chosen`, not `ready`: having picked a character and having said you are
  // ready are two different things, and conflating them is what let a game
  // start while somebody was still deciding.
  const chosen = seats.filter((seat) => seat.character_id);
  // One is enough. The box says 2-6 and the rulebook never states a count at
  // all: the only rule that assumes company is 17.4, where "jeden z pozostałych
  // graczy" throws the enemy's die — and in a simulation the app throws it. The
  // victory condition is beating the Bestia, which one character can do alone.
  // The race against other players is what makes it tense, not what makes it
  // possible, and it is also what a table is left with when everybody else has
  // died.
  if (chosen.length < 1) throw new Error("Do gry potrzeba przynajmniej jednej postaci.");

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
  const kit = startingKit(asCharacterId(seat.character_id));

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
  destination: string,
  viaBridge = false,
): Promise<void> {
  // Straight off the request body, so it is checked before it is a field.
  const fieldId = requireFieldId(destination, "Ruch");
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
  seatId: string | null,
  turn: number,
): Promise<void> {
  const spentByReading = (card: TurnCard) =>
    CONSUMED_BY_READING.has(card.cardClass) &&
    scriptFor(card.cardId)?.disposition.kind === "odloz";
  const stays = remaining.filter((card) => !spentByReading(card));

  // The other half of the same sentence, and the half that used to go nowhere:
  // a Karta whose own text says "odłóż" is not left on the Obszar (16.8) and is
  // not destroyed either — it joins the stos zużytych, which is what 9.5 draws
  // on when the deck runs dry. Without this every Spotkanie in the game left it
  // for good, and the 165 Karty Zdarzeń drained instead of cycling.
  await returnToPile(
    gameId,
    "events",
    // Straight off the deck this turn, so never a granted one.
    remaining.filter(spentByReading).map((card) => ({ cardId: card.cardId })),
  );

  if (stays.length === 0) return;
  await db.from("field_cards").insert(
    stays.map((card) => ({ game_id: gameId, field_id: fieldId, card_id: card.cardId })),
  );
  // 16.8 leaves them lying face up, so what was left and where is something the
  // whole table can see — and therefore something the journal owes it. Without
  // this a card simply appeared on a field with nothing saying how it got
  // there, which is the sort of thing players argue about two turns later.
  await journal(gameId, seatId, turn, "zostawienie", {
    fieldId,
    cardIds: stays.map((card) => card.cardId),
  });
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
  if (recycled) await journal(gameId, null, game.turn, "przetasowanie", { pile: "zdarzenia" });
  await journal(gameId, seat.id, game.turn, "karta", {
    cardId: card.id,
    ref: drawn[0],
    source: "talia",
    recycled,
  });
  await bumpRevision(gameId);
  return { card, recycled };
}

/**
 * Deals a spell to a seat, if its Magia allows one more (2.6, 9.2).
 *
 * The capacity check is the rule that actually bites: a character with Magia 1
 * may hold no spells at all, and one that gains a spell it cannot hold must
 * shed the excess immediately (9.4).
 */
/**
 * The Różdżka Zaklęć's other half: a hand that refills itself (9.5).
 *
 * `spellAllowance` carries the card's first clause — how many you may hold.
 * This is the second, and for most of the roster it is the only one that does
 * anything: "może wziąć nowe Zaklęcie, gdy ma tyle Zaklęć, ile na początku gry
 * lub mniej." A Zaklęcie is not otherwise something you may simply take —
 * 9.5 has them arrive from Spotkania and Obszary — so a raised ceiling alone
 * leaves the wand inert for a Książę, who could already hold two and had no
 * way to reach them. The rulebook's own worked example is exactly this: he
 * picks the wand up, draws at once, casts the Ocalony, and *"ponieważ ma
 * Różdżkę, natychmiast bierze następne Zaklęcie."*
 *
 * Repeatable, because the card is: it is spent by nothing and says "gdy",
 * not "raz". What bounds it is the setup hand — cast down to it, refill, and
 * that is as often as the wand can be asked.
 */
export async function drawSpellWithWand(gameId: string, seatId: string): Promise<string> {
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const mine = (await holdingsFor(gameId))
    .filter((h) => h.seat_id === seatId)
    .map(asHolding);
  const hasWand = mine.some((h) => h.kind !== "trophy" && h.cardId === ROZDZKA_ZAKLEC);
  if (!hasWand) throw new Error("Ta Postać nie ma Różdżki Zaklęć.");

  const setup = spellsAtSetup(seat.character_id);
  const held = mine.filter((h) => h.kind === "spell").length;
  if (held > setup) {
    throw new Error(
      setup === 0
        ? "Różdżka daje nowe Zaklęcie dopiero, gdy nie masz żadnego."
        : `Różdżka daje nowe Zaklęcie dopiero, gdy masz najwyżej ${setup} (tyle, co na początku gry).`,
    );
  }

  // Everything else — the deck, the empty-stack case, the face-down hand of
  // 9.3, the journal line — is the same draw as any other, so it is the same
  // code. `spellAllowance` has already made room for this one by definition:
  // being at or below the setup hand is being below the floor the wand sets.
  return drawSpell(gameId, seatId);
}

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
  const bonus = bonusFromHoldings(mine, eq(game), "parametr");
  const capacity = spellAllowance(
    seat.magia_own + bonus.magia,
    spellsAtSetup(seat.character_id),
    // "Właściciel Różdżki" — owning it is the whole condition, so the pack
    // counts as much as the body does, in either eq variant.
    heldAbilities(mine.filter((h) => h.kind !== "trophy").map((h) => h.cardId)),
  );

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
  const { deck: after, drawn, recycled } = drawFrom(decks.spells, 1, shuffle);
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
  // 9.5 in as many words: "Jeśli stos zostanie wyczerpany, tasuje się Karty
  // Zaklęć już użyte i korzysta z nich ponownie." At a table that is the
  // loudest thing that happens all evening, and it was happening in silence.
  if (recycled) await journal(gameId, null, game.turn, "przetasowanie", { pile: "zaklecia" });
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
/**
 * How many copies of a card are anywhere in the game — held by anybody, or
 * lying face up on a field where somebody left it (12.1, 16.8).
 *
 * This is the denominator for 21.2: every copy in play is one that is not on
 * the pile to be bought.
 */
async function copiesInPlay(gameId: string, cardId: string): Promise<number> {
  const held = (await holdingsFor(gameId)).filter((h) => h.card_id === cardId).length;
  const onFields = (await fieldCardsFor(gameId)).filter((c) => c.card_id === cardId).length;
  return held + onFields;
}

/**
 * What the Wyposażenie pile still has, for every card on it.
 *
 * Sent with the table state so a shop can show what it has rather than offering
 * something that will be refused.
 */
export async function shopStock(
  gameId: string,
  // Both lists are usually already in hand at the call site — the table state
  // reads them anyway — and fetching them a second time is two more round
  // trips on a request every device makes every couple of seconds.
  known?: { holdings: HoldingRow[]; fieldCards: { card_id: string }[] },
): Promise<Record<string, number>> {
  const held = known?.holdings ?? (await holdingsFor(gameId));
  const onFields = known?.fieldCards ?? (await fieldCardsFor(gameId));
  const stock: Record<string, number> = {};
  for (const cardId of Object.keys(PRINTED_STOCK)) {
    const inPlay =
      held.filter((h) => h.card_id === cardId).length +
      onFields.filter((c) => c.card_id === cardId).length;
    stock[cardId] = stockLeft(cardId, inPlay);
  }
  return stock;
}

/**
 * Which seats hold a Zaklęcie that 17.3 or 17.7 lets them speak before the
 * dice.
 *
 * Built from what people are actually holding rather than from who is at the
 * table, so a fight where nobody has a spell to cast never stops for one. That
 * is the difference between a rule being enforced and a rule being in the way:
 * most fights in this game involve no spells at all.
 */
/**
 * How long a claim on the moment before the dice lasts.
 *
 * Thirty seconds is a house rule — the rulebook has no clock anywhere, only
 * "before the roll" (17.3) — and it exists to stop a fight hanging on somebody
 * who has gone to make tea. It is not meant to be a test of reflexes: the race
 * is the *claim*, which is one button, and the time after it is for reading a
 * hand of three and picking one, with the whole table waiting.
 */
const FLOOR_MS = 30_000;

/** The claim on this fight, or null when nobody holds it or the last one lapsed. */
function floorOf(fight: { caster?: SpellFloor | null }, now = Date.now()): SpellFloor | null {
  const floor = fight.caster ?? null;
  return floor && floor.until > now ? floor : null;
}

/**
 * Claims the moment before the dice (17.3, 17.7, 9.1).
 *
 * Anybody may ask, including the player whose fight it is — thirteen of the
 * twenty-seven Zaklęcia say "w dowolnej chwili", so a bystander speaking into
 * someone else's fight is ordinary. Only one at a time: the floor is exclusive,
 * and while it is held nobody else may claim it and the dice do not move.
 *
 * Refused for a seat with nothing to say, which is the honest half of 9.3 —
 * the button can be offered to everybody without telling anybody anything,
 * because it is pressing it that reveals you were holding something.
 */
export async function claimSpellFloor(gameId: string, seatId: string): Promise<void> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  if (seat.eliminated) throw new Error("Zmarła Postać nie rzuca Zaklęć (4.4).");

  const held = floorOf(game.turn_state.fight);
  if (held && held.seat !== seat.seat_index) {
    const who = seats.find((s) => s.seat_index === held.seat);
    throw new Error(`${who?.player_name ?? "Ktoś inny"} właśnie rzuca Zaklęcie — poczekaj.`);
  }

  // 17.4 ends the fight at the dice, so there is nothing left to react to.
  if (game.turn_state.fight.result) throw new Error("Walka jest już rozstrzygnięta.");

  const hand = (await holdingsFor(gameId)).filter(
    (h) => h.seat_id === seat.id && h.kind === "spell",
  );
  const canCast = hand.some((card) => {
    const script = spellScript(card.card_id);
    return script ? castableNow(script, ["przed-walka", "w-walce", "dowolna-chwila"]) : false;
  });
  if (!canCast) throw new Error("Nie masz Zaklęcia, które można teraz rzucić.");

  await db
    .from("games")
    .update({
      turn_state: {
        ...game.turn_state,
        fight: {
          ...game.turn_state.fight,
          caster: { seat: seat.seat_index, until: Date.now() + FLOOR_MS },
        },
      },
    })
    .eq("id", gameId);
  await bumpRevision(gameId);
}

/**
 * Gives the floor back without using it.
 *
 * Reaching for a card and thinking better of it is a move somebody makes at a
 * table, and holding everybody up for the rest of the half-minute after
 * deciding is not.
 */
export async function releaseSpellFloor(gameId: string, seatId: string): Promise<void> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "walka") return;
  const seat = (await seatsFor(gameId)).find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  const held = floorOf(game.turn_state.fight);
  if (held && held.seat !== seat.seat_index) return;

  await db
    .from("games")
    .update({
      turn_state: {
        ...game.turn_state,
        fight: { ...game.turn_state.fight, caster: null },
      },
    })
    .eq("id", gameId);
  await bumpRevision(gameId);
}

export async function beginFight(gameId: string, cardIds: string[]): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na walkę.");
  if (cardIds.length === 0) throw new Error("Nie ma z kim walczyć.");

  // 17.4 ends the fight when the dice are compared, whatever the result. A card
  // already rolled against this turn is settled — beaten and waiting to be
  // taken, or standing and to be walked away from — and rolling again would let
  // a character grind the same Smok until it got a six.
  const settled = game.turn_state.fought ?? [];
  const again = cardIds.find((cardId) => settled.includes(cardId));
  if (again) {
    const card = EVENTS.find((c) => c.id === again);
    throw new Error(`Walka z ${card?.name ?? again} już się w tej turze odbyła (17.4).`);
  }

  const foes = cardIds.map((cardId) => {
    const card = EVENTS.find((c) => c.id === cardId);
    if (!card) throw new Error(`Nieznana karta: ${cardId}`);
    // Only a Wróg fights. The Miecz on Excalibur and the Magia on Pierścień
    // Mocy are bonuses to their holder (1.5, 2.5), not creatures to be rolled
    // against.
    const foe = combatValueOf(card);
    if (!foe) throw new Error(`${card.name} nie jest Wrogiem.`);
    return { card, foe };
  });

  // 17.5: several creatures attacking at once are one opponent — "Miecze tych
  // istot są sumowane, a do uzyskanego rezultatu dodawany jest wynik rzutu
  // kostką". One roll for the lot of them, not one each, which is the
  // difference between hard and hopeless.
  const kinds = new Set(foes.map((f) => f.foe.kind));
  if (kinds.size > 1) {
    throw new Error("Zwykli i magiczni Wrogowie nie atakują razem — rozpatrzcie osobno.");
  }
  const kind = foes[0].foe.kind;
  const total = combinedEnemyTotal(foes.map((f) => ({ total: f.foe.total })));

  // The character brings everything it has (1.5, 17.4), not just its own
  // tokens: a Miecz card adds its point in the fight it was found for. This
  // used to start from `miecz_own` alone, so every item a character was
  // carrying quietly failed to show up at the moment it mattered.
  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const bonus = bonusFromHoldings(held.map(asHolding), eq(game), "walka");

  const next = startFight(
    game.turn_state,
    {
      cardId: foes.map((f) => f.card.id).join("+"),
      cardName: foes.map((f) => f.card.name).join(" + "),
      settles: foes.map((f) => f.card.id),
      // Carried through from the stack: a fight staged by a test is one the
      // deck never dealt, and the sheet says so over the card's own picture.
      ...(game.turn_state.drawn.some(
        (entry) => cardIds.includes(entry.cardId) && entry.granted,
      )
        ? { granted: true }
        : {}),
      ...(kind === "magiczna" ? { magia: total } : { miecz: total }),
    },
    { miecz: seat.miecz_own + bonus.miecz, magia: seat.magia_own + bonus.magia },
  );
  // Nobody is polled and nobody is named: the floor starts empty and is
  // claimed by whoever wants it (see `claimSpellFloor`).
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-start", {
    cardIds,
    enemyTotal: total,
    together: cardIds.length > 1,
  });
  await bumpRevision(gameId);
}

/**
 * Picks a fight with a chosen creature, for testing.
 *
 * DEVELOPMENT ONLY — reached through the debug route, which a deployed build
 * refuses outright. Getting to a particular Wróg legitimately means walking the
 * board until the deck hands it to you, and the deck has a hundred and
 * forty-five other cards in it.
 *
 * It stages the situation and then leaves: the character is put on its own
 * field with the creature in front of it, and `beginFight` does the rest —
 * 17.5's combining, the Miecz a character brings with it, 17.3's window. A
 * shortcut that fought the creature *itself* would be a second implementation
 * of combat, tested by nobody, quietly disagreeing with the one the game uses.
 *
 * Only on your own turn, because a fight is a turn's worth of events and the
 * player whose turn it is would find one happening around them.
 */
export async function stageFight(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  if (seat.seat_index !== game.active_seat) throw new Error("To nie twoja tura.");
  if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");

  const card = EVENTS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Nieznana karta: ${cardId}`);
  if (!combatValueOf(card)) throw new Error(`${card.name} nie jest Wrogiem.`);

  // The field as it would be if the card had just been drawn there, minus the
  // draw: nothing is taken out of the deck, so a staged fight does not thin it.
  await db
    .from("games")
    .update({
      turn_state: {
        phase: "pole",
        fieldId: seat.field_id,
        from: null,
        draw: 0,
        // Marked, because it was not drawn: `stageFight` reaches past the deck
        // and the deck still holds this Wilkołak. Everything that draws the
        // card from here on says so.
        drawn: [{ cardId: card.id, cardClass: card.cardClass, granted: true }],
        fought: [],
      },
    })
    .eq("id", gameId);
  await bumpRevision(gameId);
  await beginFight(gameId, [card.id]);
}

/**
 * Walks out of a fight, for testing.
 *
 * DEVELOPMENT ONLY — reached through the debug route, which a deployed build
 * refuses outright.
 *
 * The counterpart to `stageFight`, and needed for the same reason. Staging a
 * fight to look at one thing leaves you holding the rest of it: the dice, the
 * verdict, the point of Życie. And a fight is the one phase with no way back —
 * 17.4 ends it when the dice are compared, and 19.1 will not let you leave
 * without an ability that says so, which is exactly the rule being tested.
 *
 * So this is not an escape and does not pretend to be one. Nothing is applied,
 * nothing is spent, no rule is consulted, and the journal says a fight was
 * broken off rather than fled — because a row that read like 19.1 would make
 * the test hatch indistinguishable from the thing it exists to test.
 */
export async function abandonFight(gameId: string): Promise<void> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");

  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.seat_index === game.active_seat);
  const { cardName } = game.turn_state.fight;

  // `endFight` puts the character back on its field with the fight's creatures
  // already in `fought` — startFight settles them the moment it opens — so the
  // field resumes with nothing outstanding rather than offering the same
  // creature again the moment the modal closes.
  await db.from("games").update({ turn_state: endFight(game.turn_state) }).eq("id", gameId);
  if (seat) {
    await journal(gameId, seat.id, game.turn, "test-koniec-walki", { cardName }, true);
  }
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
 * Two spells are applied rather than announced, and `SpellScript.applies` says
 * which and why: both take *cards* out of play, and where a card goes when it
 * leaves is the one thing at this table only the app knows. Announcing those
 * and stepping back means the cards never reach the used pile, and 9.5 refills
 * the deck from that pile.
 *
 * 9.7 is the one hard prohibition and is enforced: nothing works on the
 * creatures of the Kamienny Most, nor on the Bestia.
 */
/**
 * The two spells the app carries out rather than reads aloud.
 *
 * Returns what it took, for the journal — a spell that says "wszystkie" needs
 * to say how many that turned out to be, or the table cannot check it.
 */
async function applySpell(
  gameId: string,
  applies: NonNullable<SpellScript["applies"]>,
  target: { seatIndex?: number; fieldCardId?: string },
): Promise<string[]> {
  if (applies === "gasi-zaklecia") {
    if (target.seatIndex === undefined) throw new Error("Wskaż Postać (9.6).");
    const seats = await seatsFor(gameId);
    const victim = seats.find((s) => s.seat_index === target.seatIndex);
    if (!victim) throw new Error("Nie ma takiej Postaci.");

    // The whole hand, "unicestwienie wszystkich posiadanych przez ofiarę
    // Zaklęć" — and then, in the card's own next breath, "należy odłożyć ich
    // Karty", which is why this is applied at all.
    const hand = (await holdingsFor(gameId)).filter(
      (h) => h.seat_id === victim.id && h.kind === "spell",
    );
    if (hand.length === 0) return [];
    await db
      .from("holdings")
      .delete()
      .in("id", hand.map((h) => h.id));
    await returnToPile(gameId, "spells", hand.map(asReturnable));
    return hand.map((h) => h.card_id);
  }

  // "zdjąć z planszy jedną odkrytą Kartę Zdarzeń." Off the board is not out of
  // the game: 16.8 put it there face up and the used pile is the only other
  // place a Karta Zdarzeń has to be.
  if (target.fieldCardId === undefined) throw new Error("Wskaż Kartę na planszy.");
  const lying = (await fieldCardsFor(gameId)).find((row) => row.id === target.fieldCardId);
  if (!lying) throw new Error("Tej Karty już tam nie ma.");
  await db.from("field_cards").delete().eq("id", lying.id);
  await returnToPile(gameId, "events", [asReturnable(lying)]);
  return [lying.card_id];
}

export async function castSpell(
  gameId: string,
  seatId: string,
  holdingId: string,
  target: { seatIndex?: number; note?: string; fieldCardId?: string } = {},
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

  /**
   * In a fight, the floor is asked for first and then spoken into.
   *
   * Two things fall out of that. Nobody speaks over anybody — the claim is
   * exclusive, so a spell cannot land while somebody else is choosing one — and
   * there is no need to guess who might want to answer, because answering is
   * itself a claim. WŁADCA ZAKLĘĆ negates "każdego innego (bez wyjątku)
   * Zaklęcia, rzuconego bezpośrednio przed nim" and ZWIERCIADŁO reflects one
   * back at whoever spoke it, so an answer to an answer has to be possible, and
   * a single window before the dice could never hold that.
   */
  const state = game.turn_state;
  const inAFight = state.phase === "walka";
  if (state.phase === "walka") {
    const floor = floorOf(state.fight);
    if (!floor || floor.seat !== caster.seat_index) {
      throw new Error(
        floor
          ? "Teraz rzuca kto inny — poczekaj na swoją kolej."
          : "Najpierw zgłoś, że chcesz rzucić Zaklęcie (17.3).",
      );
    }
  }

  await db.from("holdings").delete().eq("id", holdingId);

  // Back to the used pile, so the spell deck can be reshuffled honestly (9.5).
  // 9.6: "reprezentująca je Karta jest odkładana na stos Kart już zużytych."
  await returnToPile(gameId, "spells", [asReturnable(held)]);

  const applied = script?.applies ? await applySpell(gameId, script.applies, target) : null;

  const victim =
    target.seatIndex !== undefined
      ? (seats.find((s) => s.seat_index === target.seatIndex)?.player_name ?? null)
      : null;

  await journal(gameId, caster.id, game.turn, "zaklecie", {
    cardId: held.card_id,
    name: spell?.name ?? held.card_id,
    ...(victim ? { target: victim } : {}),
    ...(target.note ? { note: target.note } : {}),
    ...(applied ? { took: applied } : {}),
  });

  /**
   * A spell spoken puts the fight back where it started, and hands the floor
   * back to the table.
   *
   * 17.3 has the spells before the roll, so a fight that has been spoken into
   * has not been rolled yet — and if it had been, the spell would be arriving
   * after the thing it was meant to change. Clearing the dice is what makes the
   * next claim mean something: whoever wants to answer this can, and the
   * fighting player rolls into the fight as it now stands rather than as it
   * stood before anybody spoke.
   */
  if (inAFight) {
    const now = await loadGame(gameId);
    if (now.turn_state.phase === "walka") {
      await db
        .from("games")
        .update({
          turn_state: {
            ...now.turn_state,
            fight: {
              ...now.turn_state.fight,
              caster: null,
              playerRoll: null,
              enemyRoll: null,
              result: null,
            },
          },
        })
        .eq("id", gameId);
    }
  }
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

  // 17.3 puts the spells before the dice, so the dice wait — but only while
  // somebody actually holds the floor, and only until it lapses. Checked here
  // and not only in the interface, because a claim one device can roll straight
  // through is not a claim.
  const floor = floorOf(game.turn_state.fight);
  if (floor) {
    const who = seats.find((s) => s.seat_index === floor.seat);
    throw new Error(
      `${who?.player_name ?? "Ktoś"} rzuca Zaklęcie (17.3) — kostki czekają.`,
    );
  }

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

  // 17.4 ends a fight the moment the dice are compared — win, lose or draw —
  // so anything that lasts "one fight" is spent whichever way it went.
  if (seat) await clearFightEffects(gameId, seat.id);

  // A guardian is not a card: it charges what its doorway charges rather than
  // the usual point of Życie, and winning carries the character through instead
  // of returning it to the field the fight interrupted.
  if (fight.guardian) {
    const outcome = fight.result.outcome;
    if (fight.guardian.kind === "most") {
      await settleBridge(gameId, fight.guardian.entrance, outcome);
    } else if (fight.guardian.kind !== "most-pole") {
      await settleCrossing(gameId, fight.guardian.crossing, outcome);
    }
    await journal(gameId, seat.id, game.turn, "straznik-koniec", {
      guardian: fight.cardName,
      outcome,
      enemyTotal: fight.enemyTotal,
    });
    // 14.6: the Demon and the Monstrum stand in the way rather than at a door.
    // Beating one lets the character walk on next turn; losing costs a point of
    // Życie and it is still there. Either way the character does not move — the
    // bridge is one field a turn and this turn was the fight. Spent after the
    // line above, so the journal reads in the order it happened: beaten by the
    // creature, then dead of it.
    if (fight.guardian.kind === "most-pole" && outcome === "przegrana") {
      await spendLife(gameId, seat, 1);
    }
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
    // 17.4: an item may prevent the point of Życie — a Hełm on a 1, a Tarcza on
    // 1-2, a Zbroja on 1-3, and wearing all three is one roll against the
    // widest of them rather than three chances. 18.2b takes the possibility
    // away entirely in a magical fight, which `spoilsFor` already knows.
    const saved = await shieldSaves(gameId, loserSeat, fight.kind, game.turn);
    if (!saved) await spendLife(gameId, loserSeat, 1);
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
/**
 * Takes a card off the field's stack once somebody has claimed it.
 *
 * What is still listed when the turn ends is exactly what nobody took, which is
 * what 16.8 leaves lying there for the next character.
 */
async function liftOffField(gameId: string, cardId: string): Promise<void> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "pole") return;
  const at = game.turn_state.drawn.findIndex((entry) => entry.cardId === cardId);
  if (at === -1) return;
  const drawn = game.turn_state.drawn.filter((_, index) => index !== at);
  await db
    .from("games")
    .update({ turn_state: { ...game.turn_state, drawn } })
    .eq("id", gameId);
}

export async function takeCard(
  gameId: string,
  seatId: string,
  cardId: string,
  /** Set when this card came off a field that was holding a granted one. */
  granted = false,
): Promise<void> {
  const game = await loadGame(gameId);
  // Both decks. 21.1 has a character take the Wyposażenie card for a Magiczny
  // Miecz or a Tarcza Tolimana, and 21.3 lets either be left on the board like
  // anything else — but the Tarcza Tolimana exists *only* on the equipment
  // sheet, so looking in the event deck alone made the one card the Zamek
  // Bestii requires impossible to pick up.
  const card = EVENTS.find((c) => c.id === cardId);
  const equipment = card ? null : (items as Item[]).find((i) => i.id === cardId);
  if (!card && !equipment) throw new Error(`Nieznana karta: ${cardId}`);

  // Everything on the Wyposażenie sheet is a Przedmiot; only the event deck
  // needs its class read to tell an item from a friend from a trophy.
  const kind = card ? kindForCard(card) : "item";
  if (!kind) throw new Error("Tej karty nie można zabrać ze sobą.");

  /**
   * Money is not luggage.
   *
   * A Sztuka Złota prints V, so `kindForCard` calls it an item and it went
   * into the pack with a discard button under it — where it also ate one of the
   * four places 5.4 allows. But the card *is* the gold: its script turns it
   * into a coin and puts it on the used pile, and nothing survives to carry.
   *
   * So taking one resolves it. The card still leaves the field's stack the same
   * way anything taken does, which is what 16.8 counts at the end of the turn.
   */
  if (isConsumedOnResolve(cardId)) {
    const script = scriptFor(cardId);
    if (script) await applyEffect(gameId, seatId, script.effect, cardName(cardId));
    await liftOffField(gameId, cardId);
    await journal(gameId, seatId, game.turn, "zabranie", { cardId, kind: "gold" });
    await bumpRevision(gameId);
    return;
  }

  const seats = await seatsFor(gameId);
  const taker = seats.find((s) => s.id === seatId);

  // 5.3: "Żadna Postać nie może posiadać Przedmiotów, którymi na mocy zasad nie
  // wolno się jej posługiwać. Kartę takiego Przedmiotu należy położyć odkrytą
  // na Obszarze, na którym Przedmiot ten został znaleziony." So it is not that
  // you take it and then discover you may not — you never take it, and it stays
  // where it lies. Checked here rather than only when a Natura changes, which
  // was the half of it that existed.
  if (card && !mayHold({ forbiddenTo: forbiddenFor(card) }, (taker?.nature ?? null) as Nature | null)) {
    throw new Error(`${card.name} — twoja Natura nie pozwala ci tego nieść (5.3).`);
  }

  // 12.1a: nothing is picked up while a Wróg is still standing on the field.
  // "W wymienionych przypadkach należy najpierw pokonać Wrogów albo im uciec" —
  // the loot waits until the fight is settled.
  if (game.turn_state.phase === "pole") {
    const settled = game.turn_state.fought ?? [];
    const standing = game.turn_state.drawn.find((entry) => {
      const foe = EVENTS.find((c) => c.id === entry.cardId);
      return foe && combatValueOf(foe) && !settled.includes(entry.cardId);
    });
    if (standing && standing.cardId !== cardId) {
      const foe = EVENTS.find((c) => c.id === standing.cardId);
      throw new Error(`Najpierw ${foe?.name ?? standing.cardId} — dopiero potem zbieranie (12.1).`);
    }
  }

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
    // 21.2: the Wyposażenie pile is finite. A Magiczny Miecz that four other
    // characters are already carrying is "w danej chwili nieosiągalny", and
    // 16.6 makes a drawn one the same card rather than a fifth — which is why
    // counting what is in play is the same answer as keeping a tally.
    if (fromTheShop(cardId)) {
      const left = stockLeft(cardId, await copiesInPlay(gameId, cardId));
      if (left <= 0) {
        throw new Error(
          `${cardName(cardId)} — nie ma już ani jednej w Wyposażeniu (21.2).`,
        );
      }
    }

    const variant = eq(game);
    if (carriedCount(mine, variant) >= carryLimit(mine, variant)) {
      throw new Error(
        `Postać może nieść najwyżej ${BASE_CARRY_LIMIT} Przedmioty (5.4). Odrzuć coś najpierw.`,
      );
    }
  }

  /**
   * 16.6 and 21.1: what you take is the Wyposażenie card, not the one you drew.
   *
   * "Jeżeli Postać wyciągnie Magiczny Miecz lub Tarczę Tolimana musi je zamienić
   * na identyczne z Wyposażenia, a wyciągnięte odłożyć na stos zużytych." The
   * exchange happens here, at the moment of taking, which is what makes the
   * rest of the app consistent: from now on this is a stock card, it occupies
   * one of `PRINTED_STOCK`'s slots, and when it leaves a hand it returns to the
   * shop rather than to the deck.
   *
   * `card` is set only when the id was found in the event deck — a Tarcza
   * Tolimana picked up off a field has no drawn copy to give back, and a
   * granted one has none either — the deck never gave that copy up.
   */
  if (card && fromTheShop(cardId) && !granted) await discardDrawnCopy(gameId, cardId);

  await db.from("holdings").insert({
    game_id: gameId,
    seat_id: seatId,
    card_id: cardId,
    kind,
    face: "open",
    granted,
  });

  await liftOffField(gameId, cardId);
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
    .select("seat_id,card_id,kind,granted")
    .eq("id", holdingId)
    .maybeSingle();

  // 9.4: Zaklęcia are not discarded at will — "Postać nie może odrzucać
  // Zaklęć, chyba, że posiada ich więcej, niż wynika to z jej parametru Magii".
  // A hand you can throw away is a hand you can tidy into whatever you wanted,
  // and the limit of 2.6 is meant to bite.
  if (data?.kind === "spell") {
    const seats = await seatsFor(gameId);
    const seat = seats.find((s) => s.id === data.seat_id);
    const held = (await holdingsFor(gameId)).filter(
      (h) => h.seat_id === data.seat_id && h.kind === "spell",
    );
    if (seat) {
      const bonus = bonusFromHoldings(
        (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id).map(asHolding),
        eq(game),
        "parametr",
      );
      const mineNow = (await holdingsFor(gameId))
        .filter((h) => h.seat_id === seat.id)
        .map(asHolding);
      const allowed = spellAllowance(
        seat.magia_own + bonus.magia,
        spellsAtSetup(seat.character_id),
        heldAbilities(mineNow.filter((h) => h.kind !== "trophy").map((h) => h.cardId)),
      );
      if (held.length <= allowed) {
        throw new Error(
          `Zaklęć nie odrzuca się, dopóki nie masz ich więcej niż ${allowed} (9.4, 2.6).`,
        );
      }
    }
  }

  await db.from("holdings").delete().eq("id", holdingId);

  // 5.5, 6.4 and 21.3: a discarded Przedmiot or a dismissed Przyjaciel is left
  // "na Obszarze, na którym aktualnie się znajduje" — face up, for whoever
  // stops there next. This used to delete the card outright, which quietly
  // removed it from the game; 12.1's own worked example is built on gear
  // waiting on a field for the next character to find.
  //
  // Zaklęcia are the exception and go to the used pile instead: 9.6 says a
  // spell's card goes there when it is spent, and nothing in the box has a
  // Zaklęcie lying on the board — the Klątwa in 13.5's example is left by a
  // card that puts it there, not by a player dropping it.
  const seat = (await seatsFor(gameId)).find((s) => s.id === data?.seat_id);
  const onField = data && data.kind !== "spell" && data.kind !== "trophy" && seat?.field_id;
  if (onField && data) {
    await db.from("field_cards").insert({
      game_id: gameId,
      field_id: seat.field_id,
      card_id: data.card_id,
      // Travels with it. Picked up by somebody else, a granted card would
      // otherwise be a real one from then on, and reach a pile the next time
      // it was put down.
      granted: data.granted,
    });
  } else if (data) {
    // The two that do not lie on a board. A shed Zaklęcie goes where 9.6 sends
    // a spoken one, and a trophy nobody wants goes where 1.4 sends a traded
    // one — both to the used pile, which until now they reached by being
    // deleted, which is not the same place at all.
    await returnToPile(gameId, data.kind === "spell" ? "spells" : "events", [data.card_id]);
  }

  await journal(gameId, (data?.seat_id as string) ?? null, game.turn, "odrzucenie", {
    cardId: data?.card_id,
    kind: data?.kind,
    onField: data?.kind !== "spell" && data?.kind !== "trophy" ? seat?.field_id : null,
  });
  await bumpRevision(gameId);
}

/**
 * Puts a seat's pack in the order its owner wants it in.
 *
 * Not a rule — 5.4 counts what you carry and has no opinion about the order it
 * sits in — but a pack of four cards you cannot arrange is one you have to read
 * every time instead of recognising. The order has to be the server's, or the
 * next two-second poll would put the cards back where they were.
 *
 * Every id is checked against the seat that claims them, and only those ids are
 * written: a request naming somebody else's card renumbers nothing, rather than
 * quietly reaching into their pack.
 *
 * Not journalled. The journal is what the *table* is allowed to read, and the
 * order of somebody's own pack is not something the rules or anybody else at
 * the table has a stake in.
 */
/* ---------------------------------------------------------------------------
 * Effects a seat is under.
 *
 * The write half of `status.ts`. Reading is `allStatuses`, which folds these
 * together with the four ad-hoc columns so a player sees one list; this half is
 * only for the effects that have nowhere else to live — an Eliksir's two points
 * of Miecz for a turn, and everything the buff system will carry once more
 * cards are transcribed.
 * ------------------------------------------------------------------------ */

interface EffectRow {
  id: string;
  seat_id: string;
  source: string;
  label: string;
  modifier: Modifier;
  ends: Ends;
}

export async function effectsFor(gameId: string): Promise<EffectRow[]> {
  const { data, error } = await db
    .from("seat_effects")
    .select("id,seat_id,source,label,modifier,ends")
    .eq("game_id", gameId)
    .order("created_at");
  if (error) throw new Error(`effectsFor: ${error.message}`);
  return (data ?? []) as EffectRow[];
}

/** What one seat is under, in the shape the engine reasons about. */
export async function statusesOf(gameId: string, seatId: string): Promise<Status[]> {
  return (await effectsFor(gameId))
    .filter((row) => row.seat_id === seatId)
    .map((row) => ({
      id: row.id,
      source: row.source,
      label: row.label,
      modifier: row.modifier,
      ends: row.ends,
    }));
}

/** Puts a seat under something, and says so. */
export async function addEffect(
  gameId: string,
  seatId: string,
  effect: { source: string; label: string; modifier: Modifier; ends: Ends },
): Promise<void> {
  const game = await loadGame(gameId);
  await db.from("seat_effects").insert({
    game_id: gameId,
    seat_id: seatId,
    source: effect.source,
    label: effect.label,
    modifier: effect.modifier,
    ends: effect.ends,
  });
  await journal(gameId, seatId, game.turn, "efekt", {
    source: effect.source,
    label: effect.label,
    ends: effect.ends,
  });
}

/**
 * Writes back whatever an engine function decided is left.
 *
 * The engine returns the survivors rather than naming what to delete, so this
 * deletes by difference: anything that was there and is not in the answer has
 * ended. A countdown that ticked comes back as the same id with a smaller
 * number, so it is updated rather than replaced — the row is the effect, and
 * replacing it would make an Eliksir look like it had been drunk twice.
 */
async function keepOnly(gameId: string, seatId: string, left: readonly Status[]): Promise<void> {
  const before = await statusesOf(gameId, seatId);
  const surviving = new Map(left.map((status) => [status.id, status]));

  for (const was of before) {
    const now = surviving.get(was.id);
    if (!now) {
      await db.from("seat_effects").delete().eq("id", was.id);
    } else if (JSON.stringify(now.ends) !== JSON.stringify(was.ends)) {
      await db.from("seat_effects").update({ ends: now.ends }).eq("id", was.id);
    }
  }
}

/** One of this seat's own turns has gone by (see `afterTurn`). */
export async function tickEffects(gameId: string, seatId: string): Promise<void> {
  await keepOnly(gameId, seatId, afterTurn(await statusesOf(gameId, seatId)));
}

/** A fight has finished, however it finished (17.4). */
export async function clearFightEffects(gameId: string, seatId: string): Promise<void> {
  await keepOnly(gameId, seatId, afterFight(await statusesOf(gameId, seatId)));
}

export async function reorderPack(
  gameId: string,
  seatId: string,
  holdingIds: readonly string[],
): Promise<void> {
  const mine = new Set(
    (await holdingsFor(gameId))
      .filter((holding) => holding.seat_id === seatId)
      .map((holding) => holding.id),
  );
  const order = holdingIds.filter((id) => mine.has(id));
  if (order.length === 0) return;

  // One-based, so a card that has never been arranged — which is null, and
  // sorts last — cannot collide with the first arranged one.
  for (const [index, id] of order.entries()) {
    await db.from("holdings").update({ ordinal: index + 1 }).eq("id", id);
  }
  await bumpRevision(gameId);
}

/**
 * Spends a card by using it.
 *
 * Nine Przedmioty in the box are one act rather than a possession — "Po użyciu
 * Kartę należy odłożyć" — and until now there was no way to perform that act.
 * The card sat in a pack doing nothing, and the only button under it was
 * "wyrzuć", which is a different thing entirely: 5.5 leaves a discarded
 * Przedmiot lying on the Obszar for whoever comes next, and a drunk Eliksir is
 * gone.
 *
 * Not gated on whose turn it is. Four of the nine are used inside somebody
 * else's turn — the Kryształ Losu in a fight you did not start, the
 * Zwierciadło against whoever needs it — so a turn check would refuse the card
 * at the only moment it is worth anything. `dropCard` is ungated for the same
 * reason and this is its sibling.
 *
 * The Karta goes before the effect is applied, because that is the order the
 * cards print it in and because it matters: the Szkatuła's first face hands
 * over a Tarcza Tolimana, and 5.4 must not count the box it came out of.
 */
export interface UseResult {
  card: string;
  face?: number;
  did: string[];
  /** The table has to work this one out — see `Use.rozpatruje`. */
  stol: boolean;
}

export async function spendHolding(gameId: string, holdingId: string): Promise<UseResult> {
  const game = await loadGame(gameId);
  const { data } = await db
    .from("holdings")
    .select("seat_id,card_id,kind,granted")
    .eq("id", holdingId)
    .maybeSingle();
  if (!data) throw new Error("Nie ma takiej Karty.");

  // Zaklęcia are spoken, not used: 9.6 has its own path, with its own window
  // and its own announcement to the table.
  if (data.kind === "spell") {
    throw new Error("Zaklęcie się rzuca, nie używa (9.6).");
  }

  const cardId = String(data.card_id);
  const use = usageOf(cardId);
  if (!use) throw new Error(`${cardName(cardId)} — tej Karty się nie zużywa.`);

  const seatId = String(data.seat_id);
  const script = use.rozpatruje === "aplikacja" ? scriptFor(cardId) : null;
  const face =
    script?.effect.op === "rzut" ? 1 + Math.floor(Math.random() * 6) : undefined;

  // Spent first, whatever comes of it. Every one of these cards says the Karta
  // goes — the Łódź says so even if you never got in it.
  await db.from("holdings").delete().eq("id", holdingId);
  await returnToPile(gameId, "events", [{ cardId, granted: data.granted === true }]);
  await journal(gameId, seatId, game.turn, "uzycie", {
    cardId,
    ...(face !== undefined ? { face } : {}),
  });

  // An effect the buff system can hold is applied here and now — the card is
  // gone, and what it bought is a thing the character is under until it runs
  // out. This is the whole of what "aplikacja" means for a card with no die.
  if (use.efekt) {
    await addEffect(gameId, seatId, { source: cardId, ...use.efekt });
    await bumpRevision(gameId);
    return { card: cardName(cardId), did: [use.efekt.label], stol: false };
  }

  if (!script) {
    await bumpRevision(gameId);
    return { card: cardName(cardId), did: [use.co], stol: true };
  }

  const effect = face !== undefined && script.effect.op === "rzut"
    ? script.effect.faces[face]
    : script.effect;
  const done = await applyEffect(
    gameId,
    seatId,
    effect,
    face !== undefined ? `${cardName(cardId)} (${face})` : cardName(cardId),
    {},
  );
  await bumpRevision(gameId);
  return {
    card: cardName(cardId),
    ...(face !== undefined ? { face } : {}),
    // A face the app cannot finish — the Szkatuła's Tarcza Tolimana, which is a
    // Karta somebody has to hand over — is reported as the table's rather than
    // silently dropped.
    did: done.pending ? [...done.did, describeEffect(done.pending)] : done.did,
    stol: done.pending !== null,
  };
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
    .select("id,card_id,granted")
    .eq("seat_id", seatId)
    .eq("kind", "trophy");
  const trophies = (data ?? []) as { id: string; card_id: string; granted: boolean }[];

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
  // 1.4, said in as many words: "Po tego rodzaju wymianie, Kartę pokonanego
  // Wroga należy odłożyć na stos zużytych Kart Zdarzeń." A beaten Wróg is not
  // spent when it is beaten — that is what makes it a trophy — it is spent
  // here, when it is cashed in.
  await returnToPile(gameId, "events", trophies.map(asReturnable));
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
  /**
   * How to file it.
   *
   * The default is what this was built for: a human overruling the referee, and
   * the journal draws those differently and says "korekta". A card doing what
   * the card says is the opposite of that, so the card paths pass their own
   * kind and leave the manual flag alone.
   */
  record: { kind: string; manual: boolean } = { kind: "korekta", manual: true },
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");

  const column = ADJUSTABLE[stat];
  // An unrecognised stat used to update a column called `undefined`, which
  // PostgREST accepts as an empty patch — so a typo in a correction returned
  // ok and changed nothing, which is the worst possible answer for a manual
  // override.
  if (!column) throw new Error(`Nie ma takiej wartości do korekty: ${stat}`);
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
    record.kind,
    { stat, delta, from: current, to: next, reason },
    record.manual,
  );

  if (stat === "zycie" && next === 0 && !seat.eliminated) await killSeat(gameId, seatId);
  await bumpRevision(gameId);
}

/**
 * Takes Życie off a character, and buries it if that was the last of it (4.4).
 *
 * The one place that does this, because it was six places and three of them
 * forgot the second half. Losing to the Demon Zagłady, playing badly against
 * Śmierć and being bitten by Cerber all wrote the new number straight to the
 * row — so a character could reach zero on the Kamienny Most and simply carry
 * on, alive at nothing, taking turns nobody could explain and never appearing
 * in the journal as having died. Those are the three fields where a character
 * is *most* likely to die, which is how it stayed unnoticed: the deaths that
 * did work were the ones anybody tests.
 *
 * Returns what is left, because most callers want to say it.
 */
async function spendLife(gameId: string, seat: SeatRow, points: number): Promise<number> {
  const left = Math.max(0, seat.zycie - points);
  await db.from("seats").update({ zycie: left }).eq("id", seat.id);
  if (left === 0 && !seat.eliminated) await killSeat(gameId, seat.id);
  return left;
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
      left.map((h) => ({
        game_id: gameId,
        field_id: seat.field_id,
        card_id: h.card_id,
        granted: h.granted,
      })),
    );
  }
  await db.from("holdings").delete().eq("seat_id", seatId);

  // 4.4: the gear and the friends stay on the field above, but "Karty Zaklęć
  // umieszczane są wśród tych, które zostały już użyte" — so the hand goes
  // back to the pile it was dealt from, where 9.5 can shuffle it in again.
  // A trophy has nowhere else to be either.
  const spellCards = holdings.filter((h) => h.kind === "spell");
  await returnToPile(gameId, "spells", spellCards.map(asReturnable));
  await returnToPile(
    gameId,
    "events",
    holdings.filter((h) => h.kind === "trophy").map(asReturnable),
  );

  const spells = spellCards.length;
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
 * Which Natures a card forbids (5.3).
 *
 * It used to read this out of the card's prose, looking for "jedynie" and
 * "tylko" — and all three cards that carry the restriction phrase it the other
 * way round, as a prohibition: "Włóczni nie mogą posiadać Złe Postacie". So the
 * search found nothing on exactly the cards the rule exists for, and a Zła
 * Postać could pick up the Święta Włócznia.
 *
 * It is data now, in the same registry as everything else a card does, so the
 * rule and the hover cannot disagree about it.
 */
function forbiddenFor(card: EventCard): ("dobra" | "zla" | "chaotyczna")[] | undefined {
  const forbidden = forbiddenNatures(card.id);
  return forbidden ? [...forbidden] : undefined;
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
  // "odłóż ich Karty na stos Kart zużytych" — the sentence names the pile, and
  // the friends were reaching it by being deleted, which is a different place.
  await returnToPile(gameId, "events", friends.map(asReturnable));

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
  // 14.1: on the Kamienny Most characters meet at the two Wejścia and nowhere
  // else. The bridge is a single-file line above a valley — there is no room to
  // turn and fight beside a Demon, which is what the rule is about.
  if (attacker.field_id && attacker.field_id in BRIDGE_SIDE && BRIDGE_ORDEAL.has(attacker.field_id)) {
    throw new Error("Na Moście Postacie spotykają się tylko na Wejściu na Most (14.1).");
  }

  const holdings = await holdingsFor(gameId);
  const totalsOf = (seatId: string, own: { miecz: number; magia: number }) => {
    const mine = holdings
      .filter((h) => h.seat_id === seatId)
      .map(asHolding);
    const bonus = bonusFromHoldings(mine, eq(game), "walka");
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
  // 17.7 word for word: "przed wykonaniem rzutu kostką obie Postacie mają
  // możliwość użycia Zaklęć". A duel is the one fight where "obie Postacie" is
  // literally two players, and it was the one fight that never opened the
  // window — the attacker rolled the moment they pressed attack.
  // Nobody is polled and nobody is named: the floor starts empty and is
  // claimed by whoever wants it (see `claimSpellFloor`).
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
  const bonus = bonusFromHoldings(holdings.map(asHolding), eq(game), "walka");
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
      ...abilitiesOfCharacter(asCharacterId(seat.character_id)),
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
    if (outcome === "przegrana") await spendLife(gameId, seat, 1);
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
      ...abilitiesOfCharacter(asCharacterId(seat.character_id)),
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
    const bonus = bonusFromHoldings(held.map(asHolding), eq(game), "parametr");
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
 * Krąg Płomieni spell — never on a die. So the answer is read off what the
 * seat is holding rather than rolled for, and a companion table can still say
 * yes or no itself.
 *
 * Three things the rules keep apart and this has to as well:
 *
 * - **Who.** 17.6 gives the attempt to the character who was *attacked*. In a
 *   duel that is never the active seat, because a duel only starts when the
 *   active seat attacks somebody (13.3).
 * - **From what.** Every printed escape covers Wrogowie. Another Postać is the
 *   Krąg Płomieni's alone — see `EscapeTarget`.
 * - **Where.** 19.3 leaves exactly one kind of escape on the Kamienny Most.
 */
export async function escape(
  gameId: string,
  /**
   * Whether the attempt worked, or null to let the app decide.
   *
   * Null is what a simulation sends. 19.1 does not roll for this — an escape
   * works because a character's ability or the Krąg Płomieni says it does — so
   * "decide" means reading the abilities rather than throwing a die, and the
   * answer is the same one `canEscapeAt` gives the interface. A companion table
   * still says yes or no itself, because there the abilities in play include
   * whatever the players have agreed about a card nobody has transcribed.
   */
  reported: boolean | null,
  /**
   * The seat that pressed it, or null for the shared screen in companion mode.
   *
   * Checked rather than trusted, because 17.6 hands the escape to the other
   * player: this is the one action in a fight that the seat whose turn it is
   * must not be able to take for themselves.
   */
  actorSeatId: string | null = null,
): Promise<{ succeeded: boolean; onBridge: boolean }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);

  if (game.turn_state.phase !== "walka" && game.turn_state.phase !== "pole") {
    throw new Error("Nie ma przed czym uciekać.");
  }

  const duelWith =
    game.turn_state.phase === "walka" ? game.turn_state.fight.opponentSeat : undefined;

  /**
   * 17.6: "Postać, która została zaatakowana, może próbować wymknąć się
   * przeciwnikowi." The attacker has already made their choice by attacking —
   * there is no rule anywhere letting them take it back — so in a duel the
   * escape belongs to the other seat, and only to them.
   */
  const fleeing =
    duelWith === undefined
      ? activeSeatOf(seats, game)
      : seats.find((s) => s.seat_index === duelWith);
  if (!fleeing) throw new Error("Nie ma kto uciekać.");
  if (actorSeatId !== null && actorSeatId !== fleeing.id) {
    throw new Error(
      duelWith === undefined
        ? "To nie twoja tura."
        : "Wymyka się Postać zaatakowana, nie atakująca (17.6).",
    );
  }

  // A duel is the only thing in the game that is fled *as a Postać*; everything
  // else on a field or in a hand of drawn cards is a Wróg.
  const przed: EscapeTarget = duelWith === undefined ? "wrog" : "postac";

  const onBridge = fleeing.field_id !== null && ringOf(fleeing.field_id) === KAMIENNY_MOST;
  if (onBridge && przed === "wrog") {
    throw new Error("Na Kamiennym Moście można wymknąć się tylko innym Postaciom (19.3).");
  }

  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === fleeing.id);
  const abilities = [
    ...abilitiesOfCharacter(asCharacterId(fleeing.character_id)),
    ...heldAbilities(inEffect(held.map(asHolding), eq(game)).map((h) => h.cardId)),
  ];
  const byAbility =
    fleeing.field_id !== null && canEscapeAt(abilities, fleeing.field_id, przed);

  /**
   * The other half of 19.1, and the only half that reaches another Postać.
   *
   * Looked for only once an ability has already said no, so nothing burns a
   * Karta for something a Charakterystyka does for free. Spent when it is used,
   * because 9.6 puts a spoken Zaklęcie on the used pile — and unlike the
   * abilities it gets you away from one thing, not from everything standing on
   * the Obszar.
   *
   * Only in a fight, because a Zaklęcie is spoken at something: 19.1 pins it to
   * "jednej (unieruchomionej w Kręgu Płomieni) istocie", and standing on a
   * field with three drawn Wrogowie names none of them. Refusing a card before
   * any fight begins stays what 19.2 makes it — an ability, or nothing.
   */
  const circle =
    byAbility || reported !== null || game.turn_state.phase !== "walka"
      ? undefined
      : held.find((h) => h.kind === "spell" && h.card_id === KRAG_PLOMIENI);

  const succeeded = reported ?? (byAbility || circle !== undefined);

  if (circle && succeeded) {
    await db.from("holdings").delete().eq("id", circle.id);
    await returnToPile(gameId, "spells", [asReturnable(circle)]);
    await journal(gameId, fleeing.id, game.turn, "zaklecie", {
      cardId: KRAG_PLOMIENI,
      name: SPELL_BY_ID.get(KRAG_PLOMIENI)?.name ?? KRAG_PLOMIENI,
    });
  }

  /**
   * What an escape leaves behind.
   *
   * 19.1 twice over: the character "nie może w żaden sposób oddziaływać" on
   * what it fled, and an escape by ability takes it away from "wszystkim
   * znajdującym się na danym Obszarze istotom" at once — not just from the one
   * it happened to be rolling against. So every Wróg on the field is settled,
   * which is `fought` rather than `resolved`: that list is the one 17.4 checks,
   * so a fled creature can be neither offered again nor fought again.
   *
   * The Krąg Płomieni is the exception the same rule names — one creature,
   * "jednej (unieruchomionej w Kręgu Płomieni) istocie" — so it ends the fight
   * in hand and nothing more.
   */
  if (succeeded && game.turn_state.phase === "walka") {
    const next = endFight(game.turn_state);
    const sweep =
      byAbility && przed === "wrog"
        ? game.turn_state.fight.drawn
            .filter((entry) => entry.cardClass === "wrog")
            .map((entry) => entry.cardId)
        : [];
    await db
      .from("games")
      .update({
        turn_state:
          next.phase === "pole" && sweep.length > 0
            ? { ...next, fought: [...new Set([...(next.fought ?? []), ...sweep])] }
            : next,
      })
      .eq("id", gameId);
  } else if (succeeded && game.turn_state.phase === "pole") {
    /**
     * Slipping past what is lying here, before any fight began.
     *
     * Without this the escape was invisible: it ended no fight, because there
     * was no fight yet, and left every Wróg sitting in the modal still asking
     * to be fought. Succeeding looked exactly like failing.
     */
    const fled = byAbility
      ? game.turn_state.drawn
          .filter((entry) => entry.cardClass === "wrog")
          .map((entry) => entry.cardId)
      : [];
    if (fled.length > 0) {
      await db
        .from("games")
        .update({
          turn_state: {
            ...game.turn_state,
            fought: [...new Set([...(game.turn_state.fought ?? []), ...fled])],
          },
        })
        .eq("id", gameId);
    }
  }
  await journal(gameId, fleeing.id, game.turn, succeeded ? "ucieczka" : "ucieczka-nieudana", {
    onBridge,
    ...(circle && succeeded ? { spell: KRAG_PLOMIENI } : {}),
  });
  await bumpRevision(gameId);
  // Said out loud. A failed attempt changes nothing on the board — 19.1 is not
  // a die roll, so there is no state for the interface to notice — which meant
  // the answer "no" was indistinguishable from the button doing nothing at all.
  return { succeeded, onBridge };
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
  const bonus = bonusFromHoldings(holdings, eq(game), "walka");

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
    await journal(gameId, seat.id, game.turn, "bestia-porazka", { kind, beastTotal });
    await spendLife(gameId, seat, 2);
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

  // Counted in the holder's OWN turns, so this is the moment: "na 1 turę" on a
  // card means one of yours, and measuring it in rounds would make an Eliksir
  // last longer at a table of six than at a table of two.
  if (seat) await tickEffects(gameId, seat.id);

  // Whatever was drawn or found here and not taken stays on the field (16.8).
  if (game.turn_state.phase === "pole" && game.turn_state.drawn.length > 0) {
    await leaveCardsBehind(
      gameId,
      game.turn_state.fieldId,
      game.turn_state.drawn,
      seat?.id ?? null,
      game.turn,
    );
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
  // `wrapped` and the number it wrapped to, because the round counter is not
  // derivable from the row: the journal reads entries in order and has no way
  // to know that this particular pass was the one that came back round.
  await journal(gameId, seat.id, game.turn, "koniec-tury", {
    next,
    skipped,
    wrapped,
    turnAfter: wrapped ? game.turn + 1 : game.turn,
  });
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
      throw new Error("Plecak jest pełny — najpierw coś wyrzuć (5.4, 5.6).");
    }
    // Nothing to write when the card is already there: the client sends this
    // whenever a card is dropped, including onto the pack it was picked up
    // from.
    if (held.slot !== null) await putInSlot(holdingId, null);
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

  /**
   * One thing per place, and the thing already there goes back in the pack
   * rather than vanishing. Only this seat's — everybody else's Miecz stays on.
   *
   * It goes back into the square the new one is leaving, so the two change
   * places. Landing on the end of the row instead was the tidy answer and the
   * wrong one: a player swapping a Miecz for an Excalibur has not decided
   * anything about where the Miecz should sit, and finding it at the back of a
   * pack of sixteen is a small punishment for an ordinary move.
   */
  const occupant = holdings.find(
    (h) => h.seat_id === held.seat_id && h.slot === slot && h.id !== holdingId,
  );
  if (occupant) {
    await putInSlot(occupant.id, null);
    const { error } = await db
      .from("holdings")
      .update({ ordinal: held.ordinal })
      .eq("id", occupant.id);
    if (error) throw new Error(`Nie udało się przenieść Przedmiotu: ${error.message}`);
  }
  if (held.slot !== slot) await putInSlot(holdingId, slot);
  /**
   * Nothing is journalled here, deliberately.
   *
   * Gear moves around constantly — a card is picked up, tried in a place, put
   * back, swapped for a better one — and a line for each would bury the turn it
   * happened in. What the table needs to see is a character *gaining* something
   * ("zabranie"), which is the event with consequences; where it then hangs on
   * the body is arrangement, and the seat card shows it at a glance.
   */
  await bumpRevision(gameId);
}

/**
 * Moves one card into a place, and says so if it did not.
 *
 * Supabase returns write errors in the result rather than throwing, so an
 * unchecked update is a write that can fail in silence — which is exactly what
 * happened when the Magiczny Miecz and the Tarcza Tolimana were given places of
 * their own: the column's CHECK still listed the nine gear slots, every equip
 * of a relic violated it, and the app reported success and changed nothing. A
 * silent write is worse than a failing one; the player is told their shield is
 * on and it is not.
 */
async function putInSlot(holdingId: string, slot: Slot | null): Promise<void> {
  const { error } = await db.from("holdings").update({ slot }).eq("id", holdingId);
  if (error) throw new Error(`Nie udało się przenieść Przedmiotu: ${error.message}`);
}

/**
 * What the Kamienny Most does to a character standing on one of its fields.
 *
 * The bridge is where the game ends, and until now the app went quiet on it:
 * the seven fields between an entrance and the Zamek existed on the board and
 * did nothing. Each has a printed procedure (14.5–14.6 and the boxed field text
 * at the end of the rulebook) and this is all six of them — the Zamek itself
 * already had its own fight.
 *
 * Dice may be supplied, as everywhere else, because a table with real dice on
 * it beats a table being told what it rolled.
 */
export interface BridgeOrdealResult {
  field: string;
  kind: string;
  dice?: number[];
  /** Where a fall put the character down, when it fell. */
  to?: string;
  /** Cards lost off the bridge, by name (14.5). */
  lost?: string[];
  kept?: string[];
  lifeLost?: number;
  outcome?: string;
  enemyTotal?: number;
}

export async function resolveBridgeOrdeal(
  gameId: string,
  input: { dice?: number[]; itemRolls?: number[] } = {},
): Promise<BridgeOrdealResult> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  const here = seat.field_id;
  if (!here || !BRIDGE_ORDEAL.has(here)) {
    throw new Error("Na tym Obszarze nie ma czego rozpatrywać.");
  }

  const roll = async (count: number, reason: string) =>
    input.dice && input.dice.length === count
      ? input.dice
      : await rollDice({ rollD6: async () => 1 + Math.floor(Math.random() * 6) }, count, reason);

  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const bonus = bonusFromHoldings(held.map(asHolding), eq(game), "parametr");
  const totals = {
    miecz: seat.miecz_own + bonus.miecz,
    magia: seat.magia_own + bonus.magia,
  };

  // --- Pułapka / Magiczna Pułapka (14.5)
  if (here === "pulapka" || here === "magiczna-pulapka") {
    // Only the eight bridge fields have a side, and this is one of the two
    // traps, so it has one — but the table says so rather than the code
    // assuming it.
    const side = BRIDGE_SIDE[here] ?? "miecz";
    const dice = await roll(3, "pulapka");
    const outcome = trapOutcome(dice, side === "magia" ? totals.magia : totals.miecz, side);
    if (!outcome.fell) {
      await journal(gameId, seat.id, game.turn, "most-pulapka", { dice, result: 0 });
      await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
    await bumpRevision(gameId);
      return { field: here, kind: "pulapka", dice, outcome: "uniknieta" };
    }

    // Everything carried is rolled for, Przedmioty and Przyjaciele alike; a 1
    // or a 2 keeps it and anything else is put on the discard pile, which is
    // what "odłożyć ich Karty" means here rather than leaving it on a field.
    const carried = held.filter((h) => h.kind === "item" || h.kind === "friend");
    const rolls =
      input.itemRolls && input.itemRolls.length === carried.length
        ? input.itemRolls
        : carried.map(() => 1 + Math.floor(Math.random() * 6));
    const { kept, lost } = keptAfterFall(carried, rolls);
    if (lost.length > 0) {
      await db
        .from("holdings")
        .delete()
        .in("id", lost.map((h) => h.id));
    }
    await db.from("seats").update({ field_id: outcome.fieldId }).eq("id", seat.id);
    await journal(gameId, seat.id, game.turn, "most-pulapka", {
      dice,
      result: outcome.result,
      to: outcome.fieldId,
      lost: lost.map((h) => h.card_id),
    });
    await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
    await bumpRevision(gameId);
    return {
      field: here,
      kind: "pulapka",
      dice,
      to: outcome.fieldId,
      lost: lost.map((h) => cardName(h.card_id)),
      kept: kept.map((h) => cardName(h.card_id)),
    };
  }

  // --- Gra ze Śmiercią
  if (here === "gra-ze-smiercia") {
    const mine = await roll(2, "gra-ze-smiercia");
    const deaths = Array.from({ length: 2 }, () => 1 + Math.floor(Math.random() * 6));
    const outcome = deathGameOutcome(mine, deaths);
    await journal(gameId, seat.id, game.turn, "most-gra-ze-smiercia", { mine, deaths, outcome });
    await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
    // After the turn state is closed: a death hands play on, and doing that
    // first only for this write to land on top of it puts the table back in a
    // turn belonging to somebody who is no longer in the game.
    if (outcome === "strata") await spendLife(gameId, seat, 1);
    await bumpRevision(gameId);
    return {
      field: here,
      kind: "gra-ze-smiercia",
      dice: [...mine, ...deaths],
      outcome,
      lifeLost: outcome === "strata" ? 1 : 0,
    };
  }

  // --- Cerber
  if (here === "cerber") {
    const [die] = await roll(1, "cerber");
    const loss = cerberLoss(die);
    await journal(gameId, seat.id, game.turn, "most-cerber", { die, loss });
    await db.from("games").update({ turn_state: endTurn() }).eq("id", gameId);
    await spendLife(gameId, seat, loss);
    await bumpRevision(gameId);
    return { field: here, kind: "cerber", dice: [die], lifeLost: loss };
  }

  // --- Demon Zagłady / Monstrum (14.6): a fight, not a table.
  // Everything else on the bridge was handled above, so what is left is one of
  // the two creatures. Checked rather than assumed: this used to index a
  // Record<string, …> and would have read `undefined.name` off any field that
  // slipped through, which is a crash in the middle of somebody's turn.
  const creature = BRIDGE_GUARDIAN[here];
  if (!creature) throw new Error(`Na tym polu Mostu nie ma nic do rozpatrzenia: ${here}`);
  const dice = await roll(2, "straznik-mostu");
  const strength = guardianStrength(dice);
  const phase = recordGuardianStrength(
    startGuardianFight(
      { kind: "most-pole", fieldId: here, name: creature.name, combat: creature.kind },
      totals,
      here,
    ),
    strength,
  );
  await db.from("games").update({ turn_state: phase }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "straznik-mostu", {
    guardian: creature.name,
    dice,
    strength,
  });
  await bumpRevision(gameId);
  return { field: here, kind: "straznik", dice, enemyTotal: strength, outcome: creature.name };
}

/**
 * Rolls a character's Hełm, Tarcza or Zbroja against the point of Życie it is
 * about to lose (17.4), and says whether it was saved.
 *
 * Rolled automatically because there is nothing to decide: the card grants "the
 * right to roll" and no reason has ever existed to decline. Journalled either
 * way, since a save is the difference between a death and a scratch and the
 * table will want to see the die.
 */
async function shieldSaves(
  gameId: string,
  seat: SeatRow,
  kind: CombatKind,
  turn: number,
): Promise<boolean> {
  // 18.2b: nothing prevents the loss in a magical fight.
  if (kind === "magiczna") return false;

  const game = await loadGame(gameId);
  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const abilities = [
    ...heldAbilities(inEffect(held.map(asHolding), eq(game)).map((h) => h.cardId)),
    ...abilitiesOfCharacter(asCharacterId(seat.character_id)),
  ];
  const upTo = bestShield(abilities);
  if (upTo === 0) return false;

  const die = 1 + Math.floor(Math.random() * 6);
  const saved = die <= upTo;
  await journal(gameId, seat.id, turn, "oslona", { die, upTo, saved });
  return saved;
}

/**
 * Rule 4.4's second half: the player takes a new character and begins again.
 *
 * "Gracz, który kierował niefortunną Postacią, może wybrać sobie nową i
 * rozpocząć z nią grę od początku (z Obszaru oznaczonego jako MGR)." Death ends
 * a character, not a player's evening — and until now the app treated it as
 * both, which in a game this long is the difference between a bad turn and
 * going to make tea for two hours.
 *
 * The new character starts as any character starts: its own MGR, its printed
 * Miecz and Magia, four Życie, one Sztuka Złota and whatever it owns before
 * anybody rolls. What the dead one was carrying stays where it fell (`killSeat`
 * put it there) for whoever passes that way.
 */
export async function takeNewCharacter(
  gameId: string,
  seatId: string,
  characterId: string,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  if (!seat.eliminated) throw new Error("Ta Postać wciąż żyje.");
  // The dead character's own card is out of the game — "jej Kartę odłożyć do
  // pozostałych nie biorących udziału w grze" — and so is everybody else's, so
  // the choice is from what nobody has held.
  const spent = new Set(
    seats.filter((s) => s.character_id).map((s) => s.character_id as string),
  );

  /**
   * The surprise, settled here and now.
   *
   * In the poczekalnia the sentinel sits on the seat until `startGame` deals a
   * real card, so nobody can see what anybody drew before the game begins.
   * There is no such moment left after a death — the game is already running —
   * so the draw happens as the button is pressed, from the same pool 4.4
   * describes: whatever nobody has held.
   *
   * A CSPRNG rather than `Math.random` for no reason except that the deal in
   * `store.ts` already uses one and two ways of drawing a character would be
   * one too many.
   */
  const wanted = isRandomPick(characterId)
    ? (() => {
        const left = CHARACTERS.filter((character) => !spent.has(character.id));
        if (left.length === 0) throw new Error("Nie została żadna wolna Postać.");
        return left[randomInt(left.length)].id;
      })()
    : characterId;

  if (spent.has(wanted)) {
    throw new Error("Ta Postać jest już w grze.");
  }

  await chooseCharacter(gameId, seatId, wanted);
  await db
    .from("seats")
    .update({
      eliminated: false,
      zycie: 4,
      zloto: 1,
      turns_lost: 0,
      stone_until_turn: null,
      bridge_blocked_until_turn: null,
      nature_changed_turn: null,
      ready: true,
    })
    .eq("id", seatId);

  const fresh = (await seatsFor(gameId)).find((s) => s.id === seatId);
  if (fresh) await dealStartingKit(gameId, fresh);

  await journal(gameId, seatId, game.turn, "nowa-postac", {
    characterId: wanted,
    // Which card it is, is public either way; that it was drawn rather than
    // chosen is worth a word, because the two are different decisions.
    ...(isRandomPick(characterId) ? { losowa: true } : {}),
  });
  await bumpRevision(gameId);
}

/* ---------------------------------------------------------------------------
 * The establishments (see `fieldScript.ts`).
 *
 * These are the three verbs the trading fields need and the card scripts had no
 * way to perform: paying for a card, handing one back, and paying for wounds.
 * Every one of them checks the price against what the character actually has,
 * because the whole reason a shop is worth encoding is that "za 2 Sz. Z. miecz"
 * is arithmetic somebody at the table gets wrong.
 *
 * Prices are read off the board here rather than taken from the request. The
 * client says what it wants to buy; what it costs is not its to say, and a
 * referee that accepted a price from the player being charged would not be one.
 * ------------------------------------------------------------------------ */

/**
 * Finds an operation of the given kind among everything on offer where a
 * character is standing — the field's own establishments, and any card lying
 * face up on it (16.8).
 *
 * The Targowisko and the Sztukmistrz are shops that settled onto a field, and a
 * shop that arrived on a card is not a different kind of shop from one printed
 * on the board. Looking in both places is what lets them be bought from with
 * the same three verbs.
 */
async function offerOn<K extends Effect["op"]>(
  gameId: string,
  fieldId: FieldId,
  op: K,
): Promise<Extract<Effect, { op: K }> | null> {
  const found: Effect[] = [];
  const walk = (effect: Effect) => {
    if (effect.op === op) found.push(effect);
    if (effect.op === "po-kolei") effect.steps.forEach(walk);
    if (effect.op === "wybor") effect.options.forEach((o) => walk(o.effect));
  };

  for (const offer of fieldScriptFor(fieldId)?.offers ?? []) walk(offer.effect);

  const here = (await fieldCardsFor(gameId)).filter((card) => card.field_id === fieldId);
  for (const card of here) {
    const script = scriptFor(card.card_id);
    if (script) walk(script.effect);
  }

  return (found[0] as Extract<Effect, { op: K }>) ?? null;
}

/** The seat acting, with the field it is standing on. */
async function shopper(gameId: string, seatId: string): Promise<SeatRow> {
  const seat = (await seatsFor(gameId)).find((s) => s.id === seatId);
  if (!seat) throw new Error("Nie ma takiego miejsca.");
  if (!seat.field_id) throw new Error("Postać nie stoi jeszcze na Obszarze.");
  return seat;
}

/**
 * Buys one card from the shop on the field the character is standing on.
 *
 * The gold moves only if the card does. `takeCard` is what actually hands it
 * over, and it is the one that knows about 5.4's carrying limit and 21.2's
 * empty pile — so a character who cannot carry it, or a Miecz nobody has left
 * to sell, fails before anything is paid rather than after.
 */
export async function buyGoods(
  gameId: string,
  seatId: string,
  cardId: string,
): Promise<void> {
  const seat = await shopper(gameId, seatId);
  const shop = await offerOn(gameId, seat.field_id!, "kup");
  if (!shop) throw new Error("Na tym Obszarze nie ma czego kupić.");

  const entry = shop.towar.find((t) => goodsId(t.co) === cardId);
  if (!entry) throw new Error(`${cardName(cardId)} nie jest tu na sprzedaż.`);
  if (seat.zloto < entry.cena) {
    throw new Error(`Za mało złota: ${entry.co} kosztuje ${entry.cena} Sz. Z.`);
  }

  await takeCard(gameId, seatId, cardId);
  await db.from("seats").update({ zloto: seat.zloto - entry.cena }).eq("id", seatId);
  const game = await loadGame(gameId);
  await journal(gameId, seatId, game.turn, "kupno", { cardId, price: entry.cena });
  await bumpRevision(gameId);
}

/**
 * Sells one held card back for gold (the Gród's Lichwiarz).
 *
 * The card is discarded rather than left on the field: "odłóż ich Karty". That
 * matters under 21.2, because a Wyposażenie card off a character's sheet is one
 * back within somebody else's reach, which `stockLeft` reads straight off the
 * copies in play.
 */
export async function sellHolding(
  gameId: string,
  seatId: string,
  holdingId: string,
): Promise<void> {
  const seat = await shopper(gameId, seatId);
  const all = await holdingsFor(gameId);
  const mine = all.filter((h) => h.seat_id === seatId);

  // Either a desk on this field, or an Alchemik walking beside you — the two
  // are the same trade at the same rate, and the card says so.
  const desk = await offerOn(gameId, seat.field_id!, "sprzedaj");
  const alchemist = heldAbilities(mine.map((h) => h.card_id)).find(
    (ability) => ability.kind === "skup",
  );
  const price = desk?.cena ?? (alchemist?.kind === "skup" ? alchemist.cena : null);
  if (price === null) throw new Error("Nikt tu nie skupuje Przedmiotów.");

  const held = mine.find((h) => h.id === holdingId);
  if (!held) throw new Error("Nie masz tej karty.");
  // A Przyjaciel is a person and a trophy is a memory; neither is something the
  // Lichwiarz deals in. 5.4 counts only Przedmioty and so does he.
  if (held.kind !== "item") throw new Error("Lichwiarz kupuje tylko Przedmioty.");

  await db.from("holdings").delete().eq("id", holdingId);
  // 21.2 for a Wyposażenie card — back to the stock, by arithmetic — and the
  // used pile for anything the deck printed. `returnToPile` knows which.
  await returnToPile(gameId, "events", [asReturnable(held)]);
  await db.from("seats").update({ zloto: seat.zloto + price }).eq("id", seatId);
  const game = await loadGame(gameId);
  await journal(gameId, seatId, game.turn, "sprzedaz", { cardId: held.card_id, price });
  await bumpRevision(gameId);
}

/**
 * Pays a healer.
 *
 * Two limits meet here and both bite: 4.7 caps healing at the four Życie a
 * character starts with, and the purse caps how many points can be paid for.
 * Asking for more than either allows is not an error — it is answered with what
 * the money and the rule between them actually buy, which is what a healer at a
 * table would say.
 *
 * The Zamek's die is deliberately not thrown here. Its "1-4 wyleczony, 5 bez
 * zmian, 6 tracisz 1 Życie" comes *after* the money changes hands, and it is
 * the field's own roll — the same one every other die table on the board goes
 * through, so it goes through the same controls rather than being hidden inside
 * a payment.
 */
export async function payHealer(
  gameId: string,
  seatId: string,
  points: number,
): Promise<{ healed: number; paid: number }> {
  const seat = await shopper(gameId, seatId);
  const cure = await offerOn(gameId, seat.field_id!, "uzdrow");
  if (!cure) throw new Error("Na tym Obszarze nikt nie leczy.");
  if (!Number.isInteger(points) || points < 1) throw new Error("Ile punktów?");

  const price = cure.cena ?? 0;
  const affordable = price > 0 ? Math.floor(seat.zloto / price) : points;
  const wanted = Math.min(points, affordable, Math.max(0, HEAL_CEILING - seat.zycie));
  if (wanted <= 0) {
    throw new Error(
      seat.zycie >= HEAL_CEILING
        ? `Życie jest już na poziomie początkowym (${HEAL_CEILING}) — 4.7 nie pozwala wyżej.`
        : "Za mało złota.",
    );
  }

  const paid = wanted * price;
  await db
    .from("seats")
    .update({ zycie: seat.zycie + wanted, zloto: seat.zloto - paid })
    .eq("id", seatId);
  const game = await loadGame(gameId);
  await journal(gameId, seatId, game.turn, "leczenie", { points: wanted, paid });
  await bumpRevision(gameId);
  return { healed: wanted, paid };
}

/**
 * Puts a character on a field by hand.
 *
 * The companion mode's founding assumption is that the figures on the table are
 * the truth and the app is a record of them, so the app *will* be wrong: a
 * figure gets knocked over, somebody counts six fields and moves five, a card
 * nobody has transcribed says "przenieś się gdzie chcesz". Every other tracked
 * value already has an override (see `adjust`); position, the value most likely
 * to drift and the one everything else is computed from, had none.
 *
 * Journalled as manual, like every other assertion a human makes over the
 * engine's head.
 */
/**
 * Puts a card straight into a seat's hand, out of nowhere.
 *
 * For testing, and only that. It skips every check taking a card normally makes
 * — 5.3's Natura restriction, 5.4's carrying limit, 21.2's finite Wyposażenie
 * pile — because the point is to reach a state quickly rather than to reach it
 * legally.
 *
 * Only the three kinds anybody actually holds. A Wróg is a trophy you have to
 * beat, and Spotkania, Nieznajomi and Miejsca are resolved and set aside; none
 * of them are things a hand can contain, so granting one would put a row in the
 * holdings table that no rule knows how to read.
 *
 * Journalled as a manual override, because that is exactly what it is: the
 * journal draws those differently and says so, and a card that appeared by
 * magic should not be indistinguishable from one that was won.
 */
/**
 * Carries out one line from the test console.
 *
 * The grammar is in `console.ts` and is pure; this is the half with the
 * database in it, and it does almost nothing of its own — every command calls
 * the function the game itself calls, so a tested Życie is lost the way a real
 * one is, a staged fight rolls the dice the real combat rolls, and nothing here
 * can quietly disagree with the rules by having its own copy of them.
 *
 * Returns the line to print back. Refusals come up as thrown errors, which the
 * route turns into the same message any other refusal gets.
 */
export async function runCommand(
  gameId: string,
  actorSeatId: string,
  command: Command,
): Promise<string> {
  const seats = await seatsFor(gameId);

  /**
   * Whose seat a command is about: the one named, or your own.
   *
   * Named by player, by character, or by seat number — whichever is on screen
   * when somebody types. Any seated player may act on any seat here, as they
   * may with the corrections: at a table people fix each other's boards.
   */
  const seatOf = (who: string | null) => {
    if (!who) {
      const mine = seats.find((seat) => seat.id === actorSeatId);
      if (!mine) throw new Error("Nieznane miejsce.");
      return mine;
    }
    const digits = who.trim();
    if (/^\d+$/.test(digits)) {
      const at = seats.find((seat) => seat.seat_index === Number(digits) - 1);
      if (at) return at;
    }
    const hit = findByName(
      seats.filter((seat) => seat.character_id),
      (seat) => seat.player_name ?? seat.character_id ?? `${seat.seat_index + 1}`,
      who,
    );
    if ("found" in hit) return hit.found;
    if ("ambiguous" in hit) throw new Error(`Which one — ${hit.ambiguous.join(", ")}?`);
    throw new Error(`Nobody called \`${who}\` is at this table.`);
  };

  const named = (seat: { player_name: string | null; seat_index: number }) =>
    seat.player_name ?? `Miejsce ${seat.seat_index + 1}`;

  switch (command.kind) {
    case "help":
      return helpLines().join("\n");

    case "stat": {
      const seat = seatOf(command.who);
      await adjust(gameId, seat.id, command.stat as Adjustable, command.delta, "tryb testowy");
      const after = (await seatsFor(gameId)).find((s) => s.id === seat.id);
      const now = after ? (after as unknown as Record<string, number>)[ADJUSTABLE[command.stat]] : "?";
      return `${named(seat)}: ${command.stat} ${command.delta > 0 ? "+" : ""}${command.delta} → ${now}`;
    }

    case "kill": {
      const seat = seatOf(command.who);
      if (seat.eliminated) return `${named(seat)} już nie żyje.`;
      // Through the same door a lost fight goes through, so what a death does
      // to a character — its cards on the field, its Zaklęcia spent, the turn
      // handed on — happens here too (4.4).
      await adjust(gameId, seat.id, "zycie", -seat.zycie, "tryb testowy");
      return `${named(seat)} ginie.`;
    }

    case "give": {
      const seat = seatOf(null);
      await grantCard(gameId, seat.id, command.cardId);
      return `${named(seat)} takes ${cardName(command.cardId)}.`;
    }

    case "go": {
      const seat = seatOf(null);
      await placeSeat(gameId, seat.id, command.fieldId, "tryb testowy");
      return `${named(seat)} stands on ${FIELDS.get(command.fieldId)?.name ?? command.fieldId}.`;
    }

    case "fight": {
      const seat = seatOf(null);
      await stageFight(gameId, seat.id, command.cardId);
      return `${named(seat)} fights ${cardName(command.cardId)}.`;
    }

    case "settle": {
      /**
       * Decides the fight you are in, without arranging dice to do it.
       *
       * Rolling until the answer comes out right is what a tester would
       * otherwise have to do, and against a Wilkołak with Miecz 10 there are
       * totals no pair of dice can reach — so the result is written and then
       * *applied* by `resolveFight`, the same function the last die calls. What
       * follows a loss follows here too: 17.4's Zbroja rolled against the point
       * of Życie, 4.4 if it was the last one, the guardian's own price on the
       * Kamienny Most.
       */
      const game = await loadGame(gameId);
      if (game.turn_state.phase !== "walka") throw new Error("Nie ma walki.");
      const fight = game.turn_state.fight;
      const settled =
        command.outcome === "remis"
          ? ({ outcome: "remis", kind: fight.kind } as const)
          : ({
              outcome: command.outcome,
              kind: fight.kind,
              winner: command.outcome === "wygrana" ? "Postać" : fight.cardName,
              loser: command.outcome === "wygrana" ? fight.cardName : "Postać",
            } as const);
      await db
        .from("games")
        .update({
          turn_state: {
            ...game.turn_state,
            // The dice are filled in as well, because everything downstream
            // reads a settled fight as one that was rolled.
            fight: {
              ...fight,
              playerRoll: fight.playerRoll ?? 0,
              enemyRoll: fight.enemyRoll ?? 0,
              result: settled,
            },
          },
        })
        .eq("id", gameId);
      await resolveFight(gameId);
      return command.outcome === "remis"
        ? "Fight drawn."
        : command.outcome === "wygrana"
          ? `Won against ${fight.cardName}.`
          : `Lost to ${fight.cardName}.`;
    }

    case "endfight":
      await abandonFight(gameId);
      return "Fight dropped.";

    case "endturn":
      await finishTurn(gameId);
      return "Turn passed.";

    case "spell": {
      const seat = seatOf(command.who);
      const spellId = await drawSpell(gameId, seat.id);
      return `${named(seat)} draws ${cardName(spellId)}.`;
    }
  }
}

export async function grantCard(gameId: string, seatId: string, cardId: string): Promise<void> {
  const game = await loadGame(gameId);
  const spell = SPELLS.find((card) => card.id === cardId);
  const equipment = (items as Item[]).find((item) => item.id === cardId);
  const event = EVENTS.find((card) => card.id === cardId);

  const kind = spell ? "spell" : equipment ? "item" : event ? kindForCard(event) : null;
  if (kind === null) throw new Error(`Nie wiem, czym jest: ${cardId}`);
  if (kind === "trophy") throw new Error("Wroga trzeba pokonać, nie wziąć.");

  await db.from("holdings").insert({
    game_id: gameId,
    seat_id: seatId,
    card_id: cardId,
    kind,
    // 9.3 keeps a Zaklęcie face down even when it arrived by fiat.
    face: kind === "spell" ? "hidden" : "open",
    // Not a card from the box. The deck keeps its own copy and can still deal
    // it; this one belongs to no pile and joins none when it goes.
    granted: true,
  });
  await journal(gameId, seatId, game.turn, "test-karta", { cardId, kind }, true);
  await bumpRevision(gameId);
}

export async function placeSeat(
  gameId: string,
  seatId: string,
  target: string,
  reason: string | null,
): Promise<void> {
  const game = await loadGame(gameId);
  const seat = (await seatsFor(gameId)).find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  // The other request-body field id. `requireFieldId` is the check that used to
  // be spelled out here by hand, and now every caller gets the narrow type.
  const fieldId = requireFieldId(target, "Przestawienie");

  await db.from("seats").update({ field_id: fieldId }).eq("id", seatId);

  // The turn state carries its own copy of where the character is standing —
  // it is what the panel reads to decide which field's options to offer — so
  // moving the figure without it left the header naming one field and the
  // buttons belonging to another.
  //
  // Every phase past the roll, not just `pole`. The commonest reason to reach
  // for this override is a table that is *stuck*: mid-fight with something on
  // a field the figure is not on any more, or holding a bridge guardian that
  // should never have been met. Leaving that fight running while the figure
  // stands somewhere else is the desync, not a lesser version of it. `rzut` is
  // left alone because the character has not moved yet this turn.
  if (
    seat.seat_index === game.active_seat &&
    game.turn_state.phase !== "rzut" &&
    game.turn_state.phase !== "koniec"
  ) {
    await db
      .from("games")
      .update({
        // Freshly arrived: whatever was drawn belonged to the old field, and
        // the new one has not been resolved at all. `draw: 0` rather than the
        // field's printed count, because a figure put here by hand did not
        // walk here, and 15.1 makes drawing a consequence of arriving.
        turn_state: { phase: "pole", fieldId, from: null, draw: 0, drawn: [], fought: [] },
      })
      .eq("id", gameId);
  }

  await journal(
    gameId,
    seatId,
    game.turn,
    "przestawienie",
    { from: seat.field_id, to: fieldId, reason },
    true,
  );
  await bumpRevision(gameId);
}

/**
 * Opens a fight with a creature a card names rather than one lying on a field.
 *
 * The Karczma's "miejscowy osiłek (Miecz 4)" is nowhere in the deck: he is a
 * line on the board with a number after him. `beginFight` starts from a card
 * id, so it cannot be used, but everything after that — the totals, the two
 * dice, 17.4's point of Życie — is the same fight.
 */
async function beginNamedFight(
  gameId: string,
  name: string,
  miecz?: number,
  magia?: number,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie czas na walkę.");

  const held = (await holdingsFor(gameId)).filter((h) => h.seat_id === seat.id);
  const bonus = bonusFromHoldings(held.map(asHolding), eq(game), "walka");
  const next = startFight(
    game.turn_state,
    { cardId: `pole:${name}`, cardName: name, ...(magia !== undefined ? { magia } : { miecz }), settles: [] },
    { miecz: seat.miecz_own + bonus.miecz, magia: seat.magia_own + bonus.magia },
  );
  await db.from("games").update({ turn_state: next }).eq("id", gameId);
  await journal(gameId, seat.id, game.turn, "walka-start", { nazwa: name, enemyTotal: miecz ?? magia });
  await bumpRevision(gameId);
}

/* ---------------------------------------------------------------------------
 * Carrying an effect out.
 *
 * A simulation that rolls the die and then asks somebody to press "−1 Złota" is
 * not simulating anything; it is a die with extra steps. This is the other
 * half: the app rolls, and then it does what the roll says.
 *
 * `isSettled` draws the line. Everything that has one outcome happens here;
 * everything the rules leave to the player — a `wybor`, which Przedmiot to
 * lose, where in the Krąg to move to — is handed back so the interface can ask
 * exactly that and nothing else.
 * ------------------------------------------------------------------------ */

/** What an effect did, in the words the table would use. */
/**
 * What a player has already said, for an effect that asks.
 *
 * `choices` is a queue, taken in the order the effect walks: a card with a
 * choice inside a choice consumes two. `destination` answers the one question
 * that is a place rather than an option — "przenieś się na dowolny Obszar w
 * tym Kręgu".
 */
export interface Decisions {
  choices?: number[];
  destination?: FieldId;
}

export interface Resolution {
  /** One line per thing that happened, for the notice and the journal. */
  did: string[];
  /**
   * The part still owed to a player's decision, if any. Null when the whole
   * effect has been carried out.
   */
  pending: Effect | null;
}

/**
 * How many of a thing, in Polish.
 *
 * Miecz, Magia and Życie take the same form whatever the number — "+2 Życia" —
 * but Złoto declines: one Sztukę, two to four Sztuki, five and up Sztuk. The
 * deltas in this game are almost always one, which is exactly the case a single
 * fixed form gets wrong.
 */
function amountOf(stat: "miecz" | "magia" | "zycie" | "zloto", count: number): string {
  if (stat !== "zloto") {
    return { miecz: "Miecza", magia: "Magii", zycie: "Życia" }[stat];
  }
  if (count === 1) return "Sztukę Złota";
  return count >= 2 && count <= 4 ? "Sztuki Złota" : "Sztuk Złota";
}

/**
 * Applies one effect to one seat, as far as it goes.
 *
 * Not a pure function and deliberately not in the engine: it writes seats,
 * draws Zaklęcia and opens fights. What *is* pure is the decision about whether
 * a thing can be applied at all, and that lives in `resolve.ts` where it can be
 * tested against every card in the box.
 */
/** A seat row as the target rules see it: where it stands, what it is, whether it is still playing. */
function asTargetSeat(row: SeatRow): TargetSeat {
  const nature =
    row.nature === "dobra" || row.nature === "zla" || row.nature === "chaotyczna"
      ? row.nature
      : null;
  return {
    seatIndex: row.seat_index,
    characterId: row.character_id,
    fieldId: row.field_id,
    nature,
    eliminated: row.eliminated,
  };
}

export async function applyEffect(
  gameId: string,
  seatId: string,
  effect: Effect,
  reason: string,
  /**
   * What the player has already decided, in the order the effect asks.
   *
   * The client never sends an effect — it sends *which option it picked*, and
   * the server re-walks the card it owns and takes that branch. A card cannot
   * therefore be talked into doing something it does not say, which is the
   * whole reason the decision travels as a number.
   */
  decided: Decisions = {},
): Promise<Resolution> {
  // A decision the player has already made turns an unsettled effect into a
  // settled one, so this is asked after the choices have been consumed rather
  // than before.
  if (effect.op === "wybor") {
    const pick = decided.choices?.shift();
    const option = pick === undefined ? undefined : effect.options[pick];
    if (!option) return { did: [], pending: effect };
    const done = await applyEffect(gameId, seatId, option.effect, `${reason}: ${option.label}`, decided);
    // The label only when it adds something. An option called "+1 Magii" whose
    // effect reports "+1 Magii" would otherwise be written down twice.
    const said = done.did[0] === option.label ? done.did : [option.label, ...done.did];
    return { did: said, pending: done.pending };
  }

  if (effect.op === "przenies" && effect.to.kind !== "pole") {
    const where = decided.destination;
    if (!where) return { did: [], pending: effect };
    await placeSeat(gameId, seatId, where, reason);
    return {
      did: [`przenosisz się na: ${FIELDS.get(where)?.name ?? where}`],
      pending: null,
    };
  }

  if (!isSettled(effect)) return { did: [], pending: effect };

  switch (effect.op) {
    case "nic":
      return { did: ["nic się nie dzieje"], pending: null };

    case "po-kolei": {
      const did: string[] = [];
      for (const step of effect.steps) {
        const step_ = await applyEffect(gameId, seatId, step, reason, decided);
        // A step nobody has decided yet stops the sequence: what follows it may
        // depend on it, and doing the rest first would resolve the card out of
        // its own order.
        if (step_.pending) return { did, pending: step_.pending };
        did.push(...step_.did);
      }
      return { did, pending: null };
    }

    case "gdy": {
      const seat = (await seatsFor(gameId)).find((s) => s.id === seatId);
      if (!seat) throw new Error("Nieznane miejsce.");
      const nature = seat.nature as Nature | null;
      const holds = effect.warunek.is === "natura"
        ? nature !== null && effect.warunek.jedna_z.includes(nature)
        : effect.warunek.is === "ma-zloto"
          ? seat.zloto > 0
          : (effect.warunek.stat === "miecz" ? seat.miecz_own : seat.magia_own) <
            effect.warunek.ponizej;
      const branch = holds ? effect.to : effect.inaczej;
      return branch
        ? applyEffect(gameId, seatId, branch, reason, decided)
        : { did: ["warunek niespełniony — nic się nie dzieje"], pending: null };
    }

    case "punkty": {
      const seats = await seatsFor(gameId);
      const actor = seats.find((row) => row.id === seatId);
      const hit = seatsTargeted(
        effect.target,
        seats.map(asTargetSeat),
        actor ? asTargetSeat(actor) : undefined,
        [],
      );
      // Waits for somebody to arrive, or for the holder to choose.
      if (hit === null) return { did: [], pending: effect };
      for (const target of hit) {
        const row = seats.find((candidate) => candidate.seat_index === target.seatIndex);
        if (!row) continue;
        await adjust(gameId, row.id, effect.stat, effect.delta, reason, {
          kind: "punkty",
          manual: false,
        });
      }
      if (hit.length === 0) return { did: ["nikogo to nie dotyczy"], pending: null };
      const sign = effect.delta > 0 ? "+" : "−";
      const many = Math.abs(effect.delta);
      return {
        did: [`${sign}${many} ${amountOf(effect.stat, many)}`],
        pending: null,
      };
    }

    case "tura-stracona": {
      const seats = await seatsFor(gameId);
      const actor = seats.find((row) => row.id === seatId);
      const hit = seatsTargeted(
        effect.target,
        seats.map(asTargetSeat),
        actor ? asTargetSeat(actor) : undefined,
        effect.oprocz ?? [],
      );
      // Waits for somebody to arrive, or for the holder to choose: still not
      // this applier's to finish.
      if (hit === null) return { did: [], pending: effect };

      const game = await loadGame(gameId);
      const names: string[] = [];
      for (const target of hit) {
        const row = seats.find((candidate) => candidate.seat_index === target.seatIndex);
        if (!row) continue;
        /**
         * 16.1 spends the loss on the turn in progress, not on a future one.
         *
         * "Jeżeli spowodowałoby to utratę tury przez Postać, musi ona
         * powstrzymać się od podejmowania jakichkolwiek dalszych działań — TA
         * WŁAŚNIE tura liczy się jako stracona." The player who draws the
         * Karczma's 3 has already moved and already arrived; what the card
         * takes is the rest of that turn.
         *
         * Counting it forward instead cost them two turns for the price of one
         * — they finished the turn the card ended, and were skipped on the next
         * — and let them keep acting through a turn the rules had closed.
         *
         * Everybody else banks it, because for them it is genuinely a turn that
         * has not started: the Burza costs a turn to characters who are not
         * playing at the time.
         */
        const isPlaying = row.seat_index === game.active_seat;
        await db
          .from("seats")
          .update({
            turns_lost: row.turns_lost + (isPlaying ? effect.turns - 1 : effect.turns),
          })
          .eq("id", row.id);
        // Its own kind, and not marked manual. `adjust` writes a "korekta" flagged
        // as a human override, and a card doing what the card says is the exact
        // opposite of somebody overruling the referee — the journal draws those
        // differently and would have been calling every one of these a correction.
        await journal(gameId, row.id, game.turn, "tura-stracona", {
          turns: effect.turns,
          reason,
        });
        names.push(row.player_name ?? `miejsce ${row.seat_index + 1}`);
      }
      await bumpRevision(gameId);

      /**
       * And the turn in progress stops here (16.1).
       *
       * "musi ona powstrzymać się od podejmowania jakichkolwiek dalszych
       * działań" — so the phase goes to `koniec`, where the only control left
       * is the one that passes play on. Without this the arithmetic above would
       * make the card do nothing at all to the player who drew it: it takes no
       * future turn from them, so it has to take this one.
       *
       * Whatever they drew and did not resolve stays on the Obszar, face up,
       * which is 16.8 and which `finishTurn` already does.
       */
      if (hit.some((target) => target.seatIndex === game.active_seat)) {
        await db
          .from("games")
          .update({ turn_state: endTurn() })
          .eq("id", gameId);
      }

      if (hit.length === 0) return { did: ["nikogo to nie dotyczy"], pending: null };
      const onlyMe = hit.length === 1 && hit[0].seatIndex === actor?.seat_index;
      return {
        did: [onlyMe ? `tracisz ${effect.turns} turę` : `tracą turę: ${names.join(", ")}`],
        pending: null,
      };
    }

    case "strata": {
      const seats = await seatsFor(gameId);
      const actor = seats.find((row) => row.id === seatId);
      const hit = seatsTargeted(
        effect.target,
        seats.map(asTargetSeat),
        actor ? asTargetSeat(actor) : undefined,
        [],
      );
      if (hit === null) return { did: [], pending: effect };

      const game = await loadGame(gameId);
      const holdings = await holdingsFor(gameId);
      const said: string[] = [];

      for (const target of hit) {
        const row = seats.find((candidate) => candidate.seat_index === target.seatIndex);
        if (!row) continue;

        const mine = holdings
          .filter((held) => held.seat_id === row.id)
          .map((held) => ({
            id: held.id,
            cardId: held.card_id,
            kind: held.kind,
            granted: held.granted,
          }));
        // Null means the holder has to pick, which 5.6 makes their right. It
        // should not reach here — isSettled asks first — but a card that starts
        // saying "wybierz" tomorrow should stop, not choose for somebody.
        const gone = chooseLosses(mine, effect, (upTo) => Math.floor(Math.random() * upTo));
        if (gone === null) return { did: [], pending: effect };

        const gold = goldLost(effect, row.zloto);
        if (gone.length > 0) {
          await db.from("holdings").delete().in("id", gone);
          // 6.4's "muszą zostać odrzuceni z innych przyczyn": a card taken by
          // an effect rather than put down by its owner is not left lying on
          // the Obszar — it is gone, and gone means the used pile.
          const lost = mine.filter((held) => gone.includes(held.id));
          await returnToPile(
            gameId,
            "spells",
            lost.filter((held) => held.kind === "spell"),
          );
          await returnToPile(
            gameId,
            "events",
            lost.filter((held) => held.kind !== "spell"),
          );
        }
        if (gold > 0) {
          await db.from("seats").update({ zloto: row.zloto - gold }).eq("id", row.id);
        }
        if (gone.length === 0 && gold === 0) continue;

        const names = gone
          .map((id) => mine.find((held) => held.id === id)?.cardId)
          .filter((id): id is string => typeof id === "string")
          .map(cardName);
        // Its own kind, unflagged: a card doing what it says is not somebody
        // overruling the referee, and the journal draws those two differently.
        await journal(gameId, row.id, game.turn, "strata", {
          co: effect.co,
          cardIds: gone.map((id) => mine.find((held) => held.id === id)?.cardId).filter(Boolean),
          zloto: gold,
        });
        said.push(
          `${row.player_name ?? `miejsce ${row.seat_index + 1}`}: ` +
            [names.join(", "), gold > 0 ? `${gold} Sz. Z.` : ""].filter(Boolean).join(", "),
        );
      }

      await bumpRevision(gameId);
      return {
        did: said.length > 0 ? [`tracą ${describeLoss(effect)} — ${said.join("; ")}`] : ["nie ma czego stracić"],
        pending: null,
      };
    }

    case "uzdrow": {
      const healed = await healSeat(gameId, seatId, effect.upTo);
      return {
        did: [healed > 0 ? `+${healed} Życia (4.7)` : "Życie już na poziomie początkowym"],
        pending: null,
      };
    }

    case "zaklecie": {
      const names: string[] = [];
      for (let i = 0; i < effect.count; i++) names.push(await drawSpell(gameId, seatId));
      return { did: [`Zaklęcie: ${names.join(", ")}`], pending: null };
    }

    case "kamien":
      await turnToStone(gameId, seatId);
      return { did: ["Zamiana w Kamień (20.1)"], pending: null };

    case "natura":
      await changeNature(gameId, seatId, effect.na);
      return { did: [`Natura: ${effect.na === "zla" ? "zła" : effect.na}`], pending: null };

    case "przenies": {
      if (effect.to.kind !== "pole") return { did: [], pending: effect };
      await placeSeat(gameId, seatId, effect.to.fieldId, reason);
      return {
        did: [`przenosisz się na: ${FIELDS.get(effect.to.fieldId)?.name ?? effect.to.fieldId}`],
        pending: null,
      };
    }

    case "walka": {
      // A creature the card conjures rather than a card on the field, so the
      // fight is opened directly with its printed strength.
      await beginNamedFight(gameId, effect.nazwa, effect.miecz, effect.magia);
      return { did: [`walka: ${effect.nazwa}`], pending: null };
    }

    case "ruch-dodatkowy":
      return { did: ["dodatkowy ruch — rzuć jeszcze raz"], pending: null };

    case "wyciagnij": {
      for (let i = 0; i < effect.count; i++) await drawCard(gameId, null);
      return { did: [`wyciągnięto ${effect.count} Kart`], pending: null };
    }

    default:
      // `isSettled` said yes and this says how — so a new settled op that
      // forgets to be handled here is a loud failure rather than a silent one.
      throw new Error(`Nie wiem, jak wykonać: ${effect.op}`);
  }
}

/**
 * Rolls one of the field's die tables and does what it says.
 *
 * The whole point of a simulation: press once, and the app throws the die,
 * reads the row and applies it. What comes back is the face and a plain-words
 * account of what happened, because a player who did not see it happen has to
 * be told — and because at a table somebody always asks to see the die.
 *
 * `pending` comes back set when the face lands on something the rules leave to
 * the player: "wybierz jedno", which Przedmiot to give up, which Obszar in the
 * Krąg to move to. Then the app has done everything except the deciding, and
 * the interface asks that one question.
 */
export async function resolveFieldOffer(
  gameId: string,
  offerName: string,
  value: number | null,
  decided: Decisions = {},
): Promise<{ offer: string; face?: number; did: string[]; pending: Effect | null }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (!seat.field_id) throw new Error("Postać nie stoi na Obszarze.");
  // Rolling a field's table is something you do having arrived on it (15.1), so
  // it belongs to the field phase. Said here rather than left to whatever the
  // face happens to do — a face that opens a fight would otherwise report
  // "nie czas na walkę", which is true and explains nothing.
  if (game.turn_state.phase !== "pole") {
    throw new Error("To rozpatruje się po wejściu na Obszar.");
  }

  const script = fieldScriptFor(seat.field_id);
  const offer = script?.offers.find((o) => o.name === offerName);
  if (!offer) throw new Error(`Na tym Obszarze nie ma: ${offerName}`);

  // A table is rolled; anything else is simply carried out.
  if (offer.effect.op !== "rzut") {
    const done = await applyEffect(gameId, seat.id, offer.effect, offer.name, decided);
    if (!done.pending) await markResolved(gameId, offerKey(offer.name));
    await bumpRevision(gameId);
    return { offer: offer.name, ...done };
  }

  const face = value ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(face) || face < 1 || face > 6) {
    throw new Error("Kostka daje wynik od 1 do 6.");
  }
  const outcome = offer.effect.faces[face];
  await journal(gameId, seat.id, game.turn, "pole-tabela", { offer: offer.name, face }, value !== null);
  const done = await applyEffect(gameId, seat.id, outcome, `${offer.name} (${face})`, decided);
  if (!done.pending) await markResolved(gameId, offerKey(offer.name));
  await bumpRevision(gameId);
  return { offer: offer.name, face, ...done };
}

/**
 * Resolves a drawn card's script — the same act as rolling a field's table,
 * for the other place effects come from.
 *
 * One press per card rather than one per outcome. A card is a thing that
 * happens to you, and pressing "−1 Życia" after reading that a card takes a
 * point of Życie is transcription, not play. Optional cards keep the press,
 * because "Jeżeli chcesz" means the press is the decision.
 *
 * Only cards actually drawn this turn: the id comes from the browser, and the
 * turn state is what says which cards are on the field in front of you.
 */
export async function resolveDrawnCard(
  gameId: string,
  cardId: string,
  value: number | null,
  decided: Decisions = {},
): Promise<{ card: string; face?: number; did: string[]; pending: Effect | null }> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = activeSeatOf(seats, game);
  if (game.turn_state.phase !== "pole") throw new Error("Nie ma czego rozpatrywać.");
  if (!game.turn_state.drawn.some((entry) => entry.cardId === cardId)) {
    throw new Error("Tej Karty tu nie ma.");
  }

  const script = scriptFor(cardId);
  if (!script) throw new Error(`${cardName(cardId)} — tę Kartę rozpatrzcie sami.`);

  if (script.effect.op !== "rzut") {
    const done = await applyEffect(gameId, seat.id, script.effect, cardName(cardId), decided);
    if (!done.pending) await markResolved(gameId, cardId);
    await bumpRevision(gameId);
    return { card: cardName(cardId), ...done };
  }

  const face = value ?? 1 + Math.floor(Math.random() * 6);
  if (!Number.isInteger(face) || face < 1 || face > 6) {
    throw new Error("Kostka daje wynik od 1 do 6.");
  }
  await journal(gameId, seat.id, game.turn, "karta-tabela", { cardId, face }, value !== null);
  const done = await applyEffect(
    gameId,
    seat.id,
    script.effect.faces[face],
    `${cardName(cardId)} (${face})`,
    decided,
  );
  if (!done.pending) await markResolved(gameId, cardId);
  await bumpRevision(gameId);
  return { card: cardName(cardId), face, ...done };
}

/**
 * Picks a card up off the field a character is standing on (12.1).
 *
 * Distinct from `takeCard`, which lifts something out of the turn's own stack —
 * a card just drawn. This one reaches for what was already lying there: gear a
 * dead character left, something a previous visitor dropped, a Przedmiot nobody
 * could carry. Every rule about *whether* you may have it is `takeCard`'s, so
 * this establishes the right to reach and then defers.
 *
 * "Postać, której ruch kończy się na danym Obszarze" — you must be standing on
 * it, and it must be your turn, because 13.1 is explicit that nothing happens
 * on a field you merely passed through.
 */
export async function takeFromField(
  gameId: string,
  seatId: string,
  fieldCardId: string,
): Promise<void> {
  const game = await loadGame(gameId);
  const seats = await seatsFor(gameId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error("Nieznane miejsce.");
  if (seat.seat_index !== game.active_seat) throw new Error("To nie twoja tura.");

  const lying = (await fieldCardsFor(gameId)).find((row) => row.id === fieldCardId);
  if (!lying) throw new Error("Tej Karty już tam nie ma.");
  if (lying.field_id !== seat.field_id) {
    throw new Error("Można zabierać tylko z Obszaru, na którym się stoi (12.1).");
  }

  // Off the field first, so the carrying limit and 21.2's stock — both of which
  // count copies in play — do not see the same card twice.
  await db.from("field_cards").delete().eq("id", fieldCardId);
  try {
    await takeCard(gameId, seatId, lying.card_id, lying.granted);
  } catch (error) {
    // Refused for a reason of its own: put it back where it was lying, because
    // a card that cannot be picked up is a card still on the field (5.3).
    await db.from("field_cards").insert({
      game_id: gameId,
      field_id: lying.field_id,
      card_id: lying.card_id,
      granted: lying.granted,
    });
    throw error;
  }
}

/**
 * Writes a card down as dealt with for this turn.
 *
 * Not the same as taking it off the field: 16.8 leaves a resolved Spotkanie
 * lying there face up until the turn ends, so "still on the field" cannot mean
 * "still to be resolved". The same distinction `fought` makes for a Wróg.
 */
async function markResolved(gameId: string, cardId: string): Promise<void> {
  const game = await loadGame(gameId);
  if (game.turn_state.phase !== "pole") return;
  const already = game.turn_state.resolved ?? [];
  if (already.includes(cardId)) return;
  await db
    .from("games")
    .update({ turn_state: { ...game.turn_state, resolved: [...already, cardId] } })
    .eq("id", gameId);
}
