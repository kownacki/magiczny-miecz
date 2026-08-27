/** Taking a card off a pile: the Obszar's Karty Zdarzeń (15.1, 15.2), the Zaklęcia of 9.2 and 9.5, the Różdżka's refill, and what the Wyposażenie has left (21.2). */

import type { CardClass, EventCard } from "@/data/types";
import type { EventId } from "@/data/ids";
import { spellsAtSetup } from "@/lib/engine/characters";
import { drawFrom, type Shuffle } from "@/lib/engine/deck";
import { plural } from "@/lib/engine/polish";
import { wandRefills } from "@/lib/engine/derive";
import { PRINTED_STOCK, stockLeft } from "@/lib/engine/stock";
import { afterDraw } from "@/lib/engine/turn";
import { BY_REF, EVENTS, SPELL_BY_REF, decksOf } from "../decks";
import type { Changeset, Outcome, Snapshot } from "../change";
import { activeSeat, holdingsOf, seatById, seatView } from "./seat";

/* --------------------------------------------------------------------------
 * Where the reshuffle's order comes from.
 * ----------------------------------------------------------------------- */

/**
 * The order the used pile comes back in when a draw empties the other one.
 *
 * `drawFrom` needs a `Shuffle` because 9.5 and 15.5 turn the used pile over
 * and deal from it again, and that is randomness — which a command may not
 * reach for. The only randomiser a command has is `RandomPort`, and it deals
 * in single dice.
 *
 * Two ways out, and this is the first: the caller shuffles and hands the order
 * in, exactly the bargain `startGame` already makes with `{ decks }`. The rule
 * decides *whether* the pile is turned over; the edge decides what order it
 * comes back in. `decks.ts` binds `shuffleWith(Math.random)` at module load,
 * which is the one thing in this layer a test cannot reach past — as an
 * argument it is reachable, and a test can lay the recycled pile out in a
 * known order and assert the exact card that comes up.
 *
 * The second way — Fisher-Yates fed by d6 digits, the way `pickBelow` builds a
 * single pick in `character.ts` — was not taken. It would cost three dozen
 * rolls per shuffled pile, and every one of them would go through
 * `scriptedRandom` in a test: driving one reshuffle would mean scripting a
 * couple of hundred numbers to find out which card came up, which is not a
 * test anybody writes. What it would buy is a reshuffle that replays
 * identically after a losing commit (see `replayable`). That is worth less
 * than it looks: a retry re-reads the snapshot, so it is not even the same
 * pile being turned over, and unlike a die nobody has seen the discarded
 * attempt's card.
 *
 * One thread of the old binding is still attached and cannot be cut from here:
 * `decksOf` builds a pile with `decks.ts`'s module-level `shuffle` when the
 * stored row has none — a game opened before the spell pile existed, or a
 * simulation whose `deck` is somehow null. Neither branch is reachable through
 * a companion table, which refuses before the piles are read, so in practice
 * only a legacy row can find it. Closing it means `decksOf` taking a `Shuffle`
 * too, which is `decks.ts`'s change and not this file's.
 */
export interface FromThePile {
  shuffle: Shuffle;
}

/* --------------------------------------------------------------------------
 * A Karta Zdarzeń.
 * ----------------------------------------------------------------------- */

export interface DrawCard extends FromThePile {
  /**
   * The card a player at a physical table named, because the physical deck
   * decided. Null in simulation, where the app owns the pile and draws itself.
   *
   * This is the whole of the distinction between the two modes, and the only thing
   * either branch differs by: both end with a card added to the turn's stack in
   * 15.2 order.
   */
  named: { cardId: string; cardClass: CardClass } | null;
}

export interface Drawn {
  /** Null when the table named a card the app has never been told about. */
  card: EventCard | null;
  /** True when 15.5 had to turn the used pile over to answer the draw. */
  recycled: boolean;
}

/**
 * Draws one Karta Zdarzeń into the turn (15.1, 15.2).
 *
 * The ordering of a field that draws several is not done here and must not be:
 * `afterDraw` runs `resolutionOrder` over the whole stack each time a card
 * joins it, so a Wróg drawn second still resolves before a Przedmiot drawn
 * first (15.2, 16.4). Drawing twice is therefore two calls — and because both
 * of them write `game.deck`, a caller making them must chain through
 * `apply(snapshot, soFar)` rather than merging the two changesets side by side,
 * which would silently keep only the second pile.
 */
export function drawCard(snapshot: Snapshot, command: DrawCard): Outcome<Drawn> {
  const seat = activeSeat(snapshot);
  if (snapshot.game.turn_state.phase !== "field") {
    throw new Error("Nie czas na ciągnięcie kart (13.4).");
  }

  if (snapshot.game.mode === "companion") {
    const named = command.named;
    if (!named) throw new Error("Podaj nazwę wyciągniętej karty.");
    return {
      writes: {
        game: { turn_state: afterDraw(snapshot.game.turn_state, named) },
        journal: [
          {
            seatId: seat.id,
            turn: snapshot.game.turn,
            kind: "card",
            payload: { ...named, source: "fizyczna" },
          },
        ],
      },
      // A companion table may name a card nobody has transcribed yet; that is
      // the referee being usable before the deck is finished, not an error.
      result: { card: EVENTS.find((c) => c.id === named.cardId) ?? null, recycled: false },
    };
  }

  const decks = decksOf(snapshot.game);
  const { deck: after, drawn, recycled } = drawFrom(decks.events, 1, command.shuffle);
  if (drawn.length === 0) throw new Error("Talia Kart Zdarzeń jest pusta.");

  const card = BY_REF.get(drawn[0]);
  if (!card) throw new Error(`Nieznana karta w talii: ${drawn[0]}`);

  // Plainly built, not chained: the turn state is derived from the phase the
  // snapshot was read at and the deck from the pile it was read with, so
  // neither half of this `game` patch reads what the other writes.
  const recycledLine: Changeset["journal"] = recycled
    ? [
        // 15.5, and 9.5 in the same words for the other pile: "Jeśli stos
        // zostanie wyczerpany, tasuje się Karty ... już użyte i korzysta z nich
        // ponownie." At a table that is the loudest thing that happens all
        // evening, and it used to happen in silence.
        { seatId: null, turn: snapshot.game.turn, kind: "reshuffle", payload: { pile: "zdarzenia" } },
      ]
    : [];

  return {
    writes: {
      game: {
        turn_state: afterDraw(snapshot.game.turn_state, {
          cardId: card.id,
          cardClass: card.cardClass,
          ref: drawn[0],
        }),
        deck: { ...decks, events: after },
      },
      journal: [
        ...recycledLine,
        {
          seatId: seat.id,
          turn: snapshot.game.turn,
          kind: "card",
          payload: { cardId: card.id, ref: drawn[0], source: "talia", recycled },
        },
      ],
    },
    result: { card, recycled },
  };
}

/* --------------------------------------------------------------------------
 * A Zaklęcie.
 * ----------------------------------------------------------------------- */

export interface DrawSpell extends FromThePile {
  seatId: string;
}

/**
 * Deals a Zaklęcie to a seat, if its Magia allows one more (2.6, 9.2).
 *
 * The capacity check is the rule that actually bites: a character with Magia 1
 * may hold no spells at all, and one that gains a spell it cannot hold must
 * shed the excess immediately (9.4).
 *
 * 9.3 is why the card goes in face down — it is the only kind of holding the
 * other players may not see — and 9.5 is why an exhausted pile is not the end
 * of it.
 */
export function drawSpell(snapshot: Snapshot, command: DrawSpell): Outcome<string> {
  const seat = seatById(snapshot, command.seatId);
  const mine = holdingsOf(snapshot, seat.id);
  const held = mine.filter((h) => h.kind === "spell").length;

  // "Właściciel Różdżki" — owning it is the whole condition, so the pack counts
  // as much as the body does, in either eq variant. See `fromCards`.
  const capacity = seatView(snapshot, seat.id).spellCapacity;

  if (held >= capacity) {
    // Polish numerals agree with the noun: 2-4 take "Zaklęcia", 5 and up take
    // "Zaklęć". The capacity table tops out at 3, so both forms occur.
    // Was a two-way ternary with no branch for one, so a Magia of 2 — capacity
    // one — read "najwyżej 1 Zaklęć". The rule has three forms and `plural`
    // knows all three.
    const noun = plural(capacity, "Zaklęcie", "Zaklęcia", "Zaklęć");
    throw new Error(
      capacity === 0
        ? "Magia tej Postaci nie pozwala na żadne Zaklęcia (2.6)."
        : `Ta Postać może mieć najwyżej ${capacity} ${noun} (2.6).`,
    );
  }

  if (snapshot.game.mode === "companion") {
    throw new Error("Przy planszy Zaklęcia ciągnie się z fizycznego stosu.");
  }

  const decks = decksOf(snapshot.game);
  const { deck: after, drawn, recycled } = drawFrom(decks.spells, 1, command.shuffle);
  if (drawn.length === 0) throw new Error("Stos Kart Zaklęć jest pusty.");
  const spell = SPELL_BY_REF.get(drawn[0]);
  if (!spell) throw new Error(`Nieznane Zaklęcie: ${drawn[0]}`);

  const recycledLine: Changeset["journal"] = recycled
    ? [
        // 9.5 in as many words: "Jeśli stos zostanie wyczerpany, tasuje się
        // Karty Zaklęć już użyte i korzysta z nich ponownie."
        { seatId: null, turn: snapshot.game.turn, kind: "reshuffle", payload: { pile: "zaklecia" } },
      ]
    : [];

  return {
    writes: {
      game: { deck: { ...decks, spells: after } },
      holdings: {
        insert: [
          {
            seat_id: seat.id,
            card_id: spell.id,
            kind: "spell",
            // Concealed from the other players (9.3).
            face: "hidden",
          },
        ],
      },
      journal: [
        ...recycledLine,
        { seatId: seat.id, turn: snapshot.game.turn, kind: "spell", payload: { spellId: spell.id } },
      ],
    },
    result: spell.id,
  };
}

/**
 * The Karta the rule below is printed on.
 *
 * Named rather than matched by shape because 9.5's refill is the card's own
 * second clause and no other card in the box has one.
 */
const ROZDZKA_ZAKLEC: EventId = "rozdzka-zaklec";

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
export function drawSpellWithWand(snapshot: Snapshot, command: DrawSpell): Outcome<string> {
  const seat = seatById(snapshot, command.seatId);
  const mine = holdingsOf(snapshot, seat.id);

  const hasWand = mine.some((h) => h.kind !== "trophy" && h.cardId === ROZDZKA_ZAKLEC);
  if (!hasWand) throw new Error("Ta Postać nie ma Różdżki Zaklęć.");

  const setup = spellsAtSetup(seat.character_id);
  const held = mine.filter((h) => h.kind === "spell").length;
  if (!wandRefills(held, setup)) {
    throw new Error(
      setup === 0
        ? "Różdżka daje nowe Zaklęcie dopiero, gdy nie masz żadnego."
        : `Różdżka daje nowe Zaklęcie dopiero, gdy masz najwyżej ${setup} (tyle, co na początku gry).`,
    );
  }

  // Everything else — the pile, the empty-stack case, the face-down hand of
  // 9.3, the journal line — is the same draw as any other, so it is the same
  // code. `spellAllowance` has already made room for this one by definition:
  // being at or below the setup hand is being below the floor the wand sets.
  return drawSpell(snapshot, command);
}

/* --------------------------------------------------------------------------
 * What the Wyposażenie has left.
 * ----------------------------------------------------------------------- */

/**
 * All the shop count ever looks at.
 *
 * Narrower than a whole `Snapshot`, the way `piles.ts` narrows to the game row
 * and for the same reason: the one caller is the table-state read, which
 * already holds both lists and would otherwise fetch them a second time on a
 * request every device makes every couple of seconds. A `Snapshot` satisfies
 * this too.
 */
interface Counted {
  holdings: readonly { card_id: string }[];
  fieldCards: readonly { card_id: string }[];
}

/**
 * What the Wyposażenie pile still has, for every card on it (21.2).
 *
 * Arithmetic over the copies in play rather than a counter, which is the whole
 * of 21.2: bought equipment goes back on its pile instead of being discarded,
 * so the number left is what the box printed minus what is somewhere in the
 * game — held by anybody, or lying face up on a field where somebody left it
 * (12.1, 16.8). A tally can drift out of step with the board; this cannot.
 *
 * Not an `Outcome`: nothing here writes, and nothing here reads a die or the
 * clock. It is a question the table-state read asks so a shop can show what it
 * has rather than offering something that will be refused.
 */
export function shopStock(snapshot: Counted): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const cardId of Object.keys(PRINTED_STOCK)) {
    const inPlay =
      snapshot.holdings.filter((h) => h.card_id === cardId).length +
      snapshot.fieldCards.filter((c) => c.card_id === cardId).length;
    stock[cardId] = stockLeft(cardId, inPlay);
  }
  return stock;
}
