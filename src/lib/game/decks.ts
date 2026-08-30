/** The card index and the two shuffled piles: which copy of which card exists, and where it is. */

import events from "@/data/events.json";
import spellsData from "@/data/spells.json";
import type { EventCard, Spell } from "@/data/types";
import { buildDeck, cardRef, shuffleWith, type DeckState, type Shuffle } from "@/lib/engine/deck";
import { streamFor } from "@/lib/engine/prng";

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
 * Still bound at module load, and now the fallback rather than the rule: a game
 * with a seed gets `shuffleFor` below instead. This is what a table opened
 * before the seed column existed still uses, and it is why those games cannot
 * be replayed — their shuffles were never written down anywhere.
 */
export const shuffle = shuffleWith(Math.random);

/**
 * The shuffle for one moment in one game.
 *
 * Keyed on the game's seed and the revision it is happening at, so replaying
 * the game reaches the same order — and so two piles turned over at different
 * moments do not come back the same way. See `prng.ts` for why a game has a
 * seed at all.
 *
 * The bargain in `commands/draw.ts` is unchanged: the rule decides *whether*
 * the pile is turned over, the edge decides what order it comes back in. All
 * that has changed is that the edge can now be asked twice.
 */
export function shuffleFor(game: { seed: string | null; revision: number }): Shuffle {
  return game.seed === null ? shuffle : shuffleWith(streamFor(game.seed, game.revision));
}

export interface Decks {
  events: DeckState;
  spells: DeckState;
}

export function freshDecks(order: Shuffle = shuffle): Decks {
  return {
    events: buildDeck(EVENTS.map((card) => cardRef(card.source)), order),
    spells: buildDeck(SPELLS.map((card) => cardRef(card.source)), order),
  };
}

export function decksOf(game: { deck: unknown; seed?: string | null; revision?: number }): Decks {
  const stored = game.deck as Partial<Decks> | null;
  // The thread `commands/draw.ts` said could not be cut from there: a row with
  // no pile builds one here. Seeded too when the game has a seed, so the one
  // branch that used to reach `Math.random` behind everything's back no longer
  // does.
  if (!stored?.events) {
    return freshDecks(
      typeof game.revision === "number" && game.seed !== undefined
        ? shuffleFor({ seed: game.seed, revision: game.revision })
        : shuffle,
    );
  }
  return {
    events: stored.events,
    spells: stored.spells ?? buildDeck(SPELLS.map((c) => cardRef(c.source)), shuffle),
  };
}

/**
 * What is in a pile, top first, as names rather than slice refs.
 *
 * For the console's `pile`, and deliberately nowhere near a browser: the draw
 * order is the one thing in a simulated game that must not leak, for the same
 * reason `games.seed` must not. Knowing the next four Karty Zdarzeń is knowing
 * whether to explore, and a referee that tells you is not refereeing.
 *
 * Refs rather than ids in the piles because the box has genuine duplicates —
 * four Magiczne Miecze, fifteen 1 SZTUKA ZŁOTA — so the same name appears as
 * many times in this list as there are copies left, which is the truth about
 * the pile and not a bug in the listing.
 */
export function pileContents(
  game: { deck: unknown; seed?: string | null; revision?: number },
  pile: "events" | "spells",
): { draw: { id: string; name: string }[]; discard: { id: string; name: string }[] } {
  const byRef = pile === "events" ? BY_REF : SPELL_BY_REF;
  const named = (refs: readonly string[]) =>
    refs.map((ref) => {
      const card = byRef.get(ref);
      return { id: card?.id ?? ref, name: card?.name ?? ref };
    });
  const deck = decksOf(game)[pile];
  return { draw: named(deck.draw), discard: named(deck.discard) };
}
