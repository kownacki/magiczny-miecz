/** The card index and the two shuffled piles: which copy of which card exists, and where it is. */

import events from "@/data/events.json";
import spellsData from "@/data/spells.json";
import type { EventCard, Spell } from "@/data/types";
import { buildDeck, cardRef, shuffleWith, type DeckState } from "@/lib/engine/deck";

export const EVENTS = events as EventCard[];
export const SPELLS = spellsData as Spell[];

/** Card lookup by slice reference — the only key that distinguishes duplicates. */
export const BY_REF = new Map(EVENTS.map((card) => [cardRef(card.source), card]));
export const SPELL_BY_REF = new Map(SPELLS.map((s) => [cardRef(s.source), s]));

// Duplicated spells share an id, so first-wins is the right and only sensible
// reading — the copies are the same card.
export const SPELL_BY_ID = new Map<string, Spell>(SPELLS.map((s) => [s.id, s] as const));

/**
 * Every copy of every card, by id — the lookup a discard needs.
 *
 * Drawing knows the ref and forgets it: a `holdings` row and a `field_cards`
 * row both store an id, because a player holds "the Magiczny Miecz", not
 * "zdarzenia-4#11". Returning one to the used pile has to name a copy again,
 * and `returningRef` picks whichever copy the piles are not already counting.
 */
export const EVENT_COPIES = new Map<string, string[]>();
for (const card of EVENTS) {
  const list = EVENT_COPIES.get(card.id) ?? [];
  list.push(cardRef(card.source));
  EVENT_COPIES.set(card.id, list);
}

export const SPELL_COPIES = new Map<string, string[]>();
for (const card of SPELLS) {
  const list = SPELL_COPIES.get(card.id) ?? [];
  list.push(cardRef(card.source));
  SPELL_COPIES.set(card.id, list);
}

/**
 * The shuffle bound to real randomness.
 *
 * This is the whole of what simulation mode adds over companion mode: the app
 * decides which card comes up instead of a human naming the one they drew. The
 * rules either side of it are identical, which is why the engine never learns
 * which mode it is running in.
 *
 * Still bound at module load, which is the one thing here a test cannot reach
 * past. Nothing in the converted commands draws — they only discard, and
 * `discardTo` does not shuffle — so it is left alone until the draw path moves
 * across and can take a `Shuffle` the way the commands take a `RandomPort`.
 */
export const shuffle = shuffleWith(Math.random);

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

export function decksOf(game: { deck: unknown }): Decks {
  const stored = game.deck as Partial<Decks> | null;
  if (!stored?.events) return freshDecks();
  return {
    events: stored.events,
    spells: stored.spells ?? buildDeck(SPELLS.map((c) => cardRef(c.source)), shuffle),
  };
}
