/** The drawing for each place on the body — a picture of the place, not of what is in it. */

import type { Slot } from "@/lib/engine/slots";

/**
 * Silhouettes from game-icons.net (CC BY 3.0 — see README), used as masks so
 * they take the colour of whatever is drawing them. They were Unicode glyphs,
 * which meant a helmet where the font happened to have a helmet, a chess knight
 * standing in for a horse and a shaded square standing in for a bag. These are
 * drawings of the eleven things.
 *
 * Deliberately not the cards' own illustrations, though every one of them is
 * exported and to hand: those are white-on-black hatched engravings, and a
 * ghost of one reads as a card already in the place rather than as the shape of
 * the place itself.
 *
 * In `view/` rather than beside the paper doll, which is where it was written
 * and where it stopped being only the doll's: the roster marks a worn card with
 * the place it is worn in, and two lists of eleven file names is one to keep in
 * step. Asset paths are this directory's whole business.
 */
export const SLOT_ICON: Record<Slot, string> = {
  head: "/slots/glowa.svg",
  amulet: "/slots/amulet.svg",
  body: "/slots/tulow.svg",
  "main-hand": "/slots/reka-glowna.svg",
  "off-hand": "/slots/reka-pomocnicza.svg",
  gloves: "/slots/rekawice.svg",
  ring: "/slots/pierscien.svg",
  mount: "/slots/wierzchowiec.svg",
  pouch: "/slots/sakwa.svg",
  "magiczny-miecz": "/slots/magiczny-miecz.svg",
  "tarcza-tolimana": "/slots/tarcza-tolimana.svg",
};
