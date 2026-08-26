/** Resolves a drawn card to the picture of it, whether the card is known by slice or only by name. */

import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import manifest from "@/data/card-images.json";
import artManifest from "@/data/card-art.json";
import portraits from "@/data/character-images.json";
import standees from "@/data/character-standees.json";
import type { EventCard, Item, Spell } from "@/data/types";
import { cardRef } from "@/lib/engine/deck";
import { RANDOM_CHARACTER_ID } from "@/lib/engine/characters";

/**
 * The shape each family of illustration is exported in.
 *
 * `export-card-art.mjs` settles these where the pictures are made — one crop
 * per family, forced, because a percentage crop of a slice is only as uniform
 * as the slicing. Read them from here rather than writing 240/209 into every
 * box that draws one, which is how the app came to draw 236 Karty Zdarzeń in a
 * box built for the 28 Karty Postaci and crop a quarter off each.
 */
export const ART_RATIO = 240 / 209;
export const CHARACTER_ART_RATIO = 240 / 155;

const AVAILABLE = new Set(manifest as string[]);
const ART_AVAILABLE = new Set(artManifest as string[]);

/**
 * The "Losowa" card, drawn rather than scanned.
 *
 * Written here instead of in `character-images.json` and its neighbour because
 * those two files are *generated*: `export-card-images.mjs` builds them from
 * the 27 printed characters, so an entry added by hand would survive exactly
 * until the next time anybody ran the script. This card was never on a sheet,
 * so it has no slice reference and nothing to be regenerated from.
 *
 * Cut to the same sizes as the real thing — 629x780 and 249x420 — so it needs
 * no special handling anywhere it is drawn.
 */
const RANDOM_CARD = {
  karta: "/cards/karta-random.jpg",
  standee: "/cards/standee-random.jpg",
  art: "/cards/art/karta-random.jpg",
} as const;

/**
 * First slice for each card id.
 *
 * Companion mode identifies a card by name, so all four copies of "1 SZTUKA
 * ZŁOTA" arrive as the same id with no way to tell which was drawn — and it
 * does not matter, because the copies are identical. Simulation mode knows
 * exactly which slice came off the deck and says so.
 */
const FIRST_SLICE_BY_ID = new Map<string, string>();
// Events, spells and equipment all live on different sheets and were being
// looked up in only the first of the three — so every Zaklęcie in a player's
// hand and every bought Przedmiot came back without a picture, despite all
// sixty of them having been exported.
for (const card of [
  ...(events as EventCard[]),
  ...(spells as Spell[]),
  ...(items as Item[]),
]) {
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
  if (characterId === RANDOM_CHARACTER_ID) return RANDOM_CARD.karta;
  const slice = (portraits as Record<string, string>)[characterId];
  if (!slice) return null;
  return `/cards/${fileNameFor(slice)}.jpg`;
}

/**
 * The mała Karta Postaci — the illustration-only card that goes in a plastic
 * stand and stands on the board.
 *
 * The rulebook makes this a separate object from the big card: «Kartę Postaci
 * […] w dwóch formach: dużych Kart, zawierających ilustrację i opis oraz małych
 * Kart, na których znajduje się tylko ilustracja», and it is the small one that
 * a player points at to mean "me". So anywhere a character appears at thumbnail
 * size, this is the right picture: the big card at that size is a page of
 * unreadable print, and the small one is a figure you recognise at a glance.
 */
export function characterStandeeUrl(characterId: string): string | null {
  if (characterId === RANDOM_CHARACTER_ID) return RANDOM_CARD.standee;
  const slice = (standees as Record<string, string>)[characterId];
  if (!slice) return null;
  return `/cards/${fileNameFor(slice)}.jpg`;
}

/**
 * Just the illustration off a card, with no title, frame or text.
 *
 * Every card in the box is a header, a title, a framed picture and a block of
 * prose, and at icon size only the picture survives — the title is four pixels
 * tall and the text is a grey smear. So where a whole card will not fit, this
 * is what goes there instead: `scripts/export-card-art.mjs` cuts the same
 * rectangle out of all of them.
 *
 * Falls back to the whole card, because four cards have no illustration to cut
 * out: the Dobry/Zły markers are a word in a box.
 */
export function cardArtUrl(cardId: string, ref?: string): string | null {
  const slice = ref && ART_AVAILABLE.has(ref) ? ref : FIRST_SLICE_BY_ID.get(cardId);
  if (slice && ART_AVAILABLE.has(slice)) return `/cards/art/${fileNameFor(slice)}.jpg`;
  return cardImageUrl(cardId, ref);
}

/** The illustration off a character's big card, for the same reasons. */
export function characterArtUrl(characterId: string): string | null {
  if (characterId === RANDOM_CHARACTER_ID) return RANDOM_CARD.art;
  const slice = (portraits as Record<string, string>)[characterId];
  if (slice && ART_AVAILABLE.has(slice)) return `/cards/art/${fileNameFor(slice)}.jpg`;
  return characterImageUrl(characterId);
}

/**
 * The two faces the box prints for 7.2, and the third it does not.
 *
 * "Gdy Postać zmienia swoją Naturę, obok jej Karty musi zostać umieszczona
 * Karta Zmiany Natury... by ukazywała nową Naturę Postaci (właściwym napisem ku
 * górze)" — one piece of card printed `Zły` on one side and `DOBRY` on the
 * other, turned to whichever is true and taken away when a character returns to
 * what its own Karta prints.
 *
 * Chaotyczny is drawn rather than scanned, and it is drawn because the app is
 * not a table. At a table the third Natura is *the card being absent*, which
 * works because the Karta Postaci is right there saying what the character
 * started as. A referee that owns the record has to be able to say which Natura
 * is true without asking anybody to do that subtraction — so it gets a face
 * too, set to match the printed one. See `scripts/export-nature-card.mjs`.
 */
const NATURE_FACE: Record<string, string> = {
  good: "dobry",
  evil: "zly",
  chaotic: "chaotyczny",
};

export function natureCardUrl(nature: string | null): string | null {
  const face = nature === null ? undefined : NATURE_FACE[nature];
  return face ? `/cards/natura-${face}.jpg` : null;
}

/** What `export-nature-card.mjs` cuts every plaque to. */
export const NATURE_CARD_RATIO = 260 / 90;
