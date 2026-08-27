/**
 * What a square looks like under the pointer, everywhere a card can be reached.
 *
 * The Księga's tiles had it and the Plecak's did not, which read as the pack
 * being the inert half of the screen — the opposite of what is true, since it
 * is the only half you can actually pick things up from. Two components draw
 * cards in squares and they had drifted, so the answer lives in one place and
 * both say it.
 *
 * A ring rather than a thicker border. A border that grows on hover moves
 * everything inside it by a pixel, and a row of cards that all shift as the
 * pointer crosses them is exactly the shiver the pack spent a day getting rid
 * of. `ring` is painted outside the box and costs no layout at all, so the gold
 * reads as thicker and nothing moves.
 */
export const PICKABLE =
  "transition hover:border-ochre hover:ring-1 hover:ring-ochre/60";
