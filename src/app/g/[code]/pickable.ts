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

/**
 * The gold a card rests at, before the pointer thickens it.
 *
 * The other half of the same rule, and it was the half still drifting: the pack
 * and the trofea rested gold while the Księga's tiles and the lobby's standees
 * rested `border-edge`, so the same object — a picture cut off a card, which
 * you can point at and get the whole card — was drawn two ways depending on
 * which panel it landed in. Gold at rest is the honest one: these tiles all
 * *do* something, and grey is what the rest of the app spends on things that do
 * not.
 *
 * Narrow, at 60% — the full ochre is reserved for the pointer, so hovering
 * still has somewhere to go. Together with `PICKABLE` that is the whole
 * vocabulary: **thin gold means you can reach it, thicker gold means you are.**
 *
 * Not for a square with nothing in it. `ItemSlot`'s `empty` is dashed and grey
 * on purpose, and a vacant place is not a card.
 */
export const ART_BORDER = "border-ochre/60";

/**
 * Selection is a tint, not a border. See `WASH` in `item-slot.tsx`.
 *
 * There was a `PICKED` here — the hover's own weight, ring and all, spent on a
 * card the player had chosen. It read well and was still wrong: a chosen card
 * and a hovered card were bidding for the same edge, so the pointer had
 * nowhere louder to go over something already picked. Colouring the paper
 * instead leaves the border to answer the pointer and nothing else, which is
 * what it does everywhere else in the app.
 */
