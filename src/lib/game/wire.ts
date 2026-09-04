/** What crosses the wire from the table to a device: the Envelope's types, declared once and imported by both ends. */

/**
 * Why one file, and why here.
 *
 * `envelope.ts` built the Envelope and the browser declared what it received,
 * and nothing compared the two. They disagreed in five places — `spell_capacity`
 * was nullable on the way out and a `number` on arrival, a card's `kind` was a
 * `string` here and a union there, and an index signature on the seat let
 * eighteen fields the browser named go unchecked. The same shape of bug
 * `requests.ts` exists to stop, in the other direction.
 *
 * So the types live here, with no logic and no imports beyond other types, and
 * both ends import them: `envelopeFor` returns an `Envelope` and `useTable`
 * reads one. A field added on one side and not the other is now a compile
 * error rather than a poll that quietly reads `undefined`.
 *
 * Ids are narrowed on the way *in* here — a `CardId`, a `FieldId` — because the
 * rows come out of the store as strings and the browser is the last place that
 * should be asked to trust one. See the non-negotiable in CLAUDE.md.
 */

import type { CardId } from "@/data/ids";
import type { FieldId } from "@/lib/engine/board";
import type { TurnState } from "@/lib/engine/stack";
import type { Slot } from "@/lib/engine/slots";
import type { GameRow, HoldingRow, SeatRow } from "./store";

/** A card as the wire carries it — the row id travels, because two can be alike. */
export interface EnvelopeCard {
  id: string;
  cardId: CardId;
  kind: HoldingRow["kind"];
  face: HoldingRow["face"];
  /** Where it is worn in the slotted variant; null when it is in the pack. */
  slot: Slot | null;
  /** Conjured by the test console — marked on the card, not just in the journal. */
  granted: boolean;
}

/** One line of what a seat is under, already worked out into words and a mark. */
export interface EnvelopeEffect {
  id: string;
  /** The card that put it there, where a card did. */
  source: string | null;
  glyph: string;
  tone: "dobry" | "zly" | "obojetny";
  /** `label — when`, for a hover and for anywhere one line is all there is. */
  title: string;
  /** The card's own words for it, in the language the cards use. */
  label: string;
  /**
   * How long it has left, and the round it lapses in where there is one.
   *
   * Composed on the server, because working it out needs the whole turn order
   * walked forward and the browser is sent one seat at a time.
   */
  when: string;
  /** How many applications this row stands for — two Kręgi Płomieni are one row. */
  count: number;
  /** What the second and later ones did. Only worth saying when `count > 1`. */
  stacking: "sums" | "queues" | "refreshes" | "exclusive";
  /**
   * Whether the round in `when` was read off a column or worked out.
   *
   * `prognoza` means the turn order was walked to get there, and the next Karta
   * drawn can move it. Null where the effect has no round at all — Fatum until
   * somebody speaks Władca Zaklęć, a Świątynia's hold until a die — which is a
   * thing the panel must not paper over with a number.
   */
  certainty: "pewne" | "prognoza" | null;
}

/**
 * A seat as every device sees it: the row, and what is worked out from it.
 *
 * The row's own columns travel as they are. What is added is either about the
 * *person* driving the chair — a pointer, since a chair outlives everybody who
 * sits in it — or a reading the server makes so that every device agrees:
 * totals, the spell cap, why the rack is shut, who is present.
 */
export interface EnvelopeSeat extends SeatRow {
  /** The driver's name, and null for an empty chair. */
  player_name: string | null;
  /** Whoever is driving this chair, and null when nobody is. */
  driver_id: string | null;
  /** True only of a driver heard from once and then silent — a closed tab, not a decision. */
  away: boolean;
  /** What this viewer may see (9.3); the rest is counted in `hidden_count`. */
  holdings: EnvelopeCard[];
  hidden_count: number;
  /** Own points plus everything carried (1.5, 2.5) — the number on the card. */
  sword_total: number;
  magic_total: number;
  /** 2.6's cap, or null when the console has taken it off for this seat. */
  spell_capacity: number | null;
  /** Why no Zaklęcie may be spoken at all right now — see `whyNoSpells`. */
  spells_blocked: string | null;
  /** The last act of aggression, in words, or null — see `describeAggression`. */
  aggression: string | null;
  /** What it becomes when somebody swings — 1.5's other figure. */
  sword_in_fight: number;
  magic_in_fight: number;
  /** The Przyjaciel swinging instead of the character, or null for the usual case. */
  fights_for_you: CardId | null;
  effects: EnvelopeEffect[];
}

/**
 * Somebody at the table, as every device may see them.
 *
 * Public, all of it: who is here, what they are called, which chair they are
 * in, who runs the table and who has said they are ready are the things people
 * read off each other across a table, and none of them is a secret under 9.3.
 *
 * `device_id` is not here and never travels. It says which *browser* somebody
 * is, which is a fact about a person's machine rather than about the game, and
 * the only thing that ever needs it is the browser it belongs to.
 */
export interface EnvelopeUser {
  /** Four characters, and the only handle somebody driving no seat has. */
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  /** The chair they are driving; null is watching, which is a thing to be. */
  seatIndex: number | null;
  /** True only of somebody heard from once and then silent. */
  away: boolean;
}

/**
 * The games row minus its secrets, plus what may be said about them.
 *
 * `deck` and `seed` never travel — see `withoutDeck` — and `turn_state` is
 * the stack with anything one seat alone may see taken out. What is left of
 * the decks is the two counts and the top of each used pile.
 */
export interface EnvelopeGame extends Omit<GameRow, "deck" | "seed" | "turn_state"> {
  turn_state: TurnState;
  /** Absent in companion mode, where both piles are physical. */
  deckCounts: {
    events: { draw: number; discard: number };
    spells: { draw: number; discard: number };
  } | null;
  /** The card on top of each stos zużytych, by slice ref, or null. */
  used: { events: string | null; spells: string | null } | null;
}

/** A Zaklęcie spoken and hanging in the air, waiting to be answered (9.6). */
export interface EnvelopeSpoken {
  spell: string;
  name: string;
  /** The seat that spoke it. */
  by: number | null;
  /** The seat it was aimed at, where it was aimed at one. */
  at: number | null;
  /** The clock the browser counts down against. */
  until: number;
}

/** The surplus the whole table is waiting on (5.6, 2.6). */
export interface EnvelopeSurplus {
  seatIndex: number;
  what: "przedmioty" | "zaklecia";
  /** How many have to go — the number to act on, not the number held. */
  over: number;
  /** The sentence, already in the right voice for the device reading it. */
  said: string;
}

/** A Karta lying face up on an Obszar (16.8). */
export interface EnvelopeFieldCard {
  /** The row, because a field can hold two of the same Przedmiot. */
  id: string;
  fieldId: FieldId;
  cardId: CardId;
  /** Conjured by the test console, and marked with the wrench wherever it is drawn. */
  granted?: boolean;
  /** What is left beside a Miejsce that lays points out (16.7). */
  pool?: number;
}

/** Loose Sztuki Złota lying on an Obszar (12.1). */
export interface EnvelopeFieldGold {
  fieldId: string;
  gold: number;
}

export interface Envelope {
  game: EnvelopeGame;
  /** Every device gets it: answering is anybody's to do and the window is on a clock. */
  spoken: EnvelopeSpoken | null;
  /** A table-level fact like `spoken`: while set, every other verb is refused for everybody. */
  surplus: EnvelopeSurplus | null;
  /**
   * Who this device is, as far as the table is concerned — and null when the
   * table has never heard of it. Null means exactly one thing: whoever you
   * were, you are not at this table any more.
   */
  me: EnvelopeUser | null;
  /** Everybody here, seated or watching, in join order. */
  users: EnvelopeUser[];
  mySeatIndex: number | null;
  fieldCards: EnvelopeFieldCard[];
  fieldGold: EnvelopeFieldGold[];
  /** What the Wyposażenie pile still holds (21.2), by card id. */
  stock: Record<string, number>;
  seats: EnvelopeSeat[];
}
