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
export function CardMark({ mark, size = 20 }: { mark: SlotMark; size?: number }) {
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
export function WornMark({ slot, size = 16 }: { slot: Slot; size?: number }) {
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
