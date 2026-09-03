"use client";

/**
 * The things a card can be flagged as, and the one way of drawing each.
 *
 * Its own module because both the tile and the whole Karta draw them, and those
 * two already import each other's types — a runtime import between them would
 * close the loop.
 */

/**
 * Something true of the card in a place, drawn on the corner of its picture.
 *
 * There were two of these built two different ways: "trofeum" as a strip of
 * text across the foot of the picture, and the test mark as an emoji, which
 * could not be coloured at all because an emoji carries its own. They say the
 * same *kind* of thing — this card is not quite an ordinary card — so they are
 * one shape now, drawn from the same masked silhouettes the empty places use.
 */
import { SLOT_LABEL, type Slot } from "@/lib/engine/slots";
import { SLOT_ICON } from "@/lib/view/slotIcons";

/* --------------------------------------------------------------------------
 * Where a mark goes, and how big it is.
 *
 * Eight places were drawing "something small on the corner of a picture" and
 * every one of them wrote out its own box: `absolute bottom-0 right-0 rounded-tl
 * bg-night/85 px-1 py-0.5` and five variations on it. They had already drifted —
 * the take-off cross on a worn Przedmiot padded to `px-1.5` with no `py`, the
 * class numeral in the kolejka dropped the `py` and so stood a different height
 * from the worn mark that shares its corner, and the whole Karta inset its mark
 * by a pixel and rounded all four sides. Two of those are deliberate and one was
 * a slip, and with the geometry written out eight times there is no way to tell
 * which from reading it.
 *
 * So the box is named here, next to the marks that sit in it, and the two
 * deliberate differences become the two values of `on`.
 * ----------------------------------------------------------------------- */

/** Which corner. */
export type CornerAt = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * What it is sitting on, which is what decides how it sits.
 *
 * `tile` is flush into the corner with only the *inner* edge rounded, because a
 * tile is 86px and a mark inset from its corner is a mark eating the picture.
 * `picture` is a whole Karta opened to be read, where the same mark flush to
 * the edge reads as damage to the scan rather than as something the app has
 * added — so it stands a pixel off and rounds all four.
 */
export type CornerOn = "tile" | "picture";

const AT: Record<CornerAt, { tile: string; picture: string }> = {
  "top-left": { tile: "left-0 top-0 rounded-br", picture: "left-1 top-1 rounded" },
  "top-right": { tile: "right-0 top-0 rounded-bl", picture: "right-1 top-1 rounded" },
  "bottom-left": { tile: "bottom-0 left-0 rounded-tr", picture: "bottom-1 left-1 rounded" },
  "bottom-right": { tile: "bottom-0 right-0 rounded-tl", picture: "bottom-1 right-1 rounded" },
};

/**
 * The box, as a class string, for a caller that has to *be* the element.
 *
 * Two of the eight are `<button>`s — taking a Przedmiot off the body, and the
 * arrow that puts one on — and wrapping a button in a positioned span moves the
 * padding off the control and shrinks what you can actually hit. So they take
 * the geometry and keep their own tag, and `Corner` below is the same thing for
 * the six that are content rather than a control.
 */
export function cornerClass(at: CornerAt, on: CornerOn = "tile"): string {
  return `absolute ${AT[at][on]} bg-night/85 px-1 py-0.5`;
}

/** Something small on the corner of a picture. See `cornerClass`. */
export function Corner({
  at,
  on = "tile",
  children,
}: {
  at: CornerAt;
  on?: CornerOn;
  children: React.ReactNode;
}) {
  return <span className={cornerClass(at, on)}>{children}</span>;
}

/**
 * How big a mark is drawn, keyed on the picture it is drawn on.
 *
 * Four numbers and all four were already in the tree, written at the call site:
 * 20 on a tile, 16 for a worn place, 22 in the hover panel, 26 on an opened
 * Karta. Named rather than reduced to one, because a mark holds its share of a
 * picture rather than its absolute size — the same 26 that is right on a Karta
 * 340 across is a sticker on the 86 of a tile.
 *
 * `slot` is the one that is not about the picture. The slot silhouettes are
 * drawn edge to edge in their own box while the badge icons carry their own
 * margin, so at one nominal size the silhouette reads noticeably larger; it
 * runs a size down to land in the same place.
 */
export const MARK_SIZE = {
  /** An 86px art tile. */
  tile: 20,
  /** A slot silhouette, which fills its box — see above. */
  slot: 16,
  /** The Karta in the hover panel, 208 across. */
  hover: 22,
  /** A Karta opened to be read, 340 and up. */
  picture: 26,
} as const;

/**
 * Type in a corner chip, sized to stand beside an icon of the same class.
 *
 * A corner holds one of two things — a masked silhouette, whose size is its
 * box, or a few characters, whose size is an em. Those two numbers are not
 * comparable, which is how the class numeral came to be set at 10px in a chip
 * whose neighbours are 20px icons: it was small enough to read as a footnote on
 * the card rather than as a mark on the tile.
 *
 * The display face is a Didone and its cap height is close to 0.7 of the em, so
 * a numeral set at 0.7 of the icon's box stands about as tall as the icon does.
 * Derived rather than written down, so the two move together.
 */
export function markText(size: number): number {
  return Math.round(size * 0.7);
}

export type SlotMark = "trofeum" | "granted";

const MARK: Record<SlotMark, { icon: string; tone: string; title: string }> = {
  trofeum: {
    icon: "/marks/trofeum.svg",
    tone: "text-ochre",
    title: "Pokonany Wróg — 1.4 wymienia go na punkty Miecza",
  },
  granted: {
    icon: "/marks/granted.svg",
    // The one thing on a card that is not part of the game, in the colour
    // nothing else on a card uses.
    tone: "text-vermilion",
    title: "Karta z trybu testowego — nie pochodzi z talii i nie wróci na stos",
  },
};

/**
 * The mark, at whatever size the thing drawing it wants.
 *
 * A mask rather than an `<img>` or an emoji, for the reason the empty places
 * are: the shape takes the colour of whatever it is standing in, so red is
 * actually red and it dims with the card when the card dims.
 */
export function CardMark({
  mark,
  size = MARK_SIZE.tile,
}: {
  mark: SlotMark;
  size?: number;
}) {
  const { icon, tone, title } = MARK[mark];
  return <Masked icon={icon} tone={tone} title={title} size={size} />;
}

/**
 * Where a card is being worn, drawn on the card (5.6).
 *
 * For the roster, which is the one place somebody's worn Przedmioty are shown
 * without the body they are on: your own are squares on a paper doll, where the
 * place is the position, and a rival's are a plain row of tiles in which a
 * Hełm on the head and a Hełm in the pack looked identical. The same silhouette
 * the empty place would be drawing, so the answer is the picture already
 * learnt.
 *
 * Not `SlotMark`, though it is drawn in the same shape: those two say a card is
 * not quite an ordinary card — conjured, or a corpse — and this says an
 * ordinary card is somewhere in particular. Ochre and not vermilion for the
 * same reason: red is the colour of the one thing on a card that is not part of
 * the game.
 */
export function WornMark({
  slot,
  size = MARK_SIZE.slot,
}: {
  slot: Slot;
  size?: number;
}) {
  return (
    <Masked
      icon={SLOT_ICON[slot]}
      tone="text-ochre/90"
      title={`Założone: ${SLOT_LABEL[slot]}`}
      size={size}
    />
  );
}

/** One silhouette, taking the colour it is given. */
function Masked({
  icon,
  tone,
  title,
  size,
}: {
  icon: string;
  tone: string;
  title: string;
  size: number;
}) {
  return (
    <span
      title={title}
      className={`pointer-events-none inline-flex items-center justify-center ${tone}`}
    >
      <span
        aria-hidden
        style={{
          WebkitMaskImage: `url(${icon})`,
          maskImage: `url(${icon})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          backgroundColor: "currentColor",
          width: size,
          height: size,
        }}
      />
    </span>
  );
}

/**
 * A card that is done with: crossed out where it lies.
 *
 * One mark, two rows that had it separately. `ItemSlot` drew it on a trofeum
 * spent under 1.4 and the kolejka drew it on a Karta that has left the Obszar —
 * a Spotkanie read and discarded, a Wróg beaten and kept (16.2) — and the two
 * were the same four lines with a different colour, which is how they came to
 * disagree: gold in one place and red in the other, for the identical idea.
 *
 * Vermilion, because ochre is this app's word for "you can reach this" and a
 * finished card is the opposite of an offer.
 *
 * Across the picture rather than over the whole tile, so the corner marks and
 * the name below stay readable: this says the card is gone, not that the tile
 * is unreadable. Two lines rather than one, because a bar across a picture
 * reads as a redaction and an X is the mark somebody puts on a thing that is
 * done with.
 *
 * Positioned against whatever it is dropped into, so the caller owns the
 * `relative` and the `overflow-hidden` and this owns everything else about the
 * mark. Both are load-bearing: the strokes are drawn twice as wide as the box
 * and cut back to it, which is what lets one mark sit correctly on boxes of
 * different shapes. It began on the near-square art tile, where 140% of the
 * width already cleared the diagonal; the turn bar's chip is a standee, half
 * as wide as it is tall, and there the same 140% was a small X floating in the
 * middle of a card. Sized off the longer side instead, and the caller's clip
 * decides where it stops.
 */
export function StruckOut() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute left-1/2 top-1/2 h-0.5 w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-vermilion/70" />
      <span className="absolute left-1/2 top-1/2 h-0.5 w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-vermilion/70" />
    </span>
  );
}
