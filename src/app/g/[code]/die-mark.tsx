"use client";

/** The die, wherever a control is about to throw one. */

import { MARK_ICON } from "@/lib/view/fieldMarks";

/**
 * The same die the map draws, at the size of the words beside it.
 *
 * `fieldMarks` owns the drawing — one die in the app, vendored once — and this
 * is the third way it is put on screen: `board-map.tsx` masks it in SVG because
 * the board is SVG, `FieldMarks` masks it in HTML for the drawer's mark row,
 * and a button needs neither of those layouts. What all three share is the
 * mask: the shape takes the colour it is standing in, so a die on „Rzuć kostką"
 * is ochre inside an ochre button and dims with it.
 *
 * `1em`, so it is the height of the label rather than a fixed number of pixels
 * — the same button grammar runs from a decision under a Karta down to a chip
 * in a line of prose, and a 14px die in an 11px row is a sticker.
 *
 * No `title` and no label. The button says „Rzuć kostką" in words right beside
 * it; a tooltip repeating that is the third telling of one fact, and an
 * `aria-label` would make a screen reader read the button's name twice.
 */
export function DieMark() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1.15em] w-[1.15em] shrink-0"
      style={{
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${MARK_ICON.kostka})`,
        maskImage: `url(${MARK_ICON.kostka})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
