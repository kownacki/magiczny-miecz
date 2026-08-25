"use client";

/**
 * The two things a card can be flagged as, and the one way of drawing them.
 *
 * Its own module because both the tile and the whole Karta draw it, and those
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
export function CardMark({ mark, size = 18 }: { mark: SlotMark; size?: number }) {
  const { icon, tone, title } = MARK[mark];
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
