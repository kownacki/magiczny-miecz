/** Resolves a drawn card to the picture of it, whether the card is known by slice or only by name. */

import events from "@/data/events.json";
import spells from "@/data/spells.json";
import items from "@/data/items.json";
import manifest from "@/data/card-images.json";
import artManifest from "@/data/card-art.json";
import portraits from "@/data/character-images.json";
import standees from "@/data/character-standees.json";
import markers from "@/data/markers.json";
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

/**
 * How wide a card is drawn as a tile, everywhere.
 *
 * There were two of these — `CardTile`'s 92 and `ItemSlot`'s 86 — for the same
 * idea, so the row of Karty on an Obszar and the row in the Plecak were six
 * pixels apart and read as two different kinds of thing. One number, and the
 * art's height derived from it rather than written down beside it.
 */
export const TILE_WIDTH = 86;

/**
 * The space a row leaves between two tiles, as a number.
 *
 * `TILE_GAP.card` in `tile-row.tsx` is the same eight pixels as the Tailwind
 * class `gap-2`, and a class name cannot be divided into. Here beside the width
 * it is measured against, because the two are one fact: a row of N tiles is
 * `N * TILE_WIDTH + (N - 1) * TILE_GAP_PX` wide, and everything that has to fit
 * that row — the gold pile most of all — needs both halves.
 */
export const TILE_GAP_PX = 8;

/**
 * How wide a left-hand drawer holding N tiles across is.
 *
 * N x `TILE_WIDTH` + (N-1) x `TILE_GAP_PX` for the row itself, + the padding
 * either side, + 1 for the border, + the scrollbar. That last term is
 * the one that cannot be a measurement: a scrollbar is reserved in *device*
 * pixels, so its size in the CSS pixels this sum is written in grows as the
 * reader zooms out. A width that just cleared it at 100% would be one tile too
 * narrow at 90%, which is not a width so much as arithmetic that holds at one
 * zoom level. So the term is the bar at 100% plus a margin, and it is the
 * margin that absorbs the zoom.
 *
 * 15 for the bar — the platform's width, measured in Chrome 152 as
 * `offsetWidth - clientWidth` on a scrolling box — and 1 for the margin.
 *
 * The margin was 8 for a long time, and the reasoning was the zoom: a bar is
 * reserved in *device* pixels, so at 90% it is 16.7 of the CSS pixels this sum
 * is written in, and a margin is what absorbs that. What it also does is show,
 * as a gap past the last tile that a reader can measure by eye — which is what
 * a shelf laid out to hold exactly five looks wrong for. 1 keeps the arithmetic
 * from landing exactly on the bar and nothing else.
 *
 * What that costs is the zoom, and it costs less than it looks: the rows are
 * `columns` of `1fr` rather than a wrapping flex row (see `TileRow`), so a
 * drawer a pixel or two short of its five tiles draws five slightly closer
 * together rather than four and a hole.
 *
 * The padding is a parameter because not every drawer wraps its row in the same
 * chrome. Most put the tiles straight inside `px-4` and 32 is the whole of it;
 * the roster puts each player in a box of their own, and the row is three boxes
 * deep by the time it is drawn.
 */
export function shelfWidth(tiles: number, sides = 32): number {
  return tiles * TILE_WIDTH + (tiles - 1) * TILE_GAP_PX + sides + 1 + 16;
}

/**
 * Five across: the Księga's shelf, and the board column's floor.
 *
 * The catalogue is the reason for five. It is 267 cards read by scanning, and
 * how many fit on a line is the whole of how fast that goes. The board column
 * takes the same number because the map may not be narrower than the widest
 * drawer laid over it, or a drawer opened on a small window eats the column
 * that holds your Postać and your purse.
 */
export const SHELF_WIDTH = shelfWidth(5);

/**
 * Three across: the Obszar.
 *
 * It is not a catalogue. What an Obszar holds is a handful — 13.4 deals three
 * Karty at the most and the shelves under "Na tym Obszarze" are rarely more
 * than a row — so five tiles' worth of width was mostly empty, on a drawer laid
 * over the board the whole time you are reading it. Three fits what is
 * genuinely there and gives the map back two tiles of screen.
 *
 * The count is exported and not only the width, because things drawn *inside*
 * the drawer are measured in tiles rather than pixels: the gold pile fills the
 * row it is in, and a row of three is eighteen coins where a row of five was
 * thirty. See `FieldGold`.
 */
export const OBSZAR_TILES = 3;
export const OBSZAR_WIDTH = shelfWidth(OBSZAR_TILES);
/**
 * Three across again: the roster.
 *
 * The same row of three as the Obszar, so the two drawers read as two of a
 * kind — and ten pixels wider, because in here the row is not laid straight
 * into the drawer. Each player is a box of their own, and between the tiles and
 * the drawer's edge there is the column's `p-3`, that box's border, and the
 * open panel's `px-2`: 21 a side against the Obszar's 16.
 *
 * It used to take the Księga's five-tile width, on the reading that the widest
 * thing in a seat is no longer the row of three — a seat carries effect tiles
 * and their durations in words now. It is still not, but five tiles' worth of
 * drawer for a panel of text is two tiles of board given away, and the roster
 * lies over the board like the Obszar does.
 *
 * Measured rather than reasoned: the narrowest width that keeps three tiles on
 * one line through this chain is 317 plus the scrollbar's 16.
 */
export const PLAYERS_WIDTH = shelfWidth(OBSZAR_TILES, 2 * (12 + 1 + 8));

export const TILE_ART_HEIGHT = Math.round(TILE_WIDTH / ART_RATIO);

/**
 * A mark beside a name: the same illustration at a fraction of a tile.
 *
 * Lived in `effect-mark.tsx` with its height worked out beside it. Here now
 * because a second thing wants to be "as tall as one of those" — the deal's
 * face-down Karty under an Obszar's name — and two components deriving the
 * same height from the same ratio in two places is how they come to differ.
 */
export const MARK_WIDTH = 40;
export const MARK_ART_HEIGHT = Math.round(MARK_WIDTH * (TILE_ART_HEIGHT / TILE_WIDTH));

/**
 * A whole Karta, back or front, as the printed cards are cut.
 *
 * Not `ART_RATIO`, which is the framed illustration *inside* a card. A card
 * back has no illustration and no frame — it is the whole rectangle — so
 * anything drawing one needs this shape and not that one.
 */
export const CARD_RATIO = 154 / 92;

/**
 * How many Karta tiles fit across a box, which is the unit a panel's width is
 * really in.
 *
 * The Obszar's window is `max-w-lg` with `px-4`, so its body is 480 and holds
 * five. That number decides how wide the gold pile may grow before it stops
 * counting, and deriving it means a panel that changes width moves the pile
 * with it rather than leaving a constant that used to be right.
 */
export function tilesAcross(px: number): number {
  return Math.max(1, Math.floor((px + TILE_GAP_PX) / (TILE_WIDTH + TILE_GAP_PX)));
}
/**
 * The mała Karta Postaci, not a crop of the duża one.
 *
 * There used to be a `karta-*` under `/cards/art/`, cut at 240x155 — the
 * Zdarzenia illustration rectangle laid over a card that is not a Karta
 * Zdarzeń, so it took the picture and a strip of the Charakterystyka under it
 * and every character in the Księga was a portrait with two lines of print
 * sliced through the middle. The box already prints the picture on its own,
 * on a separate card, for exactly this purpose: «małych Kart, na których
 * znajduje się tylko ilustracja». So the tiles use that, and the miscut files
 * are gone rather than left lying around to be picked up again.
 */
export const CHARACTER_ART_RATIO = 249 / 420;

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
  // The standee IS the character's art — see `CHARACTER_ART_RATIO`. The whole
  // Karta only where a character has no standee, which is nowhere today.
  return characterStandeeUrl(characterId) ?? characterImageUrl(characterId);
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

/**
 * The printed card's own proportions, turned on its side.
 *
 * The Karta Zmiany Natury is a card like the rest of them and is exactly as
 * proportioned as one — 398 by 705 off the scan — just lying down. It lies down
 * because `CHAOTYCZNY` is twice the word `DOBRY` is: standing up, at one size,
 * it had to be set half as tall as its neighbours to fit, which reads as a
 * caption rather than as the same kind of object.
 *
 * Turning it is only possible because the frame is built from the printed
 * card's four corners rather than cut from it whole — see
 * `scripts/export-nature-card.mjs`, which measures these two numbers off the
 * sheet on every run and says so if they ever move.
 */
export const NATURE_CARD_RATIO = 705 / 398;

export function natureCardUrl(nature: string | null): string | null {
  const face = nature === null ? undefined : NATURE_FACE[nature];
  return face ? `/cards/natura-${face}.jpg` : null;
}

/**
 * What a card the browser is holding looks like, whichever family it is from.
 *
 * A Karta Postaci and a Karta Zdarzeń are looked up in different places and
 * `demon` and `czarodziej` each name one of each — so the id alone hands back
 * the wrong picture rather than none, which is the failure hardest to notice.
 * Every caller therefore carried the same `card.character ? … : …` branch, in
 * three places and twice per place: once for the whole card and once for the
 * illustration cut out of it.
 *
 * Taking the flag and the two ids together means a caller cannot pick the
 * lookup and the id out of step.
 */
export interface CardArt {
  cardId: string;
  ref?: string;
  character?: boolean;
}

/** The whole card, framed, as it is printed. */
export function faceFor(card: CardArt): string | null {
  return card.character ? characterImageUrl(card.cardId) : cardImageUrl(card.cardId, card.ref);
}

/** Just the illustration, for where a whole card would be a grey smear. */
export function artFor(card: CardArt): string | null {
  return card.character ? characterArtUrl(card.cardId) : cardArtUrl(card.cardId, card.ref);
}

/* --------------------------------------------------------------------------
 * 20.1's swap.
 * ----------------------------------------------------------------------- */

/**
 * The Karta the box puts on the board in place of a figure (20.1).
 *
 * „Jeżeli Postać zostanie na 3 tury Zamieniona w Kamień, reprezentującą ją na
 * planszy Kartę należy zamienić na Kartę Zamieniony w Kamień." That is a
 * *component* instruction, and it is the whole of what the rule asks a table to
 * do — everything else in chapter 20 is what the app already enforces. So it is
 * the one part of Kamień that has to be drawn rather than computed.
 *
 * There are four of them printed and they are identical, so the first is the
 * card: `markers.json` records all four because the sheet does, and nothing
 * here is choosing between copies. Read off that file rather than written down,
 * so the slice moves with the transcription if the sheet is ever re-cut.
 *
 * The card's own printed title is `ZAKLĘTY W KAMIEŃ` and the rulebook's chapter
 * heading is `ZAMIENIONY W KAMIEŃ` — the box disagrees with itself, and both
 * are kept where they belong: the name here is the paper's, and the app's own
 * copy (the effect's label, the journal, the refusals) says the Instrukcja's.
 */
const STONE_MARKER = markers.stone[0];
const STONE_SLICE = cardRef(STONE_MARKER.source);

export const STONE_CARD = {
  cardId: STONE_MARKER.id,
  name: STONE_MARKER.name,
  text: STONE_MARKER.text,
  ref: STONE_SLICE,
} as const;

/**
 * What stands for a seat on the board: its mała Karta Postaci, or the Kamień
 * card standing in its place.
 *
 * One function because the swap has to happen in every place a figure is drawn
 * or it happens in none of them — the turn bar, the roster and the Obszar all
 * draw the same object and all three had their own `characterStandeeUrl` call.
 *
 * The two pictures are cut to different rectangles and it does not matter: 516
 * by 880 against the standee's 249 by 420 is 0.586 against 0.593, a percent
 * apart, which `object-cover` takes off the sides of a card that has nothing
 * printed there. So the Kamień card goes in the figure's own box rather than
 * every box that holds a figure learning a second shape.
 */
export function figureUrl(characterId: string | null, stone: boolean): string | null {
  if (stone) return cardImageUrl(STONE_CARD.cardId, STONE_CARD.ref);
  return characterId ? characterStandeeUrl(characterId) : null;
}
