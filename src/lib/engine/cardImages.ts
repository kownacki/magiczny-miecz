/** Resolves a drawn card to the picture of it, whether the card is known by slice or only by name. */

import events from "@/data/events.json";
import manifest from "@/data/card-images.json";
import portraits from "@/data/character-images.json";
import type { EventCard } from "@/data/types";
import { cardRef } from "./deck";

const AVAILABLE = new Set(manifest as string[]);

/**
 * First slice for each card id.
 *
 * Companion mode identifies a card by name, so all four copies of "1 SZTUKA
 * ZŁOTA" arrive as the same id with no way to tell which was drawn — and it
 * does not matter, because the copies are identical. Simulation mode knows
 * exactly which slice came off the deck and says so.
 */
const FIRST_SLICE_BY_ID = new Map<string, string>();
for (const card of events as EventCard[]) {
  const ref = cardRef(card.source);
  if (!FIRST_SLICE_BY_ID.has(card.id)) FIRST_SLICE_BY_ID.set(card.id, ref);
}

/**
 * Where to find the picture of a card, or null when none was exported.
 *
 * Null is a normal answer, not a failure: the images are generated from scans
 * that are not in the repository, so a fresh checkout has none until someone
 * runs the pipeline. Callers fall back to the transcribed text, which is
 * always present.
 */
export function cardImageUrl(cardId: string, ref?: string): string | null {
  const slice = ref && AVAILABLE.has(ref) ? ref : FIRST_SLICE_BY_ID.get(cardId);
  if (!slice || !AVAILABLE.has(slice)) return null;
  return `/cards/${fileNameFor(slice)}.jpg`;
}

/**
 * A slice reference names its index bare ("zdarzenia-8#5") but the exported
 * files zero-pad it ("zdarzenia-8-05.jpg"), because they are named after the
 * slices the extractor wrote and it pads for sortability.
 *
 * Forgetting the padding broke the image for every card with an index below
 * ten — nine of every twenty — while leaving the rest working, which is exactly
 * the sort of half-broken that survives a spot check.
 */
function fileNameFor(slice: string): string {
  const [sheet, index] = slice.split("#");
  return `${sheet}-${index.padStart(2, "0")}`;
}

/**
 * The portrait on a character's own card.
 *
 * Characters are addressed by id throughout — a player picks "krasnolud", not a
 * slice — so this is a separate map rather than a special case of the card
 * lookup.
 */
export function characterImageUrl(characterId: string): string | null {
  const slice = (portraits as Record<string, string>)[characterId];
  if (!slice) return null;
  return `/cards/${fileNameFor(slice)}.jpg`;
}
