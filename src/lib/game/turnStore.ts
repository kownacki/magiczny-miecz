/** Applies turn actions against the database, journalling each one so a wrong call at the table can be seen and undone. */

import {
  fieldCardsFor,
  type HoldingRow,
} from "./store";
import {
  type FieldId,
} from "@/lib/engine/board";
import {
  endFight,
} from "@/lib/engine/turn";
import type { CardClass, EventCard } from "@/data/types";
import { combatValueOf } from "@/lib/engine/cards";
import { type Effect } from "@/lib/engine/cardScript";
import {
  afterFight,
  type Ends,
  type Modifier,
  type Status,
} from "@/lib/engine/status";
import {
  EVENTS,
  freshDecks,
  shuffle,
  type Decks,
} from "./decks";
import {
  change,
  effectRowsFor,
  type EffectRow,
} from "./change";
import { appRandom, supplied } from "./random";
import {
  addEffect as addEffectTo,
  keepOnly as keepOnlyIn,
  passTurn,
  statusesOf as statusesIn,
  tickEffects as tickEffectsOf,
} from "./commands/turn";
import { healSeat as healCommand } from "./commands/life";
import { fightBeast as fightBeastCommand } from "./commands/beast";
import {
  applyEffect as applyEffectOn,
  resolveDrawnCard as resolveDrawnCardOn,
  resolveFieldOffer as resolveFieldOfferOn,
  spendHolding as spendHoldingOn,
  type Decisions,
  type Resolution,
  type UseResult,
} from "./commands/effects";
import {
  attackSeat as attackSeatOn,
  beginFight as beginFightOn,
  castSpell as castSpellOn,
  escape as escapeOn,
  fightRoll as fightRollOn,
  resolveFight as resolveFightOn,
  setFightPlayerTotal as setFightPlayerTotalOn,
} from "./commands/fight";
import {
  crossRing as crossRingOn,
  enterBridge as enterBridgeOn,
  fightGuardian as fightGuardianOn,
  payFerry as payFerryOn,
  resolveBridgeOrdeal as resolveBridgeOrdealOn,
  rollGuardianStrength as rollGuardianStrengthOn,
  type BridgeOrdealResult,
  type BridgeOutcome,
  type CrossOutcome,
} from "./commands/bridge";
import { claimFloor, releaseFloor } from "./commands/spellFloor";
import { adjustSeat, type Adjustable, type Adjusted } from "./commands/adjust";
import type { JournalKind } from "@/lib/engine/journal";
import {
  dropCard as dropCardOn,
  equipCard as equipCardOn,
  grantCard as grantCardOn,
  placeCard as placeCardOn,
  reorderPack as reorderPackOn,
  takeCard as takeCardOn,
  takeFromField as takeFromFieldOn,
} from "./commands/holdings";
import {
  drawCard as drawCardOn,
  drawSpell as drawSpellOn,
  drawSpellWithWand as drawSpellWithWandOn,
  shopStock as countStock,
} from "./commands/draw";
import {
  moveTo as moveToOn,
  rollForMove as rollForMoveOn,
  startGame as startGameOn,
} from "./commands/movement";
import {
  changeNature as changeNatureOn,
  dealCharacters as dealCharactersOn,
  placeSeat as placeSeatOn,
  takeNewCharacter as takeNewCharacterOn,
} from "./commands/character";
import { STONE_TURNS, turnToStone as turnToStoneOn } from "./commands/stone";
import {
  removeCharacter as removeCharacterOn,
  reviveCharacter as reviveCharacterOn,
  type Removed,
} from "./commands/withdraw";
import {
  TROPHY_RATE,
  buyGoods as buyGoodsFor,
  payHealer as payHealerFor,
  sellHolding as sellHoldingFor,
  tradeTrophies as tradeTrophiesFor,
} from "./commands/shop";

// Still this module's published surface while the rest of the store moves
// across; both now live in `decks.ts`.
export { freshDecks };
export type { Adjustable, Adjusted };
export { STONE_TURNS, TROPHY_RATE };
export type { BridgeOrdealResult, BridgeOutcome, CrossOutcome };
export type { Decisions, Resolution, UseResult };
export type { Decks };


/**
 * The one Zaklęcie the rules name inside another rule.
 *
 * 19.1 does not say "a spell that lets you escape" — it says the Krąg Płomieni,
 * by name, and it is the only way in the game to slip away from another Postać.
 * So it is looked up here rather than left to the generic casting path, which
 * has nowhere to put a mechanical effect.
 */

/**
 * How many Zaklęcia a character was dealt at setup (9.5).
 *
 * The Różdżka Zaklęć is measured against this rather than against 2.6's table,
 * so the limit cannot be worked out from Magia alone — see `spellAllowance`.
 * A stored `character_id` is narrowed on the way in, and an unseated seat has
 * no starting hand.
 */


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



/**
 * Both piles a simulated game deals from.
 *
 * Kept separate because they recycle separately: rule 9.5 says the Spell pile
 * is reshuffled from used spells when it runs out, and the event deck does the
 * same for its own discards. Merging them would let a spent Zaklęcie come back
 * as a Karta Zdarzeń.
 */


/** Reads the stored decks, tolerating a game started before spells existed. */
import type { Slot } from "@/lib/engine/slots";
import { holdingsFor } from "./store";

/**
 * A stored row as the engine wants it — including where it is worn, which every
 * one of these call sites used to drop on the floor while building the same
 * object by hand.
 */

export async function startGame(gameId: string): Promise<void> {
  // Everybody who asked to be surprised finds out now, and not a moment
  // earlier — the sentinel sits in the seat for the whole poczekalnia so that
  // no device, the player's included, can see what is coming. Its own commit,
  // ahead of the one below: a seat still holding the sentinel when the start
  // reads the table would be dealt no kit at all.
  await change(gameId, dealCharactersOn, { to: "surprises" });

  const owed = await change(gameId, startGameOn, { decks: freshDecks() });
  // 9.5's deal, run through the same draw as every other Zaklęcie so that the
  // pile, the reshuffle and the journal line are the one implementation.
  for (const seat of owed) {
    for (let n = 0; n < seat.spells; n++) await drawSpell(gameId, seat.seatId);
  }
}



/**
 * Records the movement roll.
 *
 * `value` is supplied when the table is rolling physical dice — the RandomPort
 * bound to a human. The server still validates the range, because a mistyped 8
 * would otherwise walk a character off the ring.
 */
export async function rollForMove(gameId: string, value: number | null): Promise<void> {
  await change(gameId, rollForMoveOn, { manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
}

export async function moveTo(
  gameId: string,
  destination: string,
  viaBridge = false,
): Promise<void> {
  await change(gameId, moveToOn, { destination, viaBridge });
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


/**
 * Records a drawn card.
 *
 * Companion mode is told which card came up, because the physical deck decided.
 * Simulation mode draws one itself. Both end in the same place — a card added
 * to the turn's stack in rule 15.2 order — which is the whole of the distinction
 * made concrete.
 */
export async function drawCard(
  gameId: string,
  named: { cardId: string; cardClass: CardClass } | null,
): Promise<{ card: EventCard | null; recycled: boolean }> {
  return change(gameId, drawCardOn, { named, shuffle });
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
  return change(gameId, drawSpellWithWandOn, { seatId, shuffle });
}

export async function drawSpell(gameId: string, seatId: string): Promise<string> {
  return change(gameId, drawSpellOn, { seatId, shuffle });
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
  return countStock(
    known ?? {
      holdings: await holdingsFor(gameId),
      fieldCards: await fieldCardsFor(gameId),
    },
  );
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
  await change(gameId, claimFloor, { seatId });
}

/**
 * Gives the floor back without using it.
 *
 * Reaching for a card and thinking better of it is a move somebody makes at a
 * table, and holding everybody up for the rest of the half-minute after
 * deciding is not.
 */
export async function releaseSpellFloor(gameId: string, seatId: string): Promise<void> {
  await change(gameId, releaseFloor, { seatId });
}

export async function beginFight(gameId: string, cardIds: string[]): Promise<void> {
  await change(gameId, beginFightOn, { cardIds });
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
  const card = EVENTS.find((c) => c.id === cardId);
  if (!card) throw new Error(`Nieznana karta: ${cardId}`);
  if (!combatValueOf(card)) throw new Error(`${card.name} nie jest Wrogiem.`);

  // Through `change`, like everything else that writes a game. It used to read
  // the row, work out a turn_state and write it straight back — the
  // read-modify-write with nothing checking that the row had not moved
  // underneath, which is the one shape the whole `change` machinery exists to
  // stop. Being a test path is no excuse: it writes the same column the game
  // does, and a test that corrupts a table is worse than no test.
  await change(
    gameId,
    (snapshot) => {
      const seat = snapshot.seats.find((s) => s.id === seatId);
      if (!seat) throw new Error("Nieznane miejsce.");
      if (seat.seat_index !== snapshot.game.active_seat) throw new Error("To nie twoja tura.");
      if (!seat.field_id) throw new Error("Postać nie stoi na żadnym polu.");
      return {
        // The field as it would be if the card had just been drawn there, minus
        // the draw: nothing leaves the deck, so a staged fight does not thin it.
        writes: {
          game: {
            turn_state: {
              phase: "field" as const,
              fieldId: seat.field_id,
              from: null,
              draw: 0,
              // Marked, because it was not drawn: `stageFight` reaches past the
              // deck and the deck still holds this Wilkołak. Everything that
              // draws the card from here on says so.
              drawn: [{ cardId: card.id, cardClass: card.cardClass, granted: true }],
              fought: [],
            },
          },
        },
        result: undefined,
      };
    },
    undefined,
  );
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
  await change(
    gameId,
    (snapshot) => {
      const state = snapshot.game.turn_state;
      if (state.phase !== "fight") throw new Error("Nie ma walki.");
      const seat = snapshot.seats.find((s) => s.seat_index === snapshot.game.active_seat);
      const { cardName } = state.fight;
      return {
        // `endFight` puts the character back on its field with the fight's
        // creatures already in `fought` — startFight settles them the moment it
        // opens — so the field resumes with nothing outstanding rather than
        // offering the same creature again the moment the modal closes.
        writes: {
          game: { turn_state: endFight(state) },
          ...(seat
            ? {
                journal: [
                  {
                    seatId: seat.id,
                    turn: snapshot.game.turn,
                    kind: "test-fight-end" as const,
                    payload: { cardName },
                    manual: true,
                  },
                ],
              }
            : {}),
        },
        result: undefined,
      };
    },
    undefined,
  );
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

export async function castSpell(
  gameId: string,
  seatId: string,
  holdingId: string,
  target: { seatIndex?: number; note?: string; fieldCardId?: string } = {},
): Promise<{ spell: string; effect: string }> {
  return change(gameId, castSpellOn, { seatId, holdingId, target });
}

export async function setFightPlayerTotal(gameId: string, total: number): Promise<void> {
  await change(gameId, setFightPlayerTotalOn, { total });
}

export async function fightRoll(
  gameId: string,
  side: "player" | "enemy",
  value: number | null,
): Promise<void> {
  await change(gameId, fightRollOn, { side, manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
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
  await change(gameId, resolveFightOn, undefined);
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

export async function takeCard(
  gameId: string,
  seatId: string,
  cardId: string,
  /** Set when this card came off a field that was holding a granted one. */
  granted = false,
): Promise<void> {
  const taken = await change(gameId, takeCardOn, { seatId, cardId, granted });
  // A Sztuka Złota is not luggage — taking it resolves it. The command does the
  // writes it owns and hands back the script rather than guessing at a rule
  // `applyEffect` owns.
  if (taken.resolve) {
    await applyEffect(gameId, seatId, taken.resolve.effect, taken.resolve.reason);
  }
}

/**
 * Drops a held card.
 *
 * Rule 5.5 lets a character discard an item at any moment, and 5.6 forces it
 * when over the carrying limit. Either way the card leaves the hand; where it
 * physically goes is the players' business at a table and not tracked yet.
 */
export async function dropCard(gameId: string, holdingId: string): Promise<void> {
  await change(gameId, dropCardOn, { holdingId });
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

export async function effectsFor(gameId: string): Promise<EffectRow[]> {
  return effectRowsFor(gameId);
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
  await change(
    gameId,
    (snapshot) => ({ writes: addEffectTo(snapshot, { seatId, effect }), result: undefined }),
    undefined,
  );
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

/** One of this seat's own turns has gone by (see `afterTurn`). */
export async function tickEffects(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: tickEffectsOf(snapshot, seatId), result: undefined }),
    undefined,
  );
}

/** A fight has finished, however it finished (17.4). */
export async function clearFightEffects(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({
      writes: keepOnlyIn(snapshot, seatId, afterFight(statusesIn(snapshot, seatId))),
      result: undefined,
    }),
    undefined,
  );
}

export async function reorderPack(
  gameId: string,
  seatId: string,
  holdingIds: readonly string[],
): Promise<void> {
  await change(gameId, reorderPackOn, { seatId, holdingIds });
}


export async function spendHolding(gameId: string, holdingId: string): Promise<UseResult> {
  return change(gameId, spendHoldingOn, { holdingId, shuffle });
}

/**
 * Trades trophies for a point of Miecz.
 *
 * Rule 1.4: seven points' worth of defeated Wrogowie buys one point of Miecz,
 * and anything past a multiple of seven is lost. The traded cards go to the
 * used pile.
 */

export async function tradeTrophies(gameId: string, seatId: string): Promise<number> {
  return change(gameId, tradeTrophiesFor, { seatId });
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

export async function adjust(
  gameId: string,
  seatId: string,
  stat: Adjustable,
  delta: number,
  reason: string | null,
  record: { kind: JournalKind; manual: boolean } = { kind: "override", manual: true },
  force = false,
): Promise<Adjusted> {
  return change(gameId, adjustSeat, { seatId, stat, delta, reason, record, force });
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
export async function healSeat(
  gameId: string,
  seatId: string,
  amount = 1,
): Promise<number> {
  return change(gameId, healCommand, { seatId, amount });
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
  nature: "good" | "evil" | "chaotic",
  force = false,
): Promise<{ nowForbidden: string[] }> {
  return change(gameId, changeNatureOn, { seatId, nature, force });
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

/**
 * Turns a character to stone for three turns (20.1).
 *
 * While stone it cannot move (20.4), holds nothing (20.2) and cannot be robbed
 * of a point of Życie (20.5). Its Miecz and Magia are unchanged but unusable
 * (20.3), which is why nothing is written to them here — the seat is simply
 * skipped in turn order until the timer runs out.
 */

export async function turnToStone(gameId: string, seatId: string): Promise<void> {
  await change(
    gameId,
    (snapshot) => ({ writes: turnToStoneOn(snapshot, { seatId }), result: undefined }),
    undefined,
  );
}

/**
 * A Postać out of the game, and everything it carried onto its Obszar (12.1).
 *
 * `byId` null is the console, which may also take a *dead* one off 4.4's list —
 * see `removeCharacter` for why that is a different permission from the rest.
 */
export async function removeCharacter(
  gameId: string,
  seatId: string,
  hard: boolean,
  byId: string | null,
): Promise<Removed> {
  return change(gameId, removeCharacterOn, { seatId, hard, byId });
}

/** A dead Postać standing up again, where it fell. Console-only. */
export async function reviveCharacter(gameId: string, seatId: string): Promise<string> {
  return change(gameId, reviveCharacterOn, { seatId });
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
  await change(gameId, attackSeatOn, { targetSeatId });
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
  await change(gameId, fightGuardianOn, undefined);
}

/** Throws the die that gives a bridge guardian its Miecz or Magia (5 to 10). */
export async function rollGuardianStrength(
  gameId: string,
  value: number | null,
): Promise<{ strength: number }> {
  return change(gameId, rollGuardianStrengthOn, { manual: value !== null }, {
    random: supplied([value], appRandom()),
  });
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
  return change(gameId, payFerryOn, { pay });
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

/**
 * Applies the result of a crossing between rings (11.4, 11.8).
 *
 * Failure costs a point of Życie and stops the journey. A draw costs nothing
 * but still stops it. Either way the character stays put and may try again next
 * turn, which 11.4 says is exactly what the next turn is for.
 */

/**
 * The table reporting how a bridge guardian went, where it is not being fought
 * through the app — companion mode with the creature resolved on the table.
 */

export async function enterBridge(
  gameId: string,
  outcome: BridgeOutcome,
): Promise<{ at: string | null }> {
  return change(gameId, enterBridgeOn, { outcome });
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

export async function crossRing(
  gameId: string,
  input: { outcome?: CrossOutcome; dice?: number[] | null } = {},
): Promise<{ to: string | null; outcome: CrossOutcome; dice?: number[]; magia?: number }> {
  return change(gameId, crossRingOn, { outcome: input.outcome }, {
    random: supplied(input.dice ?? [], appRandom()),
  });
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
  reported: boolean | null,
  actorSeatId: string | null = null,
): Promise<{ succeeded: boolean; onBridge: boolean }> {
  return change(gameId, escapeOn, { reported, actorSeatId });
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
  // The four dice in the order the command asks for them. This is the whole of
  // what `die_source` decides, and it is decided here rather than fifteen times
  // inside the rules.
  await change(gameId, fightBeastCommand, undefined, {
    random: supplied([kindRoll, strengthRoll, playerRoll, beastRoll], appRandom()),
  });
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
  await change(
    gameId,
    (snapshot) => ({ writes: passTurn(snapshot), result: undefined }),
    undefined,
  );
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
  await change(gameId, equipCardOn, { holdingId, slot });
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

export async function resolveBridgeOrdeal(
  gameId: string,
  input: { dice?: number[]; itemRolls?: number[] } = {},
): Promise<BridgeOrdealResult> {
  return change(gameId, resolveBridgeOrdealOn, undefined, {
    random: supplied([...(input.dice ?? []), ...(input.itemRolls ?? [])], appRandom()),
  });
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
  /** The seat whose device is asking — see `mayChooseFor`. */
  byId: string,
): Promise<void> {
  const owed = await change(gameId, takeNewCharacterOn, { seatId, characterId, byId });
  for (let n = 0; n < owed.spells; n++) await drawSpell(gameId, owed.seatId);
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

/** The seat acting, with the field it is standing on. */

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
  const bought = await change(gameId, buyGoodsFor, { seatId, cardId });
  if (bought.resolve) {
    await applyEffect(gameId, seatId, bought.resolve.effect, bought.resolve.reason);
  }
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
  await change(gameId, sellHoldingFor, { seatId, holdingId });
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
  return change(gameId, payHealerFor, { seatId, points });
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
 * Leaves a card lying on a field, out of nowhere.
 *
 * `grantCard`'s counterpart, and the other half of the same shortcut: that one
 * reaches a state where somebody holds a card, this one a state where a card is
 * waiting to be found. 12.1's worked example is built on gear lying on a field,
 * a dead character's pack is delivered this way, and 16.8 leaves resolved
 * Spotkania there — all of it reachable before now only by playing up to it or
 * by killing somebody.
 *
 * Not a Zaklęcie. 9.6 sends a spent spell to the used pile and nothing in the
 * box puts one on the board; `dropHolding` makes the same exception, and a
 * Zaklęcie lying on a field would be a card the field modal knows how to draw
 * and no rule knows how to pick up.
 *
 * `granted` travels with it, as everywhere else: picked up by somebody, a card
 * that appeared by fiat must not re-enter the game as a real one and reach a
 * pile the next time it is put down.
 */
export async function placeCard(
  gameId: string,
  seatId: string,
  cardId: string,
  target: FieldId | null,
): Promise<FieldId> {
  return change(gameId, placeCardOn, { seatId, cardId, target });
}

export async function grantCard(gameId: string, seatId: string, cardId: string): Promise<void> {
  await change(gameId, grantCardOn, { seatId, cardId });
}

export async function placeSeat(
  gameId: string,
  seatId: string,
  target: string,
  reason: string | null,
): Promise<void> {
  await change(gameId, placeSeatOn, { seatId, target, reason });
}

/**
 * Opens a fight with a creature a card names rather than one lying on a field.
 *
 * The Karczma's "miejscowy osiłek (Miecz 4)" is nowhere in the deck: he is a
 * line on the board with a number after him. `beginFight` starts from a card
 * id, so it cannot be used, but everything after that — the totals, the two
 * dice, 17.4's point of Życie — is the same fight.
 */

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
/**
 * How many of a thing, in Polish.
 *
 * Miecz, Magia and Życie take the same form whatever the number — "+2 Życia" —
 * but Złoto declines: one Sztukę, two to four Sztuki, five and up Sztuk. The
 * deltas in this game are almost always one, which is exactly the case a single
 * fixed form gets wrong.
 */

/**
 * Applies one effect to one seat, as far as it goes.
 *
 * Not a pure function and deliberately not in the engine: it writes seats,
 * draws Zaklęcia and opens fights. What *is* pure is the decision about whether
 * a thing can be applied at all, and that lives in `resolve.ts` where it can be
 * tested against every card in the box.
 */
/** A seat row as the target rules see it: where it stands, what it is, whether it is still playing. */

export async function applyEffect(
  gameId: string,
  seatId: string,
  effect: Effect,
  reason: string,
  decided: Decisions = {},
): Promise<Resolution> {
  return change(gameId, applyEffectOn, { seatId, effect, reason, decided, shuffle });
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
  return change(gameId, resolveFieldOfferOn, {
    offerName,
    decided,
    manual: value !== null,
    shuffle,
  }, { random: supplied([value], appRandom()) });
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
  return change(gameId, resolveDrawnCardOn, {
    cardId,
    decided,
    manual: value !== null,
    shuffle,
  }, { random: supplied([value], appRandom()) });
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
  const taken = await change(gameId, takeFromFieldOn, { seatId, fieldCardId });
  if (taken.resolve) {
    await applyEffect(gameId, seatId, taken.resolve.effect, taken.resolve.reason);
  }
}

/**
 * Writes a card down as dealt with for this turn.
 *
 * Not the same as taking it off the field: 16.8 leaves a resolved Spotkanie
 * lying there face up until the turn ends, so "still on the field" cannot mean
 * "still to be resolved". The same distinction `fought` makes for a Wróg.
 */
